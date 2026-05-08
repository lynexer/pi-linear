import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { LinearService } from '../client';

export function registerLinearCommand(pi: ExtensionAPI) {
    pi.registerCommand('linear', {
        description: 'Show Linear connection status',
        handler: async (_args, ctx) => {
            try {
                const service = LinearService.getInstance();
                const sdk = service.sdk;
                const me = await sdk.viewer;
                ctx.ui.notify(`Connected to Linear as ${me.name} (${me.email})`, 'success');
            } catch (e) {
                ctx.ui.notify(`Linear: ${(e as Error).message}`, 'error');
            }
        }
    });
}
