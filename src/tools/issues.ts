import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';
import { LinearService } from '../client';
import { errorResult, formatIssueLine, notFoundResult, resolveIssueByIdentifier } from '../utils';

// ── Parameter schemas ──────────────────────────────────────────────

const SearchParams = Type.Object({
    query: Type.String({
        description: 'Search text to match against issue titles and descriptions'
    }),
    limit: Type.Optional(
        Type.Number({ description: 'Max results (default: 10, max: 50)', default: 10 })
    )
});

const GetIssueParams = Type.Object({
    issueId: Type.String({ description: 'Issue identifier (e.g., ENG-123)' })
});

const CreateIssueParams = Type.Object({
    teamId: Type.String({ description: 'Team ID (UUID). Use linear_list_teams to find it.' }),
    title: Type.String({ description: 'Issue title' }),
    description: Type.Optional(Type.String({ description: 'Issue description (markdown)' })),
    priority: Type.Optional(
        Type.Number({
            description: 'Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low'
        })
    ),
    labelIds: Type.Optional(Type.Array(Type.String(), { description: 'Label IDs to apply' })),
    assigneeId: Type.Optional(
        Type.String({ description: 'Assignee user ID (UUID). Use linear_list_users to find it.' })
    ),
    stateId: Type.Optional(
        Type.String({ description: 'State ID (UUID). Use linear_list_states to find it.' })
    )
});

const UpdateIssueParams = Type.Object({
    issueId: Type.String({ description: 'Issue identifier (e.g., ENG-123)' }),
    title: Type.Optional(Type.String({ description: 'New title' })),
    description: Type.Optional(Type.String({ description: 'New description (markdown)' })),
    stateId: Type.Optional(
        Type.String({ description: 'New state ID (UUID). Use linear_list_states to find it.' })
    ),
    assigneeId: Type.Optional(
        Type.String({ description: 'Assignee user ID (UUID). Use linear_list_users to find it.' })
    ),
    priority: Type.Optional(
        Type.Number({
            description: 'Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low'
        })
    ),
    labelIds: Type.Optional(
        Type.Array(Type.String(), { description: 'Label IDs to apply (replaces existing)' })
    ),
    projectId: Type.Optional(
        Type.String({ description: 'Project ID (UUID). Use linear_list_projects to find it.' })
    )
});

const ListIssuesParams = Type.Object({
    teamId: Type.String({ description: 'Team ID (UUID). Use linear_list_teams to find it.' }),
    statusType: Type.Optional(
        StringEnum(['backlog', 'unstarted', 'started', 'completed', 'canceled'], {
            description: 'Filter by status type (optional)'
        })
    ),
    limit: Type.Optional(
        Type.Number({ description: 'Max results (default: 25, max: 50)', default: 25 })
    ),
    includeCompleted: Type.Optional(
        Type.Boolean({
            description: 'Include completed/canceled issues (default: false)',
            default: false
        })
    )
});

// ── Tool registration ──────────────────────────────────────────────

