import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';
import { errorResult, formatProjectLine, requireSdk } from '../utils';

export function registerProjectTools(pi: ExtensionAPI) {
    pi.registerTool({
        name: 'linear_list_projects',
        label: 'Linear List Projects',
        description:
            'List all projects in the Linear workspace. Optionally filter by team. Returns project IDs, names, states, and progress.',
        promptSnippet: 'List all Linear projects',
        parameters: Type.Object({
            teamId: Type.Optional(
                Type.String({
                    description: 'Filter by team ID (UUID). Use linear_list_teams to find it.'
                })
            ),
            limit: Type.Optional(
                Type.Number({
                    description: 'Max results (default: 25, max: 50)',
                    default: 25
                })
            )
        }),
        async execute(_toolCallId, params) {
            const sdk = requireSdk();
            if (!('issues' in sdk)) return sdk;
            const limit = Math.min(params.limit ?? 25, 50);

            const filter: Record<string, unknown> = {};
            if (params.teamId) {
                filter.team = { id: { eq: params.teamId } };
            }

            const projects = await sdk.projects({
                first: limit,
                filter: Object.keys(filter).length > 0 ? (filter as never) : undefined
            });

            const resolved = projects.nodes.map((p) => ({
                id: p.id,
                name: p.name,
                url: p.url,
                state: p.state,
                progress: p.progress
            }));

            const text =
                resolved.length === 0
                    ? 'No projects found.'
                    : `**Projects** (${resolved.length}):\n\n${resolved.map((p) => formatProjectLine(p)).join('\n')}`;

            return {
                content: [{ type: 'text', text }],
                details: { count: resolved.length, projects: resolved }
            };
        }
    });

    pi.registerTool({
        name: 'linear_get_project',
        label: 'Linear Get Project',
        description:
            'Get full details of a Linear project by its ID. Returns name, description, state, progress, lead, teams, and issue counts.',
        promptSnippet: 'Get full details of a Linear project',
        parameters: Type.Object({
            projectId: Type.String({
                description: 'Project ID (UUID). Use linear_list_projects to find it.'
            })
        }),
        async execute(_toolCallId, params) {
            const sdk = requireSdk();
            if (!('issues' in sdk)) return sdk;
            const project = await sdk.project(params.projectId);

            if (!project) {
                return errorResult(`Project \`${params.projectId}\` not found.`);
            }

            const [lead, teams, issues] = await Promise.all([
                project.lead,
                project.teams(),
                project.issues({ first: 50 })
            ]);

            const activeCount = issues.nodes.filter(
                (i) => i.state?.type !== 'completed' && i.state?.type !== 'canceled'
            ).length;

            const text = [
                `# ${project.name}`,
                `**State**: ${project.state ?? 'Unknown'}`,
                `**Progress**: ${project.progress != null ? `${Math.round(project.progress * 100)}%` : 'N/A'}`,
                `**Lead**: ${lead?.name ?? 'Unassigned'}`,
                `**Teams**: ${teams.nodes.map((t) => t.name).join(', ') || 'None'}`,
                `**Active Issues**: ${activeCount} / ${issues.nodes.length} total`,
                `**URL**: ${project.url}`,
                '',
                '## Description',
                project.description ?? '_No description_'
            ].join('\n');

            return {
                content: [{ type: 'text', text }],
                details: {
                    id: project.id,
                    name: project.name,
                    state: project.state,
                    progress: project.progress,
                    lead: lead?.name,
                    activeIssues: activeCount,
                    totalIssues: issues.nodes.length
                }
            };
        }
    });

    pi.registerTool({
        name: 'linear_create_project',
        label: 'Linear Create Project',
        description:
            'Create a new Linear project. Requires team IDs and a name. Optionally set description, state, and lead.',
        promptSnippet: 'Create a new Linear project',
        parameters: Type.Object({
            teamIds: Type.Array(Type.String(), {
                description: 'Team IDs (UUIDs). Use linear_list_teams to find them.'
            }),
            name: Type.String({ description: 'Project name' }),
            description: Type.Optional(
                Type.String({ description: 'Project description (markdown)' })
            ),
            state: Type.Optional(
                StringEnum(['backlog', 'planned', 'started', 'paused', 'completed', 'canceled'], {
                    description: 'Project state (optional)'
                })
            ),
            leadId: Type.Optional(
                Type.String({
                    description: 'Lead user ID (UUID). Use linear_list_users to find it.'
                })
            )
        }),
        async execute(_toolCallId, params) {
            const sdk = requireSdk();
            if (!('issues' in sdk)) return sdk;

            const input: Record<string, unknown> = {
                teamIds: params.teamIds,
                name: params.name,
                description: params.description
            };
            if (params.state) input.state = params.state;
            if (params.leadId) input.leadId = params.leadId;

            const result = await sdk.createProject(input as never);

            const project = await result.project;
            if (!project) {
                return errorResult('Failed to create project.');
            }

            const text = `Created project **${project.name}**\n${project.url}`;

            return {
                content: [{ type: 'text', text }],
                details: { id: project.id, name: project.name, url: project.url }
            };
        }
    });

    pi.registerTool({
        name: 'linear_update_project',
        label: 'Linear Update Project',
        description:
            'Update an existing Linear project. Provide projectId and any fields to change: name, description, state, or lead.',
        promptSnippet: 'Update a Linear project',
        parameters: Type.Object({
            projectId: Type.String({
                description: 'Project ID (UUID). Use linear_list_projects to find it.'
            }),
            name: Type.Optional(Type.String({ description: 'New project name' })),
            description: Type.Optional(
                Type.String({ description: 'New project description (markdown)' })
            ),
            state: Type.Optional(
                StringEnum(['backlog', 'planned', 'started', 'paused', 'completed', 'canceled'], {
                    description: 'New project state'
                })
            ),
            leadId: Type.Optional(
                Type.String({
                    description: 'New lead user ID (UUID). Use linear_list_users to find it.'
                })
            )
        }),
        async execute(_toolCallId, params) {
            const sdk = requireSdk();
            if (!('issues' in sdk)) return sdk;

            const update: Record<string, unknown> = {};
            if (params.name !== undefined) update.name = params.name;
            if (params.description !== undefined) update.description = params.description;
            if (params.state !== undefined) update.state = params.state;
            if (params.leadId !== undefined) update.leadId = params.leadId;

            await sdk.updateProject(params.projectId, update as never);

            const text = `Updated project \`${params.projectId}\`.`;

            return {
                content: [{ type: 'text', text }],
                details: { projectId: params.projectId, updated: Object.keys(update) }
            };
        }
    });
}
