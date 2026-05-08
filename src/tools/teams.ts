import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';
import { LinearService } from '../client';

export function registerTeamTools(pi: ExtensionAPI) {
    const service = LinearService.getInstance();

    pi.registerTool({
        name: 'linear_list_teams',
        label: 'Linear List Teams',
        description:
            'List all teams in the Linear workspace that you have access to. Returns team IDs, names, and keys.',
        promptSnippet: 'List all Linear teams (for getting team IDs)',
        parameters: Type.Object({}),
        async execute() {
            const sdk = service.sdk;
            const teams = await sdk.teams();

            const text =
                teams.nodes.map((t) => `- **${t.key}**: ${t.name} (ID: \`${t.id}\`)`).join('\n') ||
                'No teams found.';

            return {
                content: [{ type: 'text', text }],
                details: {
                    teams: teams.nodes.map((t) => ({
                        id: t.id,
                        key: t.key,
                        name: t.name
                    }))
                }
            };
        }
    });

    pi.registerTool({
        name: 'linear_list_states',
        label: 'Linear List States',
        description:
            'List workflow states for a team. Returns state IDs, names, and types for use in status transitions.',
        promptSnippet: 'List workflow states for a Linear team',
        parameters: Type.Object({
            teamId: Type.String({ description: 'Team ID (UUID)' })
        }),
        async execute(_toolCallId, params) {
            const sdk = service.sdk;
            const team = await sdk.team(params.teamId);
            const states = await team.states();

            const text =
                states.nodes
                    .map((s) => `- **${s.name}** (type: ${s.type}, ID: \`${s.id}\`)`)
                    .join('\n') || 'No states found.';

            return {
                content: [{ type: 'text', text }],
                details: {
                    states: states.nodes.map((s) => ({
                        id: s.id,
                        name: s.name,
                        type: s.type
                    }))
                }
            };
        }
    });

    pi.registerTool({
        name: 'linear_list_labels',
        label: 'Linear List Labels',
        description:
            'List all issue labels in the workspace. Returns label IDs, names, colors, and parent/team info.',
        promptSnippet: 'List all Linear issue labels (for label IDs)',
        parameters: Type.Object({}),
        async execute() {
            const sdk = service.sdk;
            const labels = await sdk.issueLabels();

            const text =
                labels.nodes
                    .map((l) => `- **${l.name}** (ID: \`${l.id}\`, color: ${l.color ?? 'none'})`)
                    .join('\n') || 'No labels found.';

            return {
                content: [{ type: 'text', text }],
                details: {
                    labels: labels.nodes.map((l) => ({
                        id: l.id,
                        name: l.name,
                        color: l.color
                    }))
                }
            };
        }
    });
}
