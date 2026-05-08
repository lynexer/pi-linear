import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';
import { errorResult, notFoundResult, requireSdk } from '../utils';

// ── Helpers ────────────────────────────────────────────────────────

function formatUpdateLine(update: {
    id: string;
    url: string;
    createdAt: Date;
    health?: string | null;
    user?: { name: string } | null;
}): string {
    const date = new Date(update.createdAt).toLocaleDateString();
    const author = update.user?.name ?? 'Unknown';
    const health = update.health ? ` [${update.health}]` : '';
    return `- **${date}** by ${author}${health}\n  ${update.url}\n  ID: \`${update.id}\``;
}

// ── Parameter schemas ──────────────────────────────────────────────

const CreateProjectUpdateParams = Type.Object({
    projectId: Type.String({
        description: 'Project ID (UUID). Use linear_list_projects to find it.'
    }),
    body: Type.Optional(Type.String({ description: 'The update content in markdown format.' })),
    health: Type.Optional(
        StringEnum(['onTrack', 'atRisk', 'offTrack'], {
            description:
                'Health status of the project at time of update: onTrack (green), atRisk (yellow), offTrack (red).'
        })
    )
});

const ListProjectUpdatesParams = Type.Object({
    projectId: Type.String({
        description: 'Project ID (UUID). Use linear_list_projects to find it.'
    }),
    limit: Type.Optional(
        Type.Number({ description: 'Max results (default: 25, max: 50)', default: 25 })
    )
});

const GetProjectUpdateParams = Type.Object({
    projectUpdateId: Type.String({
        description: 'Project update ID (UUID). Use linear_list_project_updates to find it.'
    })
});

// ── Tool registration ──────────────────────────────────────────────

export function registerProjectUpdateTools(pi: ExtensionAPI) {
    // ── linear_create_project_update ──
    pi.registerTool({
        name: 'linear_create_project_update',
        label: 'Linear Create Project Update',
        description:
            'Create a status update on a Linear project. Updates support markdown body content and an optional health status (onTrack, atRisk, offTrack). Use for posting progress reports, status summaries, or project notes.',
        promptSnippet: 'Create a status update on a Linear project',
        parameters: CreateProjectUpdateParams,
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const sdk = requireSdk(ctx?.cwd);
            if (!('issues' in sdk)) return sdk;

            const input: Record<string, unknown> = {
                projectId: params.projectId,
                body: params.body,
                health: params.health
            };

            const result = await sdk.createProjectUpdate(input as never);
            const update = await result.projectUpdate;

            if (!update) {
                return errorResult('Failed to create project update.');
            }

            const text = `Created project update on **${params.projectId}**\n${update.url}`;

            return {
                content: [{ type: 'text', text }],
                details: {
                    id: update.id,
                    url: update.url,
                    projectId: params.projectId
                }
            };
        }
    });

    // ── linear_list_project_updates ──
    pi.registerTool({
        name: 'linear_list_project_updates',
        label: 'Linear List Project Updates',
        description:
            'List status updates for a Linear project. Returns update IDs, creation dates, health statuses, authors, and URLs. The most recent updates appear first.',
        promptSnippet: 'List status updates for a Linear project',
        parameters: ListProjectUpdatesParams,
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const sdk = requireSdk(ctx?.cwd);
            if (!('issues' in sdk)) return sdk;

            const project = await sdk.project(params.projectId);
            if (!project) return notFoundResult('Project', params.projectId);

            const limit = Math.min(params.limit ?? 25, 50);
            const updates = await project.projectUpdates({ first: limit });

            const resolved = await Promise.all(
                updates.nodes.map(async (u) => {
                    const user = await u.user;
                    return {
                        id: u.id,
                        url: u.url,
                        createdAt: u.createdAt,
                        health: u.health,
                        user: user ? { name: user.name } : null
                    };
                })
            );

            const text =
                resolved.length === 0
                    ? `No project updates for **${project.name}**.`
                    : [
                          `**Project updates for ${project.name}** (${resolved.length}):\n`,
                          ...resolved.map((u) => formatUpdateLine(u))
                      ].join('\n');

            return {
                content: [{ type: 'text', text }],
                details: {
                    projectId: params.projectId,
                    projectName: project.name,
                    count: resolved.length,
                    updates: resolved
                }
            };
        }
    });

    // ── linear_get_project_update ──
    pi.registerTool({
        name: 'linear_get_project_update',
        label: 'Linear Get Project Update',
        description:
            'Get full details of a project update by its ID. Returns the markdown body, health status, author, timestamps, diff from previous update (markdown), and URL.',
        promptSnippet: 'Get full details of a Linear project update',
        parameters: GetProjectUpdateParams,
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const sdk = requireSdk(ctx?.cwd);
            if (!('issues' in sdk)) return sdk;

            const update = await sdk.projectUpdate(params.projectUpdateId);
            if (!update) return notFoundResult('Project update', params.projectUpdateId);

            const [project, user] = await Promise.all([update.project, update.user]);

            const createdDate = new Date(update.createdAt).toLocaleString();
            const editedStr = update.editedAt
                ? ` (edited ${new Date(update.editedAt).toLocaleString()})`
                : '';

            const parts = [
                `# Project Update`,
                `**Project**: ${project?.name ?? 'Unknown'}`,
                `**Author**: ${user?.name ?? 'Unknown'}`,
                `**Health**: ${update.health ?? 'Not set'}`,
                `**Created**: ${createdDate}${editedStr}`,
                `**URL**: ${update.url}`,
                ''
            ];

            if (update.body) {
                parts.push('## Body', '', update.body, '');
            }

            if (update.diffMarkdown) {
                parts.push('## Diff from previous update', '', update.diffMarkdown, '');
            }

            const text = parts.join('\n');

            return {
                content: [{ type: 'text', text }],
                details: {
                    id: update.id,
                    url: update.url,
                    project: project?.name,
                    author: user?.name,
                    health: update.health,
                    createdAt: update.createdAt,
                    editedAt: update.editedAt
                }
            };
        }
    });
}
