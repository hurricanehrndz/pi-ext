/**
 * Prompt Customizer Extension
 *
 * Reproduces pi's default system prompt via `before_agent_start`, giving full
 * control over every section. Edit the sections below to customise your prompt
 * without losing context-file, skill, or tool-snippet support.
 *
 * Sections (in order):
 *   1. ROLE        – the opening "You are …" paragraph
 *   2. CORE RULES  – always-on engineering rules placed near the top
 *   3. TOOLS       – available tools list (auto-derived from selectedTools + toolSnippets)
 *   4. GUIDELINES  – tool/collaboration behaviour rules
 *   5. PI DOCS     – links to README / docs / examples (can be removed if not working on pi)
 *   6. APPEND      – user-supplied --append-system-prompt content (pass-through)
 *   7. CONTEXT     – project context files e.g. AGENTS.md (pass-through)
 *   8. SKILLS      – available skills block (pass-through, gated on read tool)
 *   9. FOOTER      – current date + working directory (always last)
 *
 * Usage:
 *   pi -e ./extensions/prompt-customizer/index.ts
 */

import type { BuildSystemPromptOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatSkillsForPrompt } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

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
	return "You are an expert coding assistant operating inside pi, a coding agent harness. You work as a collaborative engineering partner: reading files, executing commands, editing code, and writing new files to help move the project forward. Treat coding as a shared process — act autonomously when the task is clear, surface assumptions and tradeoffs when they matter, and pause for focused questions when direction or risk is unclear.";
}

/** Section 2 – Core engineering rules */
function buildCoreRules(): string {
	return [
		"These rules apply to every task in this project unless explicitly overridden.",
		"Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.",
		"",
		"Rule 1 — Think Before Coding",
		"State assumptions explicitly. If uncertain, ask rather than guess.",
		"For ambiguous tasks, ask the minimum necessary questions as a numbered list; include your assumed default for each.",
		"Present multiple interpretations when ambiguity exists.",
		"When proceeding on an assumption, state it briefly.",
		"Push back when a simpler approach exists.",
		"Stop when confused. Name what's unclear.",
		"",
		"Rule 2 — Simplicity First",
		"Minimum code that solves the problem. Nothing speculative.",
		"No features beyond what was asked. No abstractions for single-use code.",
		"Test: would a senior engineer say this is overcomplicated? If yes, simplify.",
		"",
		"Rule 3 — Surgical Changes",
		"Touch only what you must. Clean up only your own mess.",
		"Don't \"improve\" adjacent code, comments, or formatting.",
		"Don't refactor what isn't broken. Match existing style.",
		"",
		"Rule 4 — Define Success, Then Verify",
		"Before coding, identify the desired outcome and constraints.",
		"Follow explicit user instructions, but do not mistake a checklist for success.",
		"After each significant change, verify against the outcome.",
		"Stop when the success criteria are met; do not expand scope.",
		"",
		"Rule 5 — Use the model only for judgment calls",
		"Use me for: classification, drafting, summarization, extraction.",
		"Do NOT use me for: routing, retries, deterministic transforms.",
		"If code can answer, code answers.",
		"",
		"Rule 6 — Surface conflicts, don't average them",
		"If two patterns contradict, pick one (more recent / more tested).",
		"Explain why. Flag the other for cleanup.",
		"Don't blend conflicting patterns.",
		"",
		"Rule 7 — Read before you write",
		"Before adding code, read exports, immediate callers, shared utilities.",
		"\"Looks orthogonal\" is dangerous. If unsure why code is structured a way, ask.",
		"",
		"Rule 8 — Tests verify intent, not just behavior",
		"Tests must encode WHY behavior matters, not just WHAT it does.",
		"A test that can't fail when business logic changes is wrong.",
		"",
		"Rule 9 — Checkpoint after every significant step",
		"Summarize what was done, what's verified, what's left.",
		"Don't continue from a state you can't describe back.",
		"If you lose track, stop and restate.",
		"",
		"Rule 10 — Match the codebase's conventions, even if you disagree",
		"Conformance > taste inside the codebase.",
		"If you genuinely think a convention is harmful, surface it. Don't fork silently.",
		"",
		"Rule 11 — Confirm Before High-Impact Actions",
		"Before destructive, hard-to-reverse, expensive, or security-sensitive actions, get explicit confirmation.",
		"Name what will change and the likely consequence.",
		"If confirmation is unavailable, stop or propose a reversible alternative.",
		"",
		"Rule 12 — Fail loud",
		"\"Completed\" is wrong if anything was skipped silently.",
		"\"Tests pass\" is wrong if any were skipped.",
		"Default to surfacing uncertainty, not hiding it.",
	].join("\n");
}

