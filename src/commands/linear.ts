import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { LinearService, saveApiKey } from '../client';

export function registerLinearCommand(pi: ExtensionAPI) {
    pi.registerCommand('linear', {
        description: 'Linear: /linear (status), /linear login [--local] <key> (set API key)',
        handler: async (args, ctx) => {
            const trimmed = args.trim();

            // ── /linear login [--local] <key> ──
            if (trimmed.startsWith('login ')) {
                const rest = trimmed.slice(6).trim();

                let local = false;
                let key: string;

                if (rest.startsWith('--local ')) {
                    local = true;
                    key = rest.slice(8).trim();
                } else {
                    key = rest;
                }

                if (!key) {
                    ctx.ui.notify(
                        'Usage: /linear login [--local] <api-key>\n' +
                            '  --local  Save to ./.pi/linear.json (project-level)\n' +
                            '  (omit)   Save to ~/.pi/agent/linear.json (global)\n' +
                            'Get your key from Linear Settings → API → Personal API Keys.',
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
                    const targetCwd = local ? ctx.cwd : undefined;
                    const path = saveApiKey(key, targetCwd);

                    LinearService.resetInstance();

                    const scope = local ? `project (${path})` : `global (${path})`;
                    ctx.ui.notify(`API key saved to ${scope}. Testing connection...`, 'info');

                    try {
                        const service = LinearService.getInstance();
                        const me = await service.sdkFor(targetCwd).viewer;
                        ctx.ui.notify(`Connected to Linear as ${me.name} (${me.email})`, 'success');
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

            // ── /linear (connection status) ──
            try {
                const service = LinearService.getInstance();
                const me = await service.sdkFor(ctx.cwd).viewer;
                ctx.ui.notify(`Connected to Linear as ${me.name} (${me.email})`, 'success');
            } catch (e) {
                ctx.ui.notify(`Linear: ${(e as Error).message}`, 'error');
            }
        }
    });
}
