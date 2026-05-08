import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';
import { formatIssueLine, requireSdk } from '../utils';

export function registerUserTools(pi: ExtensionAPI) {
    pi.registerTool({
        name: 'linear_list_users',
        label: 'Linear List Users',
        description:
            'List users in the Linear workspace. Returns user IDs, names, and emails for assignment.',
        promptSnippet: 'List Linear workspace users (for assignee IDs)',
        parameters: Type.Object({}),
        async execute() {
            const sdk = requireSdk();
            if (!('issues' in sdk)) return sdk;
            const users = await sdk.users();

            const text =
                users.nodes
                    .map((u) => `- **${u.name}** (${u.email}, ID: \`${u.id}\`)`)
                    .join('\n') || 'No users found.';

            return {
                content: [{ type: 'text', text }],
                details: {
                    users: users.nodes.map((u) => ({
                        id: u.id,
                        name: u.name,
                        email: u.email
                    }))
                }
            };
        }
    });

    pi.registerTool({
        name: 'linear_my_issues',
        label: 'Linear My Issues',
        description:
            'List issues assigned to the authenticated user. Optionally include completed issues. Returns up to 25 issues.',
        promptSnippet: 'List issues assigned to me',
        parameters: Type.Object({
            includeCompleted: Type.Optional(
                Type.Boolean({
                    description: 'Include completed/canceled issues (default: false)',
                    default: false
                })
            )
        }),
        async execute(_toolCallId, params) {
            const sdk = requireSdk();
            if (!('issues' in sdk)) return sdk;
            const me = await sdk.viewer;

            const issues = await me.assignedIssues({
                first: 25,
                filter: params.includeCompleted
                    ? undefined
                    : ({ state: { type: { nin: ['completed', 'cancelled'] } } } as never)
            });

            const resolved = await Promise.all(
                issues.nodes.map(async (issue) => {
                    const state = await issue.state;
                    return {
                        identifier: issue.identifier,
                        title: issue.title,
                        url: issue.url,
                        state,
                        assignee: undefined,
                        team: undefined,
                        priorityLabel: issue.priorityLabel
                    };
                })
            );

            const text =
                resolved.length === 0
                    ? 'No issues assigned to you.'
                    : `**My Issues** (${resolved.length}):\n\n${resolved.map((i) => formatIssueLine(i)).join('\n')}`;

            return {
                content: [{ type: 'text', text }],
                details: { count: resolved.length, issues: resolved }
            };
        }
    });
}
