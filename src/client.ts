import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { LinearClient, LinearGraphQLClient, type LinearRawResponse } from '@linear/sdk';

const GLOBAL_CONFIG_PATH = join(homedir(), '.pi', 'agent', 'linear.json');

export const NO_API_KEY_MESSAGE =
    'Linear API key not configured. Run `/linear login <key>` to set it up. ' +
    'Get your key from Linear Settings → API → Personal API Keys.';

// ── Key resolution ─────────────────────────────────────────────────

function readJsonFile(path: string): Record<string, unknown> | null {
    try {
        return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
        return null;
    }
}

function tryReadKey(path: string): string | null {
    const config = readJsonFile(path);
    if (config?.apiKey && typeof config.apiKey === 'string') {
        return config.apiKey;
    }
    return null;
}

export function resolveApiKey(cwd?: string): string | null {
    // 1. Project-local: {cwd}/.pi/linear.json
    if (cwd) {
        const localKey = tryReadKey(join(cwd, '.pi', 'linear.json'));
        if (localKey) return localKey;
    }

    // 2. Global: ~/.pi/agent/linear.json
    const globalKey = tryReadKey(GLOBAL_CONFIG_PATH);
    if (globalKey) return globalKey;

    // 3. Environment variable
    const envKey = process.env.LINEAR_API_KEY;
    if (envKey) return envKey;

    return null;
}

// ── Persisting keys ────────────────────────────────────────────────

export function saveApiKey(apiKey: string, cwd?: string): string {
    const targetPath = cwd ? join(cwd, '.pi', 'linear.json') : GLOBAL_CONFIG_PATH;

    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, `${JSON.stringify({ apiKey }, null, 2)}\n`);

    return targetPath;
}

// ── Client singleton ───────────────────────────────────────────────

let instance: LinearService | null = null;

export class LinearService {
    private _clients = new Map<string, LinearClient>();
    private _graphQLClients = new Map<string, LinearGraphQLClient>();

    private constructor() {}

    static getInstance(): LinearService {
        if (!instance) {
            instance = new LinearService();
        }
        return instance;
    }

    static resetInstance(): void {
        instance = null;
    }

    /** Returns true if an API key is resolvable (with or without cwd). */
    hasApiKey(cwd?: string): boolean {
        return resolveApiKey(cwd) !== null;
    }

    /** Returns an SDK client for the resolved key. Cache keyed by the resolved apiKey value. */
    sdkFor(cwd?: string): LinearClient {
        const apiKey = resolveApiKey(cwd);
        if (!apiKey) {
            throw new Error(NO_API_KEY_MESSAGE);
        }

        const existing = this._clients.get(apiKey);
        if (existing) return existing;

        const client = new LinearClient({ apiKey });
        this._clients.set(apiKey, client);
        return client;
    }

    /** Returns a raw GraphQL client for the resolved key. */
    graphQLClientFor(cwd?: string): LinearGraphQLClient {
        const apiKey = resolveApiKey(cwd);
        if (!apiKey) {
            throw new Error(NO_API_KEY_MESSAGE);
        }

        const existing = this._graphQLClients.get(apiKey);
        if (existing) return existing;

        const client = new LinearGraphQLClient('https://api.linear.app/graphql', {
            headers: { Authorization: apiKey }
        });
        this._graphQLClients.set(apiKey, client);
        return client;
    }

    async rawRequest<Data, Variables extends Record<string, unknown>>(
        query: string,
        variables?: Variables
    ): Promise<LinearRawResponse<Data>> {
        return this.graphQLClientFor().rawRequest<Data, Variables>(query, variables);
    }
}
