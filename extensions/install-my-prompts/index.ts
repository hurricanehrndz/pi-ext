import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const EXTENSION_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(EXTENSION_DIR, "../..");
const PROMPTS_DIR = path.join(REPO_ROOT, "prompts");
const TARGET_DIR = path.join(os.homedir(), ".pi", "agent", "prompts");

type PromptEntry = {
	name: string;
	source: string;
	target: string;
};

async function getPromptEntries(): Promise<PromptEntry[]> {
	const dirents = await fs.readdir(PROMPTS_DIR, { withFileTypes: true });

	return dirents
		.filter((dirent) => dirent.isFile() && dirent.name.endsWith(".md"))
		.map((dirent) => ({
			name: dirent.name,
			source: path.join(PROMPTS_DIR, dirent.name),
			target: path.join(TARGET_DIR, dirent.name),
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveSymlinkTarget(filePath: string): Promise<string | null> {
	const linkTarget = await fs.readlink(filePath).catch(() => null);
	if (!linkTarget) return null;
	return path.resolve(path.dirname(filePath), linkTarget);
}

async function pathExists(filePath: string): Promise<boolean> {
	return await fs.lstat(filePath).then(() => true, () => false);
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("install-my-prompts", {
		description: "Symlink prompts from this repo into ~/.pi/agent/prompts",
		handler: async (_args, ctx) => {
			try {
				const prompts = await getPromptEntries();

				if (prompts.length === 0) {
					ctx.ui.notify(`No prompts found in ${PROMPTS_DIR}`, "error");
					return;
				}

				await fs.mkdir(TARGET_DIR, { recursive: true });

				const conflicts: string[] = [];
				for (const prompt of prompts) {
					if (!(await pathExists(prompt.target))) continue;

					const existingTarget = await resolveSymlinkTarget(prompt.target);
					if (existingTarget === prompt.source) continue;

					conflicts.push(prompt.name);
				}

				if (conflicts.length > 0) {
					if (!ctx.hasUI) {
						ctx.ui.notify(
							`Cannot replace existing prompts without UI confirmation: ${conflicts.join(", ")}`,
							"error",
						);
						return;
					}

					const confirmed = await ctx.ui.confirm(
						"Replace existing prompts?",
						`This will replace ${conflicts.length} existing prompt(s): ${conflicts.join(", ")}`,
					);

					if (!confirmed) {
						ctx.ui.notify("Cancelled", "info");
						return;
					}
				}

				let installed = 0;
				let skipped = 0;

				for (const prompt of prompts) {
					const existingTarget = await resolveSymlinkTarget(prompt.target);
					if (existingTarget === prompt.source) {
						skipped += 1;
						continue;
					}

					if (await pathExists(prompt.target)) {
						await fs.rm(prompt.target, { recursive: true, force: true });
					}

					await fs.symlink(prompt.source, prompt.target);
					installed += 1;
				}

				ctx.ui.notify(
					`Installed ${installed} prompt(s) to ${TARGET_DIR}${skipped > 0 ? `, skipped ${skipped} already-linked prompt(s)` : ""}`,
					"info",
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Failed to install prompts: ${message}`, "error");
			}
		},
	});
}
