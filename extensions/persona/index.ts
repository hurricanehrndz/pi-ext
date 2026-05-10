/**
 * Persona Extension
 *
 * Dynamically overrides the agent's persona via a /persona command.
 * Any freeform description is injected into the system prompt on every turn.
 *
 * Usage:
 *   /persona <description>   – activate a persona
 *   /persona off             – clear the active persona
 *   /persona                 – show the current persona
 *
 * Examples:
 *   /persona a terse unix hacker who only uses lowercase and avoids pleasantries
 *   /persona a patient teacher who explains everything with simple analogies
 *   /persona a sceptical code reviewer who always asks "but what about edge cases?"
 *   /persona off
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let activePersona: string | null = null;

	pi.registerCommand("persona", {
		description: "Set or clear the agent persona. Usage: /persona <description> | off",
		handler: async (args, ctx) => {
			const input = args?.trim();

			if (!input) {
				if (activePersona) {
					ctx.ui.notify(`Active persona: ${activePersona}`, "info");
				} else {
					ctx.ui.notify("No persona active. Usage: /persona <description> | off", "info");
				}
				return;
			}

			if (input.toLowerCase() === "off") {
				activePersona = null;
				ctx.ui.notify("Persona cleared — back to default behaviour", "info");
				return;
			}

			activePersona = input;
			ctx.ui.notify(`Persona set: ${activePersona}`, "info");
		},
	});

	pi.on("before_agent_start", async (event) => {
		if (!activePersona) return undefined;

		return {
			systemPrompt:
				event.systemPrompt +
				`

PERSONA OVERRIDE: For this and every subsequent response you must embody the following persona. Never break character, but always complete the task correctly.

${activePersona}
`,
		};
	});
}
