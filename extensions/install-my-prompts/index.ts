import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const EXTENSION_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(EXTENSION_DIR, "../..");
const PROMPTS_DIR = path.join(REPO_ROOT, "prompts");
const AGENT_DIR = path.join(os.homedir(), ".pi", "agent");
const PROMPT_TARGET_DIR = path.join(AGENT_DIR, "prompts");
const APPEND_SYSTEM_SOURCE = path.join(EXTENSION_DIR, "append-system.md");
const APPEND_SYSTEM_TARGET = path.join(AGENT_DIR, "APPEND_SYSTEM.md");

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
			target: path.join(PROMPT_TARGET_DIR, dirent.name),
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

async function installSymlink(source: string, target: string): Promise<"installed" | "skipped"> {
	const existingTarget = await resolveSymlinkTarget(target);
	if (existingTarget === source) return "skipped";

	if (await pathExists(target)) {
		await fs.rm(target, { recursive: true, force: true });
	}

	await fs.symlink(source, target);
	return "installed";
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("install-my-prompts", {
		description: "Symlink prompts and collaborative APPEND_SYSTEM.md into ~/.pi/agent",
		handler: async (_args, ctx) => {
			try {
				const prompts = await getPromptEntries();

				if (prompts.length === 0) {
					ctx.ui.notify(`No prompts found in ${PROMPTS_DIR}`, "error");
					return;
				}

				await fs.mkdir(PROMPT_TARGET_DIR, { recursive: true });
				await fs.mkdir(AGENT_DIR, { recursive: true });

				let installed = 0;
				let skipped = 0;

				for (const prompt of prompts) {
					const status = await installSymlink(prompt.source, prompt.target);
					if (status === "installed") installed += 1;
					else skipped += 1;
				}

				const appendSystemStatus = await installSymlink(APPEND_SYSTEM_SOURCE, APPEND_SYSTEM_TARGET);

				ctx.ui.notify(
					`Installed ${installed} prompt(s) to ${PROMPT_TARGET_DIR}, ${appendSystemStatus} APPEND_SYSTEM.md to ${APPEND_SYSTEM_TARGET}${skipped > 0 ? `, skipped ${skipped} already-linked prompt(s)` : ""}`,
					"info",
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Failed to install prompts: ${message}`, "error");
			}
		},
	});
}
