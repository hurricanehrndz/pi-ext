/**
 * Protected Paths Extension
 *
 * Blocks `write`/`edit` from clobbering an existing `.env`.
 *
 * This is an accident guard, not a boundary: bash bypasses it entirely
 * (`sed -i .env`, `echo >> .env`). It exists because `.env` is gitignored,
 * so overwriting one is the rare mistake git cannot undo. Creating a new
 * `.env` is allowed.
 */

import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "write" && event.toolName !== "edit") {
			return undefined;
		}

		const path = event.input.path as string;
		// basename, so `.env.example` and `src/env.ts` are untouched.
		if (basename(path) !== ".env" || !existsSync(path)) {
			return undefined;
		}

		if (ctx.hasUI) {
			ctx.ui.notify(`Blocked overwrite of existing ${path}`, "warning");
		}
		return {
			block: true,
			reason: `"${path}" already exists and is gitignored. Ask before replacing it, or delete it first.`,
		};
	});
}
