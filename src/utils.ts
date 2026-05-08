import type { Issue, LinearClient } from '@linear/sdk';
import type { AgentToolResult, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { LinearService, NO_API_KEY_MESSAGE } from './client';

export function errorResult(message: string): AgentToolResult<Record<string, never>> {
    return {
        content: [{ type: 'text', text: message }],
        details: {},
        terminate: false
    };
}

export function notFoundResult(
    entityType: string,
    identifier: string
): AgentToolResult<Record<string, never>> {
    return errorResult(`${entityType} \`${identifier}\` not found.`);
}

export async function resolveIssueByIdentifier(
    sdk: LinearClient,
    issueId: string
): Promise<Issue | null> {
    const parts = issueId.split('-');
    if (parts.length < 2) return null;

    const teamKey = parts[0];
    const issueNumber = parseInt(parts.slice(1).join('-'), 10);
    if (Number.isNaN(issueNumber)) return null;

    const results = await sdk.issues({
        first: 1,
        filter: {
            team: { key: { eq: teamKey } },
            number: { eq: issueNumber }
        }
    });

    return results.nodes[0] ?? null;
}

export function formatIssueLine(issue: {
    identifier: string;
    title: string;
    url: string;
    state?: { name: string } | null;
    assignee?: { name: string } | null;
    team?: { key: string } | null;
    priorityLabel: string;
}): string {
    const status = issue.state?.name ?? 'Unknown';
    const assignee = issue.assignee?.name ?? 'Unassigned';
    const team = issue.team?.key ?? '?';
    return (
        `- **${issue.identifier}**: ${issue.title} [${status}] (${team}, ${assignee})\n` +
        `  ${issue.url}`
    );
}

export function formatCommentLine(comment: {
    id: string;
    body: string;
    url: string;
    user?: { name: string } | null;
    createdAt: string;
}): string {
    const author = comment.user?.name ?? 'Unknown';
    const date = new Date(comment.createdAt).toLocaleDateString();
    const preview = comment.body.length > 100 ? `${comment.body.slice(0, 100)}...` : comment.body;
    return `- **${author}** (${date}): ${preview}\n  ${comment.url}`;
}

export function formatProjectLine(project: {
    id: string;
    name: string;
    url: string;
    state?: string | null;
    progress?: number | null;
}): string {
    const state = project.state ?? 'Unknown';
    const progress = project.progress != null ? ` (${Math.round(project.progress * 100)}%)` : '';
    return `- **${project.name}** [${state}]${progress}\n  ${project.url}`;
}

export function buildContext(_ctx: ExtensionContext): { signal: AbortSignal | undefined } {
    // pi-coding-agent passes ctx to execute(); we extract only what we need
    // ctx is optional at runtime, so we handle undefined gracefully
    return { signal: undefined };
}

/** Returns the Linear SDK client, or an error result if no API key is configured. */
export function requireSdk(): LinearClient | AgentToolResult<Record<string, never>> {
    const service = LinearService.getInstance();
    if (!service.apiKey) {
        return {
            content: [{ type: 'text', text: NO_API_KEY_MESSAGE }],
            details: {},
            terminate: false
        };
    }
    return service.sdk;
}
