/**
 * Pure rendering helpers for the custom footer.
 *
 * Each function produces a styled string segment — no side effects.
 * All colors are resolved via theme roles (no hardcoded ANSI).
 */

import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

// ── Tokens ─────────────────────────────────────────────────────────────

export function fmtTokens(n: number): string {
	if (n < 1000) return n.toString();
	if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

// ── Types ──────────────────────────────────────────────────────────────

type FooterTheme = {
	fg: (role: ThemeColor, text: string) => string;
	bold: (text: string) => string;
	inverse: (text: string) => string;
};

// ── Path ───────────────────────────────────────────────────────────────

export function buildPathString(cwd: string, branch: string | null): string {
	let pwd = cwd;
	const home = process.env.HOME ?? process.env.USERPROFILE;
	if (home && pwd.startsWith(home)) pwd = `~${pwd.slice(home.length)}`;
	return pwd + (branch ? ` (${branch})` : "");
}

export function renderPath(pathRaw: string, budget: number, theme: FooterTheme): string {
	if (budget < 8) return "";
	if (visibleWidth(pathRaw) <= budget) return theme.fg("warning", pathRaw);
	return theme.fg("warning", "…" + pathRaw.slice(-(budget - 1)));
}

// ── Context Usage ──────────────────────────────────────────────────────

export function renderContextUsage(
	pct: number,
	win: number,
	theme: FooterTheme,
): { text: string; rawWidth: number } {
	const raw = `${pct.toFixed(0)}%/${fmtTokens(win)}`;
	let text: string;
	if (pct > 90) text = theme.fg("error", raw);
	else if (pct > 70) text = theme.fg("warning", raw);
	else text = theme.fg("success", raw);
	return { text, rawWidth: visibleWidth(raw) };
}

// ── Model + Thinking ───────────────────────────────────────────────────

const THINKING_ROLES: Record<string, string> = {
	off: "dim",
	minimal: "dim",
	low: "success",
	medium: "warning",
	high: "bashMode",
	xhigh: "error",
};

export function renderModelInfo(
	modelId: string,
	provider: string,
	thinking: string,
	theme: FooterTheme,
): { text: string; rawWidth: number } {
	const thinkSuffix = thinking !== "off" ? ` • ${thinking}` : "";
	const raw = `⚡ ${modelId} (${provider})${thinkSuffix}`;
	const rawWidth = visibleWidth(raw);

	let text = theme.fg("accent", `⚡ ${modelId}`) + theme.fg("muted", ` (${provider})`);
	if (thinking !== "off") {
		const role = (THINKING_ROLES[thinking] ?? "dim") as ThemeColor;
		text += theme.fg("dim", " • ") + theme.fg(role, thinking);
	}

	return { text, rawWidth };
}