export function registerIssueTools(pi: ExtensionAPI) {
    const service = LinearService.getInstance();

    // ── linear_search ──
    pi.registerTool({
        name: 'linear_search',
        label: 'Linear Search',
        description:
            'Search Linear issues by text query using full-text and vector search. Returns issue IDs, titles, status, assignee, and team.',
        promptSnippet: 'Search Linear issues by text query',
        parameters: SearchParams,
        async execute(_toolCallId, params) {
            const sdk = service.sdk;
            const limit = Math.min(params.limit ?? 10, 50);

            const result = await sdk.searchIssues(params.query, {
                first: limit
            });

            const nodes = result.nodes ?? [];
            const resolved = await Promise.all(
                nodes.map(async (issue) => {
                    const [state, assignee, team] = await Promise.all([
                        issue.state,
                        issue.assignee,
                        issue.team
                    ]);
                    return {
                        identifier: issue.identifier,
                        title: issue.title,
                        status: state?.name ?? 'Unknown',
                        assignee: assignee?.name ?? 'Unassigned',
                        team: team?.key ?? 'Unknown',
                        url: issue.url,
                        priorityLabel: issue.priorityLabel
                    };
                })
            );

            const text =
                resolved.length === 0
                    ? `No issues found for "${params.query}".`
                    : resolved.map((i) => formatIssueLine(i)).join('\n');

            return {
                content: [{ type: 'text', text }],
                details: { count: resolved.length, issues: resolved }
            };
        }
    });

    // ── linear_get_issue ──
    pi.registerTool({
        name: 'linear_get_issue',
        label: 'Linear Get Issue',
        description:
            'Get full details of a Linear issue by its identifier (e.g., ENG-123). Returns title, description, status, assignee, team, priority, labels, project, and URL.',
        promptSnippet: 'Get full details of a Linear issue by ID',
        parameters: GetIssueParams,
        async execute(_toolCallId, params) {
            const sdk = service.sdk;
            const issue = await resolveIssueByIdentifier(sdk, params.issueId);
            if (!issue) return notFoundResult('Issue', params.issueId);

            const [state, assignee, team, labels, project] = await Promise.all([
                issue.state,
                issue.assignee,
                issue.team,
                issue.labels(),
                issue.project
            ]);

            const text = [
                `# ${issue.identifier}: ${issue.title}`,
                `**Status**: ${state?.name ?? 'Unknown'}`,
                `**Assignee**: ${assignee?.name ?? 'Unassigned'}`,
                `**Team**: ${team?.name ?? 'Unknown'}`,
                `**Priority**: ${issue.priorityLabel}`,
                `**Labels**: ${labels.nodes.map((l) => l.name).join(', ') || 'None'}`,
                `**Project**: ${project?.name ?? 'None'}`,
                `**URL**: ${issue.url}`,
                '',
                '## Description',
                issue.description ?? '_No description_'
            ].join('\n');

            return {
                content: [{ type: 'text', text }],
                details: {
                    id: issue.identifier,
                    title: issue.title,
                    status: state?.name,
                    assignee: assignee?.name,
                    team: team?.name,
                    priority: issue.priorityLabel,
                    url: issue.url
                }
            };
        }
    });

    // ── linear_create_issue ──
    pi.registerTool({
        name: 'linear_create_issue',
        label: 'Linear Create Issue',
        description:
            'Create a new Linear issue. Requires team ID and title at minimum. Optionally set description, priority, labels, assignee, and initial state.',
        promptSnippet: 'Create a new Linear issue',
        parameters: CreateIssueParams,
        async execute(_toolCallId, params) {
            const sdk = service.sdk;
            const result = await sdk.createIssue({
                teamId: params.teamId,
                title: params.title,
                description: params.description,
                priority: params.priority,
                labelIds: params.labelIds,
                assigneeId: params.assigneeId,
                stateId: params.stateId
            });

            const issue = await result.issue;
            if (!issue) {
                return errorResult('Failed to create issue.');
            }

            const text = `Created **${issue.identifier}**: ${issue.title}\n${issue.url}`;

            return {
                content: [{ type: 'text', text }],
                details: { id: issue.identifier, title: issue.title, url: issue.url }
            };
        }
    });

    // ── linear_update_issue ──
    pi.registerTool({
        name: 'linear_update_issue',
        label: 'Linear Update Issue',
        description:
            'Update an existing Linear issue. Provide issueId and any fields to change: title, description, state, assignee, priority, labels, or project.',
        promptSnippet: 'Update a Linear issue (status, assignee, title, description, priority)',
        parameters: UpdateIssueParams,
        async execute(_toolCallId, params) {
            const sdk = service.sdk;
            const issue = await resolveIssueByIdentifier(sdk, params.issueId);
            if (!issue) return notFoundResult('Issue', params.issueId);

            const update: Record<string, unknown> = {};
            if (params.title !== undefined) update.title = params.title;
            if (params.description !== undefined) update.description = params.description;
            if (params.stateId !== undefined) update.stateId = params.stateId;
            if (params.assigneeId !== undefined) update.assigneeId = params.assigneeId;
            if (params.priority !== undefined) update.priority = params.priority;
            if (params.labelIds !== undefined) update.labelIds = params.labelIds;
            if (params.projectId !== undefined) update.projectId = params.projectId;

            await sdk.updateIssue(issue.id, update as never);

            const text = `Updated **${issue.identifier}**: ${params.title ?? issue.title}\n${issue.url}`;

            return {
                content: [{ type: 'text', text }],
                details: { id: issue.identifier, updated: Object.keys(update) }
            };
        }
    });

    // ── linear_list_issues ──
    pi.registerTool({
        name: 'linear_list_issues',
        label: 'Linear List Issues',
        description:
            'List all issues for a team. Optionally filter by status type or include completed issues. Returns up to 50 issues.',
        promptSnippet: 'List all issues for a Linear team',
        parameters: ListIssuesParams,
        async execute(_toolCallId, params) {
            const sdk = service.sdk;
            const limit = Math.min(params.limit ?? 25, 50);

            const filter: Record<string, unknown> = {
                team: { id: { eq: params.teamId } }
            };

            if (params.statusType) {
                filter.state = { type: { eq: params.statusType } };
            } else if (!params.includeCompleted) {
                filter.state = { type: { nin: ['completed', 'canceled'] } };
            }

            const results = await sdk.issues({ first: limit, filter: filter as never });

            const resolved = await Promise.all(
                results.nodes.map(async (issue) => {
                    const [state, assignee, team] = await Promise.all([
                        issue.state,
                        issue.assignee,
                        issue.team
                    ]);
                    return {
                        identifier: issue.identifier,
                        title: issue.title,
                        url: issue.url,
                        state,
                        assignee,
                        team,
                        priorityLabel: issue.priorityLabel
                    };
                })
            );

            const text =
                resolved.length === 0
                    ? 'No issues found.'
                    : `**Issues** (${resolved.length}):\n\n${resolved.map((i) => formatIssueLine(i)).join('\n')}`;

            return {
                content: [{ type: 'text', text }],
                details: { count: resolved.length, issues: resolved }
            };
        }
    });
}
