import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';
import {
    notFoundResult,
    requireSdk,
    resolveIssueByIdentifier,
    resolveProjectByIdentifier
} from '../utils';

// ── Helpers ────────────────────────────────────────────────────────

function formatDocumentLine(doc: {
    id: string;
    title: string;
    url: string;
    updatedAt: Date;
    project?: { name: string } | null;
    issue?: { identifier: string } | null;
}): string {
    const date = new Date(doc.updatedAt).toLocaleDateString();
    const project = doc.project?.name;
    const issue = doc.issue?.identifier;
    const context = [project ? `Project: ${project}` : null, issue ? `Issue: ${issue}` : null]
        .filter(Boolean)
        .join(', ');

    const contextStr = context ? ` (${context})` : '';
    return `- **${doc.title || 'Untitled'}** [${date}]${contextStr}\n  ${doc.url}\n  ID: \`${doc.id}\``;
}

// ── Parameter schemas ──────────────────────────────────────────────

const SearchDocumentsParams = Type.Object({
    term: Type.String({ description: 'Search text to match against document titles and content' }),
    limit: Type.Optional(
        Type.Number({ description: 'Max results (default: 10, max: 25)', default: 10 })
    )
});

const GetDocumentParams = Type.Object({
    documentId: Type.String({
        description:
            'Document ID (UUID) or URL slug. Use linear_search_documents or linear_list_*_documents to find it.'
    })
});

const ListIssueDocumentsParams = Type.Object({
    issueId: Type.String({ description: 'Issue identifier (e.g., ENG-123)' }),
    limit: Type.Optional(
        Type.Number({ description: 'Max results (default: 25, max: 50)', default: 25 })
    )
});

const ListProjectDocumentsParams = Type.Object({
    projectId: Type.String({
        description: 'Project ID (UUID or name). Use linear_list_projects to find it.'
    }),
    limit: Type.Optional(
        Type.Number({ description: 'Max results (default: 25, max: 50)', default: 25 })
    )
});

// ── Tool registration ──────────────────────────────────────────────

