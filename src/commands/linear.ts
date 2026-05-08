import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { LinearService, saveApiKey } from '../client';

export function registerLinearCommand(pi: ExtensionAPI) {
    pi.registerCommand('linear', {
        description:
            'Linear integration: /linear (connection status), /linear login <key> (set API key)',
        handler: async (args, ctx) => {
            const trimmed = args.trim();

            if (trimmed.startsWith('login ')) {
                const key = trimmed.slice(6).trim();

                if (!key) {
                    ctx.ui.notify(
                        'Usage: /linear login <api-key>\nGet your key from Linear Settings → API → Personal API Keys.',
                        'error'
                    );

                    return;
                }

                if (!key.startsWith('lin_api_')) {
                    ctx.ui.notify(
                        'That doesn\'t look like a Linear API key. Keys start with "lin_api_".',
                        'warning'
                    );

                    return;
                }

                try {
                    const path = saveApiKey(key);

                    LinearService.resetInstance();

                    ctx.ui.notify(`API key saved to ${path}. Testing connection...`, 'info');

                    try {
                        const service = LinearService.getInstance();
                        const me = await service.sdk.viewer;

                        ctx.ui.notify(`Connected to Linear as ${me.name} (${me.email})`, 'info');
                    } catch (e) {
                        ctx.ui.notify(
                            `Key saved but connection failed: ${(e as Error).message}`,
                            'error'
                        );
                    }
                } catch (e) {
                    ctx.ui.notify(`Failed to save key: ${(e as Error).message}`, 'error');
                }

                return;
            }

            try {
                const service = LinearService.getInstance();
                const me = await service.sdk.viewer;

                ctx.ui.notify(`Connected to Linear as ${me.name} (${me.email})`, 'info');
            } catch (e) {
                ctx.ui.notify(`Linear: ${(e as Error).message}`, 'error');
            }
        }
    });
}
