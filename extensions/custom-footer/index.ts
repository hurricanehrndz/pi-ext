/**
 * Custom Footer Extension
 *
 * Renders a single compact powerline-style footer line:
 *
 *   ~/path/to/project (main) │ 12%/200k │ ⚡ claude-opus-4-5 (anthropic) • low
 *
 * Uses ctx.ui.setFooter() so it replaces the default pi footer.
 * Git branch is sourced from footerData.getGitBranch() (reactive via onBranchChange).
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import {
	buildPathString,
	fmtTokens,
	renderContextUsage,
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
					const pct = usage?.percent ?? 0;
					const win = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const ctxInfo = renderContextUsage(pct, win, theme);

					// Model + thinking
					const modelId = ctx.model?.id ?? "no-model";
					const provider = ctx.model?.provider ?? "unknown";
					const thinking = pi.getThinkingLevel();
					const modelInfo = renderModelInfo(modelId, provider, thinking, theme);

					// Budget path to fill remaining space
					const rightW = ctxInfo.rawWidth + sepW + modelInfo.rawWidth;
					const pathBudget = width - rightW - sepW;
					const pathDisplay = renderPath(pathRaw, pathBudget, theme);

					// Assemble segments
					const parts: string[] = [];
					if (pathDisplay) parts.push(pathDisplay);
					parts.push(ctxInfo.text);
					parts.push(modelInfo.text);

					return [truncateToWidth(parts.join(sep), width)];
				},
			};
		});
	});
}
