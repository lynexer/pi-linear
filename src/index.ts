import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { registerLinearCommand } from './commands/linear';
import { registerCommentTools } from './tools/comments';
import { registerDocumentTools } from './tools/documents';
import { registerIssueTools } from './tools/issues';
import { registerProjectUpdateTools } from './tools/project-updates';
import { registerProjectTools } from './tools/projects';
import { registerRelationshipTools } from './tools/relationships';
import { registerTeamTools } from './tools/teams';
import { registerUserTools } from './tools/users';

export default function (pi: ExtensionAPI) {
    registerIssueTools(pi);
    registerTeamTools(pi);
    registerUserTools(pi);
    registerCommentTools(pi);
    registerProjectTools(pi);
    registerRelationshipTools(pi);
    registerDocumentTools(pi);
    registerProjectUpdateTools(pi);
    registerLinearCommand(pi);
}
