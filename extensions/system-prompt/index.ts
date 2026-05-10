/**
 * System Prompt Extension
 *
 * Adds a /system-prompt command that prints the current system prompt
 * into the conversation scroll buffer as a readable custom message.
 *
 * Usage:
 *   /system-prompt          – show system prompt
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("system-prompt", {
		description: "Show current system prompt",
		handler: async (_args, ctx) => {
			const prompt = ctx.getSystemPrompt();
			const content = [`## System Prompt  (${prompt.length} chars)\n`, prompt].join("\n");

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
