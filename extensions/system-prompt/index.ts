/**
 * System Prompt Extension
 *
 * Adds a /system-prompt command that prints the current system prompt and
 * the full list of registered tools (active vs inactive) into the
 * conversation scroll buffer as a readable custom message.
 *
 * Usage:
 *   /system-prompt          – show system prompt + all tools
 *   /system-prompt tools    – show tools only
 *   /system-prompt prompt   – show system prompt only
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("system-prompt", {
		description: "Show current system prompt and/or available tools",
		handler: async (args, ctx) => {
			const mode = args?.trim().toLowerCase();
			const showPrompt = !mode || mode === "prompt";
			const showTools = !mode || mode === "tools";

			const lines: string[] = [];

			// ── Tools ──────────────────────────────────────────────────────────
			if (showTools) {
				const all = pi.getAllTools();
				const activeNames = new Set(pi.getActiveTools().map((t) => t.name));

				const active = all.filter((t) => activeNames.has(t.name));
				const inactive = all.filter((t) => !activeNames.has(t.name));

				lines.push(`## Tools  (${active.length} active, ${inactive.length} inactive)\n`);

				if (active.length > 0) {
					lines.push("### Active");
					for (const t of active) {
						const src = t.sourceInfo.source === "builtin" ? "builtin" : t.sourceInfo.source;
						lines.push(`  ● ${t.name}  [${src}]`);
						lines.push(`    ${t.description}`);
					}
					lines.push("");
				}

				if (inactive.length > 0) {
					lines.push("### Inactive");
					for (const t of inactive) {
						const src = t.sourceInfo.source === "builtin" ? "builtin" : t.sourceInfo.source;
						lines.push(`  ○ ${t.name}  [${src}]`);
						lines.push(`    ${t.description}`);
					}
					lines.push("");
				}
			}

			// ── System prompt ──────────────────────────────────────────────────
			if (showPrompt) {
				const prompt = ctx.getSystemPrompt();
				lines.push(`## System Prompt  (${prompt.length} chars)\n`);
				lines.push(prompt);
			}

			const content = lines.join("\n");

			pi.sendMessage(
				{
					customType: "system-prompt",
					content,
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});
}
