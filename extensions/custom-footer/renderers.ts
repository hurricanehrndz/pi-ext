/**
 * Pure rendering helpers for the custom footer.
 *
 * Each function produces a styled string segment — no side effects.
 * All colors are resolved via theme roles (no hardcoded ANSI).
 */

import type { SessionEntry, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

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

export function composeFooterLine(
	left: string,
	right: string,
	separator: string,
	width: number,
): string {
	if (width <= 0) return "";

	if (!right) return truncateToWidth(left, width);

	const rightDisplay = truncateToWidth(right, width);
	const rightWidth = visibleWidth(rightDisplay);
	const separatorWidth = visibleWidth(separator);
	const leftBudget = width - rightWidth - separatorWidth;

	if (!left || leftBudget <= 0) {
		return " ".repeat(Math.max(0, width - rightWidth)) + rightDisplay;
	}

	const leftDisplay = truncateToWidth(left, leftBudget);
	const padding = Math.max(
		0,
		width - visibleWidth(leftDisplay) - separatorWidth - rightWidth,
	);
	return leftDisplay + separator + " ".repeat(padding) + rightDisplay;
}

// ── Session Usage ──────────────────────────────────────────────────────

export type SessionUsageStats = {
	cost: number;
	cacheRead: number;
	cacheWrite: number;
	cacheHitRate: number | null;
};

export function getSessionUsageStats(entries: readonly SessionEntry[]): SessionUsageStats {
	let cost = 0;
	let cacheRead = 0;
	let cacheWrite = 0;
	let cacheHitRate: number | null = null;

	for (const entry of entries) {
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;

		const usage = entry.message.usage;
		cost += usage.cost.total;
		cacheRead += usage.cacheRead;
		cacheWrite += usage.cacheWrite;

		const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
		cacheHitRate = promptTokens > 0 ? (usage.cacheRead / promptTokens) * 100 : null;
	}

	return { cost, cacheRead, cacheWrite, cacheHitRate };
}

export function getSessionCost(entries: readonly SessionEntry[]): number {
	return getSessionUsageStats(entries).cost;
}

export function renderCost(cost: number, theme: FooterTheme): { text: string; rawWidth: number } {
	const raw = `$${cost.toFixed(3)}`;
	return { text: theme.fg("muted", raw), rawWidth: visibleWidth(raw) };
}

export function renderCacheUsage(
	stats: SessionUsageStats,
	theme: FooterTheme,
): { text: string; rawWidth: number } {
	const parts: string[] = [];
	if (stats.cacheRead > 0) parts.push(`R${fmtTokens(stats.cacheRead)}`);
	if (stats.cacheWrite > 0) parts.push(`W${fmtTokens(stats.cacheWrite)}`);
	if ((stats.cacheRead > 0 || stats.cacheWrite > 0) && stats.cacheHitRate !== null) {
		parts.push(`CH${stats.cacheHitRate.toFixed(1)}%`);
	}

	const raw = parts.join(" ");
	return { text: theme.fg("muted", raw), rawWidth: visibleWidth(raw) };
}

// ── Context Usage ──────────────────────────────────────────────────────

export function renderContextUsage(
	pct: number | null,
	win: number,
	theme: FooterTheme,
): { text: string; rawWidth: number } {
	const raw = pct === null ? `?/${fmtTokens(win)}` : `${pct.toFixed(0)}%/${fmtTokens(win)}`;
	let text: string;
	if (pct === null) text = theme.fg("muted", raw);
	else if (pct > 90) text = theme.fg("error", raw);
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
