/**
 * Pi Docs Filter Extension
 *
 * Removes the bundled Pi documentation guidance block from the system prompt
 * when working inside the pi-ext repository.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { basename } from "node:path";

const PI_DOCS_BLOCK =
	/Pi documentation \(read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI\):\s*\n[\s\S]*?(?=\n{2,}|$)/;

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		if (basename(event.systemPromptOptions.cwd) !== "pi-ext") {
			return undefined;
		}

		if (!PI_DOCS_BLOCK.test(event.systemPrompt)) {
			return undefined;
		}

		const cleanedPrompt = event.systemPrompt
			.replace(PI_DOCS_BLOCK, "")
			.replace(/\n{3,}/g, "\n\n")
			.trim();

		return {
			systemPrompt: cleanedPrompt,
		};
	});
}