export function registerDocumentTools(pi: ExtensionAPI) {
    // ── linear_search_documents ──
    pi.registerTool({
        name: 'linear_search_documents',
        label: 'Linear Search Documents',
        description:
            'Search Linear documents by text query. Returns matching documents with titles, content snippets, and URLs. Documents are rich-text pages attached to projects, issues, or initiatives (e.g., specs, PRDs, status updates). Rate-limited to 30 requests per minute.',
        promptSnippet: 'Search Linear documents by text query',
        parameters: SearchDocumentsParams,
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const sdk = requireSdk(ctx?.cwd);
            if (!('issues' in sdk)) return sdk;

            const limit = Math.min(params.limit ?? 10, 25);
            const result = await sdk.searchDocuments(params.term, { first: limit });

            const resolved = await Promise.all(
                result.nodes.map(async (doc) => {
                    const [project, issue, creator] = await Promise.all([
                        doc.project,
                        doc.issue,
                        doc.creator
                    ]);
                    return {
                        id: doc.id,
                        title: doc.title,
                        content: doc.content,
                        url: doc.url,
                        updatedAt: doc.updatedAt,
                        project: project ? { id: project.id, name: project.name } : null,
                        issue: issue ? { identifier: issue.identifier, title: issue.title } : null,
                        creator: creator?.name ?? 'Unknown'
                    };
                })
            );

            if (resolved.length === 0) {
                return {
                    content: [{ type: 'text', text: `No documents found for "${params.term}".` }],
                    details: { count: 0, documents: [] }
                };
            }

            const text = [
                `**Documents matching "${params.term}"** (${resolved.length}):\n`,
                ...resolved.map((d) => formatDocumentLine(d))
            ].join('\n');

            return {
                content: [{ type: 'text', text }],
                details: { count: resolved.length, documents: resolved }
            };
        }
    });

    // ── linear_get_document ──
    pi.registerTool({
        name: 'linear_get_document',
        label: 'Linear Get Document',
        description:
            'Get full details of a Linear document by its ID or URL slug. Returns title, markdown content, associated project/issue, creator, timestamps, and URL.',
        promptSnippet: 'Get full details of a Linear document',
        parameters: GetDocumentParams,
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const sdk = requireSdk(ctx?.cwd);
            if (!('issues' in sdk)) return sdk;

            const doc = await sdk.document(params.documentId);
            if (!doc) return notFoundResult('Document', params.documentId);

            const [project, issue, creator, updatedBy] = await Promise.all([
                doc.project,
                doc.issue,
                doc.creator,
                doc.updatedBy
            ]);

            const updatedDate = new Date(doc.updatedAt).toLocaleString();
            const createdDate = new Date(doc.createdAt).toLocaleString();

            const header = [
                `# ${doc.title || 'Untitled Document'}`,
                `**URL**: ${doc.url}`,
                `**ID**: \`${doc.id}\``,
                `**Project**: ${project?.name ?? 'None'}`,
                `**Issue**: ${issue?.identifier ? `${issue.identifier}: ${issue.title}` : 'None'}`,
                `**Creator**: ${creator?.name ?? 'Unknown'}`,
                `**Last Updated**: ${updatedDate} by ${updatedBy?.name ?? 'Unknown'}`,
                `**Created**: ${createdDate}`,
                ''
            ].join('\n');

            const text = header + (doc.content ? `## Content\n\n${doc.content}` : '_No content_');

            return {
                content: [{ type: 'text', text }],
                details: {
                    id: doc.id,
                    title: doc.title,
                    url: doc.url,
                    project: project?.name,
                    issueId: issue?.identifier,
                    creator: creator?.name,
                    updatedAt: doc.updatedAt
                }
            };
        }
    });

    // ── linear_list_issue_documents ──
    pi.registerTool({
        name: 'linear_list_issue_documents',
        label: 'Linear List Issue Documents',
        description:
            'List all documents linked to a Linear issue. Returns document titles, URLs, IDs, and last-updated timestamps.',
        promptSnippet: 'List documents linked to a Linear issue',
        parameters: ListIssueDocumentsParams,
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const sdk = requireSdk(ctx?.cwd);
            if (!('issues' in sdk)) return sdk;

            const issue = await resolveIssueByIdentifier(sdk, params.issueId);
            if (!issue) return notFoundResult('Issue', params.issueId);

            const limit = Math.min(params.limit ?? 25, 50);
            const docs = await issue.documents({ first: limit });

            const resolved = await Promise.all(
                docs.nodes.map(async (doc) => {
                    const [project, creator] = await Promise.all([doc.project, doc.creator]);
                    return {
                        id: doc.id,
                        title: doc.title,
                        url: doc.url,
                        updatedAt: doc.updatedAt,
                        project: project ? { name: project.name } : null,
                        issue: null,
                        creator: creator?.name ?? 'Unknown'
                    };
                })
            );

            const text =
                resolved.length === 0
                    ? `No documents linked to **${issue.identifier}**.`
                    : `**Documents on ${issue.identifier}** (${resolved.length}):\n\n${resolved.map((d) => formatDocumentLine(d)).join('\n')}`;

            return {
                content: [{ type: 'text', text }],
                details: { issueId: issue.identifier, count: resolved.length, documents: resolved }
            };
        }
    });

    // ── linear_list_project_documents ──
    pi.registerTool({
        name: 'linear_list_project_documents',
        label: 'Linear List Project Documents',
        description:
            'List all documents attached to a Linear project. Returns document titles, URLs, IDs, and last-updated timestamps.',
        promptSnippet: 'List documents attached to a Linear project',
        parameters: ListProjectDocumentsParams,
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const sdk = requireSdk(ctx?.cwd);
            if (!('issues' in sdk)) return sdk;

            const project = await resolveProjectByIdentifier(sdk, params.projectId);
            if (!project) return notFoundResult('Project', params.projectId);

            const limit = Math.min(params.limit ?? 25, 50);
            const docs = await project.documents({ first: limit });

            const resolved = await Promise.all(
                docs.nodes.map(async (doc) => {
                    const [issue, creator] = await Promise.all([doc.issue, doc.creator]);
                    return {
                        id: doc.id,
                        title: doc.title,
                        url: doc.url,
                        updatedAt: doc.updatedAt,
                        project: null,
                        issue: issue ? { identifier: issue.identifier } : null,
                        creator: creator?.name ?? 'Unknown'
                    };
                })
            );

            const text =
                resolved.length === 0
                    ? `No documents attached to project **${project.name}**.`
                    : `**Documents in ${project.name}** (${resolved.length}):\n\n${resolved.map((d) => formatDocumentLine(d)).join('\n')}`;

            return {
                content: [{ type: 'text', text }],
                details: {
                    projectId: params.projectId,
                    projectName: project.name,
                    count: resolved.length,
                    documents: resolved
                }
            };
        }
    });
}
