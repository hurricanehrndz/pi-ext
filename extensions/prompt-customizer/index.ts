/**
 * Prompt Customizer Extension
 *
 * Reproduces pi's default system prompt via `before_agent_start`, giving full
 * control over every section. Edit the sections below to customise your prompt
 * without losing context-file, skill, or tool-snippet support.
 *
 * Sections (in order):
 *   1. ROLE        – the opening "You are …" paragraph
 *   2. TOOLS       – available tools list (auto-derived from selectedTools + toolSnippets)
 *   3. GUIDELINES  – bullet list of behaviour rules (auto-derived + always-on)
 *   4. PI DOCS     – links to README / docs / examples (can be removed if not working on pi)
 *   5. APPEND      – user-supplied --append-system-prompt content (pass-through)
 *   6. CONTEXT     – project context files e.g. AGENTS.md (pass-through)
 *   7. SKILLS      – available skills block (pass-through, gated on read tool)
 *   8. FOOTER      – current date + working directory (always last)
 *
 * Usage:
 *   pi -e ./extensions/prompt-customizer/index.ts
 */

import type { BuildSystemPromptOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatSkillsForPrompt } from "@earendil-works/pi-coding-agent";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Resolve pi package paths (README, docs/, examples/) ──────────────────────
// import.meta.resolve gives us <pkg>/dist/index.js; we go up two levels to reach
// the package root where README.md, docs/, and examples/ live.
function getPiPackageDir(): string {
	const indexUrl = import.meta.resolve("@earendil-works/pi-coding-agent");
	const indexPath = fileURLToPath(indexUrl);
	return resolve(dirname(dirname(indexPath))); // dist/ → package root
}

// ── Section builders ──────────────────────────────────────────────────────────

/** Section 1 – Role declaration */
function buildRole(): string {
	return "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.";
}

/** Section 2 – Available tools list */
function buildTools(options: BuildSystemPromptOptions): string {
	const tools = options.selectedTools ?? ["read", "bash", "edit", "write"];
	const visibleTools = tools.filter((name) => !!options.toolSnippets?.[name]);
	const toolsList =
		visibleTools.length > 0
			? visibleTools.map((name) => `- ${name}: ${options.toolSnippets![name]}`).join("\n")
			: "(none)";

	return `Available tools:\n${toolsList}\n\nIn addition to the tools above, you may have access to other custom tools depending on the project.`;
}

/** Section 3 – Behaviour guidelines */
function buildGuidelines(options: BuildSystemPromptOptions): string {
	const tools = options.selectedTools ?? ["read", "bash", "edit", "write"];
	const hasBash = tools.includes("bash");
	const hasGrep = tools.includes("grep");
	const hasFind = tools.includes("find");
	const hasLs = tools.includes("ls");

	const seen = new Set<string>();
	const items: string[] = [];

	const add = (g: string) => {
		const norm = g.trim();
		if (norm && !seen.has(norm)) {
			seen.add(norm);
			items.push(norm);
		}
	};

	// File-exploration guidance (matches pi default logic)
	if (hasBash && !hasGrep && !hasFind && !hasLs) {
		add("Use bash for file operations like ls, rg, find");
	} else if (hasBash && (hasGrep || hasFind || hasLs)) {
		add("Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)");
	}

	// Tool-registered guidelines (from extensions / registered tools)
	for (const g of options.promptGuidelines ?? []) {
		add(g);
	}

	// Always-on guidelines
	add("Be concise in your responses");
	add("Show file paths clearly when working with files");

	return `Guidelines:\n${items.map((g) => `- ${g}`).join("\n")}`;
}

/** Section 4 – Pi documentation pointers */
function buildPiDocs(): string {
	const pkgDir = getPiPackageDir();
	const readmePath = join(pkgDir, "README.md");
	const docsPath = join(pkgDir, "docs");
	const examplesPath = join(pkgDir, "examples");

	return [
		"Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):",
		`- Main documentation: ${readmePath}`,
		`- Additional docs: ${docsPath}`,
		`- Examples: ${examplesPath} (extensions, custom tools, SDK)`,
		"- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md)",
		"- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing",
		"- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)",
	].join("\n");
}

/** Section 5 – User --append-system-prompt passthrough */
function buildAppend(options: BuildSystemPromptOptions): string {
	return options.appendSystemPrompt ? `\n\n${options.appendSystemPrompt}` : "";
}

/** Section 6 – Project context files (AGENTS.md, etc.) passthrough */
function buildContextFiles(options: BuildSystemPromptOptions): string {
	const files = options.contextFiles ?? [];
	if (files.length === 0) return "";

	const lines = ["\n\n# Project Context\n", "Project-specific instructions and guidelines:\n"];
	for (const { path: filePath, content } of files) {
		lines.push(`## ${filePath}\n\n${content}\n`);
	}
	return lines.join("\n");
}

/** Section 7 – Skills block passthrough (only when read tool is active) */
function buildSkills(options: BuildSystemPromptOptions): string {
	const tools = options.selectedTools ?? ["read", "bash", "edit", "write"];
	const hasRead = tools.includes("read");
	const skills = options.skills ?? [];
	if (!hasRead || skills.length === 0) return "";
	return formatSkillsForPrompt(skills);
}

/** Section 8 – Date + CWD footer */
function buildFooter(options: BuildSystemPromptOptions): string {
	const now = new Date();
	const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
	const cwd = options.cwd.replace(/\\/g, "/");
	return `\nCurrent date: ${date}\nCurrent working directory: ${cwd}`;
}

// ── Extension entry point ─────────────────────────────────────────────────────

export default function promptCustomizer(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		const opts = event.systemPromptOptions;

		const prompt = [
			buildRole(),
			"",
			buildTools(opts),
			"",
			buildGuidelines(opts),
			// "",
			// buildPiDocs(),
		].join("\n") +
			buildAppend(opts) +
			buildContextFiles(opts) +
			buildSkills(opts) +
			buildFooter(opts);

		return { systemPrompt: prompt };
	});
}
