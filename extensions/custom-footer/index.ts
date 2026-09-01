/**
 * Custom Footer Extension
 *
 * Renders a single compact powerline-style footer line:
 *
 *   ⚡ claude-opus-4-5 (anthropic) • low │ 12%/200k │ $0.123 │ ~/path (main) │     R120k W8.2k CH84.3%
 *
 * Uses ctx.ui.setFooter() so it replaces the default pi footer.
 * Git branch is sourced from footerData.getGitBranch() (reactive via onBranchChange).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	buildPathString,
	composeFooterLine,
	getSessionUsageStats,
	renderCacheUsage,
	renderContextUsage,
	renderCost,
	renderModelInfo,
	renderPath,
} from "./renderers.js";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsub,
				invalidate() {},

				render(width: number): string[] {
					const sep = theme.fg("dim", " │ ");
					const sepW = 3;

					// Path + branch
					const branch = footerData.getGitBranch();
					const pathRaw = buildPathString(process.cwd(), branch);

					// Context usage
					const usage = ctx.getContextUsage();
					const pct = usage?.percent === null ? null : (usage?.percent ?? 0);
					const win = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const ctxInfo = renderContextUsage(pct, win, theme);

					// Cumulative stats across the whole session, including abandoned branches
					const sessionStats = getSessionUsageStats(ctx.sessionManager.getEntries());
					const cacheInfo = renderCacheUsage(sessionStats, theme);
					const costInfo = renderCost(sessionStats.cost, theme);

					// Model + thinking
					const modelId = ctx.model?.id ?? "no-model";
					const provider = ctx.model?.provider ?? "unknown";
					const thinking = pi.getThinkingLevel();
					const modelInfo = renderModelInfo(modelId, provider, thinking, theme);

					const leftParts = [modelInfo, ctxInfo, costInfo];
					const fixedLeftW =
						leftParts.reduce((total, part) => total + part.rawWidth, 0) +
						sepW * (leftParts.length - 1);
					const groupSepW = cacheInfo.rawWidth > 0 ? sepW : 0;
					const pathDisplay = renderPath(
						pathRaw,
						width - fixedLeftW - cacheInfo.rawWidth - groupSepW - sepW,
						theme,
					);
					const leftDisplay = [
						...leftParts.map((part) => part.text),
						...(pathDisplay ? [pathDisplay] : []),
					].join(sep);
					return [composeFooterLine(leftDisplay, cacheInfo.text, sep, width)];
				},
			};
		});
	});
}
