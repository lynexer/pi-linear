import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';
import { formatCommentLine, notFoundResult, requireSdk, resolveIssueByIdentifier } from '../utils';

export function registerCommentTools(pi: ExtensionAPI) {
    pi.registerTool({
        name: 'linear_add_comment',
        label: 'Linear Add Comment',
        description:
            'Add a comment to a Linear issue. Supports markdown formatting in the comment body.',
        promptSnippet: 'Add a comment to a Linear issue',
        parameters: Type.Object({
            issueId: Type.String({
                description: 'Issue identifier (e.g., ENG-123)'
            }),
            body: Type.String({ description: 'Comment body (markdown)' })
        }),
        async execute(_toolCallId, params) {
            const sdk = requireSdk();
            if (!('issues' in sdk)) return sdk;
            const issue = await resolveIssueByIdentifier(sdk, params.issueId);
            if (!issue) return notFoundResult('Issue', params.issueId);

            const result = await sdk.createComment({
                issueId: issue.id,
                body: params.body
            });

            const comment = await result.comment;
            const text = `Comment added to **${issue.identifier}**.\n${comment?.url ?? ''}`;

            return {
                content: [{ type: 'text', text }],
                details: { issueId: issue.identifier, commentId: comment?.id }
            };
        }
    });

    pi.registerTool({
        name: 'linear_list_comments',
        label: 'Linear List Comments',
        description:
            'List comments on a Linear issue. Returns comment bodies, authors, dates, and URLs. Supports pagination with limit.',
        promptSnippet: 'List comments on a Linear issue',
        parameters: Type.Object({
            issueId: Type.String({
                description: 'Issue identifier (e.g., ENG-123)'
            }),
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
            const issue = await resolveIssueByIdentifier(sdk, params.issueId);
            if (!issue) return notFoundResult('Issue', params.issueId);

            const limit = Math.min(params.limit ?? 25, 50);
            const comments = await issue.comments({ first: limit });

            const resolved = await Promise.all(
                comments.nodes.map(async (c) => {
                    const user = await c.user;
                    return {
                        id: c.id,
                        body: c.body,
                        url: c.url,
                        user,
                        createdAt: c.createdAt
                    };
                })
            );

            const text =
                resolved.length === 0
                    ? `No comments on **${issue.identifier}**.`
                    : `**Comments on ${issue.identifier}** (${resolved.length}):\n\n${resolved.map((c) => formatCommentLine(c)).join('\n')}`;

            return {
                content: [{ type: 'text', text }],
                details: { issueId: issue.identifier, count: resolved.length, comments: resolved }
            };
        }
    });

    pi.registerTool({
        name: 'linear_update_comment',
        label: 'Linear Update Comment',
        description: 'Update the body of an existing comment on a Linear issue.',
        promptSnippet: 'Update a Linear comment',
        parameters: Type.Object({
            commentId: Type.String({
                description: 'Comment ID (UUID). Use linear_list_comments to find it.'
            }),
            body: Type.String({ description: 'New comment body (markdown)' })
        }),
        async execute(_toolCallId, params) {
            const sdk = requireSdk();
            if (!('issues' in sdk)) return sdk;
            const result = await sdk.updateComment(params.commentId, {
                body: params.body
            });

            const comment = await result.comment;
            const text = `Comment updated.\n${comment?.url ?? ''}`;

            return {
                content: [{ type: 'text', text }],
                details: { commentId: params.commentId }
            };
        }
    });

    pi.registerTool({
        name: 'linear_delete_comment',
        label: 'Linear Delete Comment',
        description: 'Delete a comment from a Linear issue. This action cannot be undone.',
        promptSnippet: 'Delete a Linear comment',
        parameters: Type.Object({
            commentId: Type.String({
                description: 'Comment ID (UUID). Use linear_list_comments to find it.'
            })
        }),
        async execute(_toolCallId, params) {
            const sdk = requireSdk();
            if (!('issues' in sdk)) return sdk;
            await sdk.deleteComment(params.commentId);

            const text = 'Comment deleted successfully.';

            return {
                content: [{ type: 'text', text }],
                details: { commentId: params.commentId }
            };
        }
    });
}
