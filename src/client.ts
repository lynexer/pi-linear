import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { LinearClient, LinearGraphQLClient, type LinearRawResponse } from '@linear/sdk';

let instance: LinearService | null = null;

const CONFIG_PATH = join(homedir(), '.pi', 'agent', 'linear.json');

function readConfigFile(): string | null {
    try {
        const raw = readFileSync(CONFIG_PATH, 'utf-8');
        const config = JSON.parse(raw);

        if (config.apiKey && typeof config.apiKey === 'string') {
            return config.apiKey;
        }

        return null;
    } catch {
        return null;
    }
}

function resolveApiKey(): string {
    const fileKey = readConfigFile();
    if (fileKey) return fileKey;

    const envKey = process.env.LINEAR_API_KEY;
    if (envKey) return envKey;

    throw new Error(
        'Linear API key not found. Set it via one of:\n' +
            `  - ${CONFIG_PATH}: { "apiKey": "lin_api_..." }\n` +
            '  - /linear login <key> (sets it up for you)\n' +
            '  - LINEAR_API_KEY environment variable\n' +
            'Get your key from Linear Settings → API → Personal API Keys.'
    );
}

export function saveApiKey(apiKey: string): string {
    mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    writeFileSync(CONFIG_PATH, `${JSON.stringify({ apiKey }, null, 2)}\n`);

    return CONFIG_PATH;
}

export class LinearService {
    private _client: LinearClient | null = null;
    private _graphQLClient: LinearGraphQLClient | null = null;
    private _apiKey: string;

    private constructor() {
        this._apiKey = resolveApiKey();
    }

    static getInstance(): LinearService {
        if (!instance) {
            instance = new LinearService();
        }

        return instance;
    }

    static resetInstance(): void {
        instance = null;
    }

    get sdk(): LinearClient {
        if (!this._client) {
            this._client = new LinearClient({ apiKey: this._apiKey });
        }

        return this._client;
    }

    get graphQLClient(): LinearGraphQLClient {
        if (!this._graphQLClient) {
            this._graphQLClient = new LinearGraphQLClient('https://api.linear.app/graphql', {
                headers: {
                    Authorization: this._apiKey
                }
            });
        }

        return this._graphQLClient;
    }

    async rawRequest<Data, Variables extends Record<string, unknown>>(
        query: string,
        variables?: Variables
    ): Promise<LinearRawResponse<Data>> {
        return this.graphQLClient.rawRequest<Data, Variables>(query, variables);
    }
}
