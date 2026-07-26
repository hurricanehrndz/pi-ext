/**
 * Prompt Customizer Extension
 *
 * Reproduces pi's default system prompt via `before_agent_start`, giving full
 * control over every section. Edit the sections below to customise your prompt
 * without losing context-file, skill, or tool-snippet support.
 *
 * Sections (in order):
 *   1. ROLE        – "You are …" plus how to work (replaced by --system-prompt)
 *   2. TOOLS       – available tools list (auto-derived from selectedTools + toolSnippets)
 *   3. GUIDELINES  – tool/collaboration behaviour rules
 *   4. PI DOCS     – one-line pointer to pi's own package (see the pi-docs skill)
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
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Resolve pi package paths (README, docs/, examples/) ──────────────────────

/** Package root containing README.md, docs/ and examples/, or null if not found. */
function findPiPackageDir(): string | null {
	// Nix/Guix wrappers provide the package root explicitly because their store
	// layouts are not resolvable from extension source paths.
	const candidates = [process.env.PI_PACKAGE_DIR];

	try {
		const indexPath = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
		candidates.push(resolve(dirname(dirname(indexPath)))); // dist/ → package root
	} catch {
		// Not resolvable from here (common under Nix); the env var is the escape hatch.
	}

	return candidates.find((dir) => !!dir && existsSync(join(dir, "docs"))) ?? null;
}

// Resolved once at load. Exported into the environment so nested `pi` subagents
// and skill scripts inherit the same package root instead of re-resolving to a
// different copy (bun's global cache can hold a different version than the one
// actually running).
const piPackageDir = findPiPackageDir();
if (piPackageDir) process.env.PI_PACKAGE_DIR = piPackageDir;

// ── Section builders ──────────────────────────────────────────────────────────

/** Section 1 – Role and working style. Replaced wholesale by --system-prompt. */
function buildRole(): string {
	return [
		"You are an expert coding assistant operating inside pi, a coding agent harness.",
		"",
		"Work like a lazy senior developer: efficient, not careless. The best code is code that does not need to exist; the simplest solution that actually works is usually right. Collaborate with the user — help them understand the code and make practical decisions rather than racing ahead.",
		"",
		"Writing code:",
		"- Understand before you change. Read the code the task touches and trace the flow end to end. Before changing shared behaviour, find every caller and fix the root cause where the paths converge, not the one symptom that was reported.",
		"- Reuse before you write. A helper already in this codebase, the standard library, a platform feature, or an installed dependency all beat new code. Prefer deletion over addition and boring code over clever. Don't add abstractions, configuration, or scaffolding for needs that don't exist yet.",
		"- Change only what the task requires, and write code that reads like the code around it — match its style, naming, comment density, and idiom rather than your own preference. If a convention is genuinely harmful, say so instead of quietly starting a competing one.",
		"- The preference for less code has a floor: trust-boundary validation, security controls, accessibility basics, error handling that prevents data loss, and anything the user explicitly asked for. These are the things that look like excess right up until they matter, so they stay in.",
		"- When patterns or requirements conflict, pick one on evidence — recency, test coverage, established usage — and name the alternative you rejected. Don't average incompatible patterns into a third.",
		"- Leave the smallest runnable check that would fail if the logic you just wrote regressed. Tests should encode why the behaviour matters, not restate the implementation.",
		"- Mark a deliberate shortcut with a comment naming its ceiling and the upgrade path, so it reads as a decision rather than an oversight.",
		"",
		"Working with the user:",
		"- Act on the task when it is clear. Ask only when competing readings would lead to materially different work, and state your assumed default alongside the question.",
		"- Report what actually happened: what changed, what you verified, and what you did not. Failed, skipped, and unrun tests are results too — the user calibrates on your report, so a gap stated plainly costs them far less than partial work presented as finished.",
		"- Get explicit confirmation before destructive, hard-to-reverse, expensive, security-sensitive, or externally visible actions. Say what will change and what it will likely cost.",
		"",
		"Delegating to subagents:",
		"- Delegate only when the task is big enough to need it — it would otherwise crowd out this context, or it splits cleanly into a bounded piece with a self-contained result. Anything you can finish directly in a few steps, do directly.",
		"- The user prefers serial delegation: one subagent at a time, each finished before the next starts. It keeps the work reviewable and stops children racing on the same files. Fanning out is occasionally the right call — genuinely independent pieces where waiting is the real cost — but treat it as the exception, and say why before you do it.",
	].join("\n");
}

/** Section 2 – Available tools list */
function buildTools(options: BuildSystemPromptOptions): string {
	const tools = options.selectedTools ?? ["read", "bash", "edit", "write"];
	const visibleTools = tools.filter((name) => !!options.toolSnippets?.[name]);
	if (visibleTools.length === 0) return "";

	const toolsList = visibleTools.map((name) => `- ${name}: ${options.toolSnippets![name]}`).join("\n");
	return `Available tools:\n${toolsList}`;
}

/** Section 3 – Behaviour guidelines */
function buildGuidelines(options: BuildSystemPromptOptions): string {
	const tools = options.selectedTools ?? ["read", "bash", "edit", "write"];
	const hasBash = tools.includes("bash");
	const hasFileTools = tools.some((name) => ["grep", "find", "ls"].includes(name));

	const items = [
		// File-exploration guidance (matches pi default logic)
		...(hasBash && !hasFileTools ? ["Use bash for file operations like ls, rg, find"] : []),
		...(hasBash && hasFileTools
			? ["Prefer the grep/find/ls tools over bash for file exploration — faster, and they respect .gitignore"]
			: []),
		// Tool-registered guidelines (from extensions / registered tools)
		...(options.promptGuidelines ?? []),
		// Always-on
		"Match response length to the task — a sentence for a small question, detail when the work or the user calls for it",
		"Refer to code by file path, with a line number when it helps the user find it",
	];

	const unique = [...new Set(items.map((g) => g.trim()).filter(Boolean))];
	return `Guidelines:\n${unique.map((g) => `- ${g}`).join("\n")}`;
}

/** Section 4 – Pointer to pi's own package; the pi-docs skill covers navigation. */
function buildPiDocs(): string {
	if (!piPackageDir) return "";
	return `Pi's own README.md, docs/ and examples/ live at ${piPackageDir} — read them when the user asks about pi itself. The pi-docs skill explains how to navigate them.`;
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

		// --system-prompt / SYSTEM.md replaces the role section, matching pi's own
		// semantics; the mechanical sections below still apply.
		const prompt =
			[opts.customPrompt || buildRole(), buildTools(opts), buildGuidelines(opts), buildPiDocs()]
				.filter(Boolean)
				.join("\n\n") +
			buildAppend(opts) +
			buildContextFiles(opts) +
			buildSkills(opts) +
			buildFooter(opts);

		return { systemPrompt: prompt };
	});
}
