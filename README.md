# pi-linear

Linear integration for [pi.dev](https://pi.dev). Exposes issue tracking, project management, comments, documents, project updates, and issue relationships as tools an AI agent can call — and a `/linear` command for connection management.

## Install

```bash
pi install git:github.com/lynexer/pi-linear
```

Then run `/linear` inside pi to check your connection status. If no API key is configured yet, run:

```bash
/linear login lin_api_...
```

## What It Does

pi-linear connects pi.dev to your [Linear](https://linear.app) workspace. Once configured, the agent can:

- **Search issues** by text query with full-text and vector search
- **Create, read, update, and list issues** across teams
- **Manage comments** — add, list, update, and delete
- **Manage projects** — create, update, list, and inspect
- **Link issues** together with blocking/related/duplicate relationships
- **Read documents** — search, get by ID, list by issue, list by project
- **Post project updates** — create status updates on projects with health indicators
- **Browse teams, users, workflow states, and labels**

All tools are callable by the agent in the same tool-calling loop as `bash`, `edit`, and `read`.

### API key resolution

API keys are resolved in this order on every tool call:

1. **Project-local** — `./.pi/linear.json` (checked per working directory)
2. **Global** — `~/.pi/agent/linear.json` (user-level fallback)
3. **Environment** — `LINEAR_API_KEY` env var

This lets you use a shared team key globally while overriding it with a personal key in specific project directories.

### No-key mode

If no API key is configured, the extension loads without errors. Tools return a helpful message prompting you to run `/linear login`. You can install the extension, open a session, and configure the key entirely from within pi — no env vars or shell config needed.

## Requirements

- [pi.dev](https://pi.dev) coding agent
- A [Linear](https://linear.app) account with a [Personal API Key](https://linear.app/settings/account/security)

## Commands

### `/linear`

Shows your current Linear connection status.

```
Connected to Linear as Kyle (kyle@example.com)
```

If no key is configured, shows instructions for logging in.

### `/linear login <key>`

Saves an API key to the global config file at `~/.pi/agent/linear.json` and immediately tests the connection.

```
/linear login lin_api_YOUR_KEY_HERE
```

The key is validated (must start with `lin_api_`) before saving. A warning is shown if the key format looks wrong.

### `/linear login --local <key>`

Saves an API key to a project-local config at `./.pi/linear.json`. This key takes priority over the global one when working in that directory.

```
/linear login --local lin_api_YOUR_KEY_HERE
```

Use this to keep a shared team workspace key in the global config while overriding it with a personal key in specific repos.

## Tools

pi-linear registers **27 tools** the agent can call. They appear in the agent's tool list automatically; no configuration needed.

### Issues

| Tool | Description |
| --- | --- |
| `linear_search` | Search issues by text query using full-text and vector search |
| `linear_get_issue` | Get full details of an issue by identifier (e.g. `ENG-123`) |
| `linear_create_issue` | Create a new issue (team, title required; description, priority, labels, assignee, state optional) |
| `linear_update_issue` | Update any field on an existing issue |
| `linear_list_issues` | List issues for a team with optional status filter |

### Teams & Workflow

| Tool | Description |
| --- | --- |
| `linear_list_teams` | List all accessible teams with IDs and keys |
| `linear_list_states` | List workflow states for a team (for status transitions) |
| `linear_list_labels` | List all issue labels in the workspace |

### Users

| Tool | Description |
| --- | --- |
| `linear_list_users` | List workspace users with IDs and emails |
| `linear_my_issues` | List issues assigned to the authenticated user |

### Comments

| Tool | Description |
| --- | --- |
| `linear_add_comment` | Add a markdown comment to an issue |
| `linear_list_comments` | List comments on an issue |
| `linear_update_comment` | Update a comment body |
| `linear_delete_comment` | Delete a comment |

### Projects

| Tool | Description |
| --- | --- |
| `linear_list_projects` | List all projects with optional team filter |
| `linear_get_project` | Get project details including active/total issue counts |
| `linear_create_project` | Create a new project |
| `linear_update_project` | Update project name, description, state, or lead |

### Relationships

| Tool | Description |
| --- | --- |
| `linear_get_issue_relations` | Show what an issue blocks, is blocked by, relates to, or duplicates |
| `linear_link_issues` | Create a relationship between two issues (blocks, blocked by, relates to, duplicate) |

### Documents

| Tool | Description |
| --- | --- |
| `linear_search_documents` | Search documents by text query across the workspace |
| `linear_get_document` | Get full document details including markdown content by ID or slug |
| `linear_list_issue_documents` | List all documents linked to a specific issue |
| `linear_list_project_documents` | List all documents attached to a specific project |

### Project Updates

| Tool | Description |
| --- | --- |
| `linear_create_project_update` | Create a status update on a project (body required, health optional) |
| `linear_list_project_updates` | List status updates for a project with dates, authors, and health statuses |
| `linear_get_project_update` | Get full update details including body, diff from previous update, and metadata |

## Configuration

The extension stores its config in a simple JSON file.

### `~/.pi/agent/linear.json` (global)

```json
{
  "apiKey": "lin_api_..."
}
```

### `./.pi/linear.json` (project-local override)

Same format. Takes priority over the global config when pi is started in that directory (or a subdirectory). Only `apiKey` is read — other fields are ignored.

You never need to create these files manually. Use `/linear login` and `/linear login --local` from within pi.

## How It Works

At extension load time, pi-linear registers all 27 tools and the `/linear` command. No API call is made at startup — the Linear client is created lazily on first use.

On each tool invocation:

1. `requireSdk()` checks the project-local config, then the global config, then the environment
2. If a key is found, a `LinearClient` is created (cached per key value)
3. If no key is found, the tool returns a message telling the user to run `/linear login`

This means:
- **No blocking** — the extension loads even without a key
- **No global state** — each tool call resolves the key fresh, so switching directories mid-session picks up the right project-local key
- **No env vars required** — everything can be configured from within pi

## Notes

- **SDK-first, GraphQL fallback** — Most operations use the `@linear/sdk` typed client. Search uses the SDK's `searchIssues` (not the deprecated `issueSearch` endpoint).
- **Issue lookup by identifier** — Issues are resolved by splitting `ENG-123` into team key + number and filtering, which avoids known bugs with the deprecated text search endpoint.
- **Rate limits** — Search operations are rate-limited to 30 requests per minute by the Linear API. Standard CRUD operations have generous limits.
- **No data stored beyond the API key** — All issue data is fetched live from Linear. Nothing is cached to disk.
- **Source code** — 1,700+ lines of TypeScript. Biome for linting/formatting. Zero build step required — pi runs extensions as TypeScript directly.