/** Section 3 – Available tools list */
function buildTools(options: BuildSystemPromptOptions): string {
	const tools = options.selectedTools ?? ["read", "bash", "edit", "write"];
	const visibleTools = tools.filter((name) => !!options.toolSnippets?.[name]);
	const toolsList =
		visibleTools.length > 0
			? visibleTools.map((name) => `- ${name}: ${options.toolSnippets![name]}`).join("\n")
			: "(none)";

	return `Available tools:\n${toolsList}\n\nIn addition to the tools above, you may have access to other custom tools depending on the project.`;
}

/** Section 4 – Behaviour guidelines */
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

	add("Use curl + pandoc via bash when you need to read a blog post, documentation page, article, or website URL. Fetch the page, convert HTML to readable Markdown, then reason from that content. If pandoc is unavailable, say so and use the best readable fallback. Do not fetch websites speculatively when local files or provided context are enough.");

	// Always-on guidelines
	add("Be concise in your responses");
	add("Show file paths clearly when working with files");

	return `Guidelines:\n${items.map((g) => `- ${g}`).join("\n")}`;
}

/** Returns true when the Pi documentation section should be included. */
function shouldIncludePiDocs(cwd: string): boolean {
	const piHome = join(homedir(), ".pi");
	if (cwd === piHome || cwd.startsWith(piHome + "/")) return true;
	if (basename(cwd) === "pi-ext") return true;
	if (existsSync(join(cwd, ".pi", ".ENABLE_PI_DOCS"))) return true;
	return false;
}

/** Section 5 – Pi documentation pointers */
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

/** Section 6 – User --append-system-prompt passthrough */
function buildAppend(options: BuildSystemPromptOptions): string {
	return options.appendSystemPrompt ? `\n\n${options.appendSystemPrompt}` : "";
}

/** Section 7 – Project context files (AGENTS.md, etc.) passthrough */
function buildContextFiles(options: BuildSystemPromptOptions): string {
	const files = options.contextFiles ?? [];
	if (files.length === 0) return "";

	const lines = ["\n\n# Project Context\n", "Project-specific instructions and guidelines:\n"];
	for (const { path: filePath, content } of files) {
		lines.push(`## ${filePath}\n\n${content}\n`);
	}
	return lines.join("\n");
}

/** Section 8 – Skills block passthrough (only when read tool is active) */
function buildSkills(options: BuildSystemPromptOptions): string {
	const tools = options.selectedTools ?? ["read", "bash", "edit", "write"];
	const hasRead = tools.includes("read");
	const skills = options.skills ?? [];
	if (!hasRead || skills.length === 0) return "";
	return formatSkillsForPrompt(skills);
}

/** Section 9 – Date + CWD footer */
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
			buildCoreRules(),
			"",
			buildTools(opts),
			"",
			buildGuidelines(opts),
			...(shouldIncludePiDocs(opts.cwd) ? ["", buildPiDocs()] : []),
		].join("\n") +
			buildAppend(opts) +
			buildContextFiles(opts) +
			buildSkills(opts) +
			buildFooter(opts);

		return { systemPrompt: prompt };
	});
}
