import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';
import { notFoundResult, requireSdk, resolveIssueByIdentifier } from '../utils';

export function registerRelationshipTools(pi: ExtensionAPI) {
    pi.registerTool({
        name: 'linear_get_issue_relations',
        label: 'Linear Get Issue Relations',
        description:
            'Get all relationships for a Linear issue. Shows what issues this issue blocks, is blocked by, relates to, or duplicates.',
        promptSnippet: 'Get linked/blocking/blocked issues for a Linear issue',
        parameters: Type.Object({
            issueId: Type.String({
                description: 'Issue identifier (e.g., ENG-123)'
            })
        }),
        async execute(_toolCallId, params) {
            const sdk = requireSdk();
            if (!('issues' in sdk)) return sdk;
            const issue = await resolveIssueByIdentifier(sdk, params.issueId);
            if (!issue) return notFoundResult('Issue', params.issueId);

            const relations = await issue.relations();

            const resolved = relations.nodes.map((r) => ({
                type: r.type,
                relatedIssueId: r.relatedIssue?.identifier ?? 'Unknown',
                relatedIssueTitle: r.relatedIssue?.title ?? 'Unknown'
            }));

            if (resolved.length === 0) {
                const text = `No relationships for **${issue.identifier}**.`;
                return {
                    content: [{ type: 'text', text }],
                    details: { issueId: issue.identifier, relations: [] }
                };
            }

            const text = [
                `**Relationships for ${issue.identifier}**:`,
                ...resolved.map(
                    (r) => `- **${r.type}**: ${r.relatedIssueId} — ${r.relatedIssueTitle}`
                )
            ].join('\n');

            return {
                content: [{ type: 'text', text }],
                details: { issueId: issue.identifier, relations: resolved }
            };
        }
    });

    pi.registerTool({
        name: 'linear_link_issues',
        label: 'Linear Link Issues',
        description:
            'Create a relationship between two Linear issues. Relationship types: "blocks" (this issue blocks the other), "blocked" (this issue is blocked by the other), "relates_to" (general relation), or "duplicate" (marks as duplicate).',
        promptSnippet: 'Link two Linear issues (blocks, blocked by, relates to, duplicate)',
        parameters: Type.Object({
            issueId: Type.String({
                description:
                    'First issue identifier (e.g., ENG-123). This is the source of the relationship.'
            }),
            relatedIssueId: Type.String({
                description:
                    'Second issue identifier (e.g., ENG-456). This is the target of the relationship.'
            }),
            type: StringEnum(['blocks', 'blocked', 'relates_to', 'duplicate'], {
                description:
                    'Relationship type: "blocks" (issueId blocks relatedIssueId), "blocked" (issueId is blocked by relatedIssueId), "relates_to", or "duplicate"'
            })
        }),
        async execute(_toolCallId, params) {
            const sdk = requireSdk();
            if (!('issues' in sdk)) return sdk;

            const issue = await resolveIssueByIdentifier(sdk, params.issueId);
            if (!issue) return notFoundResult('Issue', params.issueId);

            const relatedIssue = await resolveIssueByIdentifier(sdk, params.relatedIssueId);
            if (!relatedIssue) return notFoundResult('Issue', params.relatedIssueId);

            // Map to Linear's relation type enum
            const typeMap: Record<string, string> = {
                blocks: 'blocks',
                blocked: 'blocked',
                relates_to: 'relatesTo',
                duplicate: 'duplicate'
            };

            const linearType = typeMap[params.type];

            await sdk.createIssueRelation({
                issueId: issue.id,
                relatedIssueId: relatedIssue.id,
                type: linearType as never
            });

            const text = `Linked **${issue.identifier}** ${params.type.replace('_', ' ')} **${relatedIssue.identifier}**.`;

            return {
                content: [{ type: 'text', text }],
                details: {
                    sourceIssueId: issue.identifier,
                    targetIssueId: relatedIssue.identifier,
                    type: params.type
                }
            };
        }
    });
}
