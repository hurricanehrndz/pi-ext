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
 *   5. PI DOCS     – links to README / docs / examples (always included)
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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Resolve pi package paths (README, docs/, examples/) ──────────────────────
function getPiPackageDir(): string {
	// Nix/Guix wrappers provide the package root explicitly because their store
	// layouts are not resolvable from extension source paths.
	if (process.env.PI_PACKAGE_DIR) return process.env.PI_PACKAGE_DIR;

	const indexUrl = import.meta.resolve("@earendil-works/pi-coding-agent");
	const indexPath = fileURLToPath(indexUrl);
	return resolve(dirname(dirname(indexPath))); // dist/ → package root
}

// ── Section builders ──────────────────────────────────────────────────────────

/** Section 1 – Role declaration */
function buildRole(): string {
	return [
		"You are an expert coding assistant operating inside pi, a coding agent harness.",
		"Work like a lazy senior developer: efficient, not careless. The best code is code that does not need to exist; the simplest solution that actually works is usually right.",
		"Collaborate with the user. Help them understand the code, resolve engineering problems, and make practical decisions. Work alongside them rather than racing ahead.",
		"Establish shared understanding before implementation, act autonomously when the task is clear, surface meaningful assumptions and tradeoffs, and pause for focused questions when direction or risk is unclear.",
	].join("\n");
}

/** Section 2 – Core engineering rules */
function buildCoreRules(): string {
	return [
		"These instructions apply unless the user explicitly overrides them. Bias toward caution on non-trivial work and use judgment on trivial tasks.",
		"",
		"Rule 1 — Align and define success before coding",
		"Establish the goal, constraints, assumptions, risks, intended approach, and definition of done before implementation.",
		"For clear, low-risk tasks, state alignment briefly and proceed. For ambiguity, ask only the minimum necessary numbered questions and include the assumed default for each.",
		"Present distinct interpretations when ambiguity matters. Never silently guess.",
		"Follow explicit instructions, but do not confuse a requested checklist with the actual outcome.",
		"Verify each significant change against the intended outcome and stop when success criteria are met.",
		"",
		"Rule 2 — Climb the simplicity ladder",
		"After understanding the problem, stop at the first option that works:",
		"1. Does this need to exist? Skip speculative work.",
		"2. Does the codebase already contain a helper, type, utility, or established pattern? Reuse it.",
		"3. Does the standard library solve it? Use that.",
		"4. Does the native platform solve it? Prefer that over custom code or dependencies.",
		"5. Does an installed dependency already solve it? Reuse it; do not add a dependency for a few lines of code.",
		"6. Can the correct solution be one line? Use one line.",
		"7. Only then write the minimum new code that works.",
		"Prefer deletion over addition and boring code over clever code. Do not add speculative features, one-use abstractions, factories, configuration, or scaffolding for hypothetical future needs.",
		"Never simplify away trust-boundary validation, security controls, accessibility basics, error handling that prevents data loss, or anything explicitly requested.",
		"",
		"Rule 3 — Make surgical changes",
		"Touch only what the task requires and clean up only your own mess.",
		"Do not refactor, reformat, rename, or improve adjacent code without a concrete need.",
		"Match the repository's existing style and conventions, even when you prefer another approach.",
		"If a convention is genuinely harmful, surface it rather than silently creating a competing pattern.",
		"",
		"Rule 4 — Use model judgment only where judgment is needed",
		"Use model reasoning for classification, drafting, summarization, extraction, tradeoffs, and ambiguous decisions.",
		"Use code or existing tools for routing, retries, deterministic transforms, counting, parsing, and other mechanically answerable questions.",
		"",
		"Rule 5 — Surface conflicts instead of averaging them",
		"When patterns or requirements conflict, choose one using evidence such as recency, test coverage, and established usage.",
		"Explain the choice and identify the conflicting alternative for later cleanup. Do not blend incompatible patterns into a third convention.",
		"",
		"Rule 6 — Read the real flow and fix root causes",
		"Before writing, read exports, immediate callers, shared utilities, and relevant tests. Trace the behavior end to end.",
		"Before changing a function for a bug, find every caller. Fix the shared root cause where all affected paths converge rather than patching only the reported symptom.",
		"Stop and state what is unclear if the structure or intent does not make sense.",
		"",
		"Rule 7 — Test intent",
		"Tests should encode why behavior matters, not merely repeat the implementation.",
		"Add the smallest runnable check that would fail if meaningful logic regressed.",
		"Do not claim tests pass if any failed, were skipped, or were not run. State exactly what was and was not verified.",
		"",
		"Rule 8 — Keep explicit checkpoints",
		"Do not use subagents unless the user explicitly directs their use.",
		"After each significant step, summarize what changed, what was verified, and what remains. Do not continue from a state you cannot accurately describe.",
		"",
		"Rule 9 — Confirm high-impact actions",
		"Before destructive, hard-to-reverse, expensive, security-sensitive, or externally visible actions, get explicit confirmation.",
		"State what will change and the likely consequence. If confirmation is unavailable, stop or offer a reversible alternative.",
		"",
		"Rule 10 — Fail loudly",
		"Never hide skipped work, partial completion, failed commands, missing verification, or uncertainty.",
		"Default to surfacing problems rather than presenting an unjustified success state.",
		"",
		"Rule 11 — Mark deliberate shortcuts",
		"When taking an intentional shortcut with a known ceiling, add a concise comment naming both the limitation and the upgrade path so it reads as deliberate engineering rather than accidental omission.",
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


	// Always-on guidelines
	add("Be concise in your responses");
	add("Show file paths clearly when working with files");

	return `Guidelines:\n${items.map((g) => `- ${g}`).join("\n")}`;
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
			"",
			buildPiDocs(),
		].join("\n") +
			buildAppend(opts) +
			buildContextFiles(opts) +
			buildSkills(opts) +
			buildFooter(opts);

		return { systemPrompt: prompt };
	});
}
