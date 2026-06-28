import { mkdir } from "node:fs/promises";

import { buildPersistentBrowserOpenArgs, formatPersistentBrowserLoginCommand } from "../../shared/browser.js";
import { runCommand, type CommandResult } from "../../shared/command.js";
import { getWebConfig, type WebConfig } from "./config.js";

export type BrowserRenderOptions = {
	config?: WebConfig;
	timeoutMs?: number;
	signal?: AbortSignal;
};

export type BrowserRenderedHtml = {
	url: string;
	html: string;
	warnings: string[];
	browser: {
		command: string;
		session: string;
		profile: string;
	};
};

export type BrowserRenderCommandPlan = {
	openArgs: string[];
	evalArgs: string[];
	closeArgs: string[];
};

const OUTER_HTML_EXPRESSION = "document.documentElement.outerHTML";

export async function renderUrlWithBrowser(url: string, options: BrowserRenderOptions = {}): Promise<BrowserRenderedHtml> {
	const config = options.config ?? getWebConfig();
	await mkdir(config.browserProfile, { recursive: true });

	const commandPlan = buildBrowserRenderCommandPlan(config, url);
	try {
		// agent-browser `open <url>` launches a headless Chrome for Testing and navigates in one step.
		await runBrowserCommand("open browser", config, commandPlan.openArgs, url, options);
		const rendered = await runBrowserCommand("extract rendered DOM", config, commandPlan.evalArgs, url, options);
		const html = parseEvalHtml(rendered.stdout, config, url);

		return {
			url,
			html,
			warnings: [`Browser rendering used ${config.browserCommand} session ${config.browserSession} with dedicated profile ${config.browserProfile}.`],
			browser: {
				command: config.browserCommand,
				session: config.browserSession,
				profile: config.browserProfile,
			},
		};
	} finally {
		// The agent-browser daemon keeps the session alive; close it so it does not linger.
		await closeBrowserSession(config, commandPlan.closeArgs, options);
	}
}

export function buildBrowserRenderCommandPlan(config: WebConfig, url: string): BrowserRenderCommandPlan {
	const sessionArgs = ["--session", config.browserSession];
	return {
		openArgs: buildPersistentBrowserOpenArgs(config, url),
		evalArgs: [...sessionArgs, "eval", OUTER_HTML_EXPRESSION, "--json"],
		closeArgs: [...sessionArgs, "close"],
	};
}

export function formatBrowserLoginCommand(config: WebConfig, url: string): string {
	return formatPersistentBrowserLoginCommand(config, url);
}

// agent-browser `eval --json` returns { success, data: { result }, error }; the rendered DOM is data.result.
function parseEvalHtml(stdout: string, config: WebConfig, url: string): string {
	let parsed: { success?: boolean; data?: { result?: unknown }; error?: unknown };
	try {
		parsed = JSON.parse(stdout);
	} catch {
		throw new Error(
			`Browser rendering failed during extract rendered DOM using ${config.browserCommand}: could not parse --json output.\n${browserLoginGuidance(config, url)}`,
		);
	}

	const html = typeof parsed.data?.result === "string" ? parsed.data.result : "";
	if (parsed.success !== true || html.trim().length === 0) {
		const detail = parsed.error != null ? `: ${String(parsed.error)}` : "";
		throw new Error(
			`Browser rendering failed during extract rendered DOM using ${config.browserCommand}${detail}.\n${browserLoginGuidance(config, url)}`,
		);
	}

	return html;
}

async function closeBrowserSession(config: WebConfig, closeArgs: readonly string[], options: BrowserRenderOptions): Promise<void> {
	try {
		// Intentionally not signal-aware: cleanup must run even when the caller aborted.
		await runCommand({ command: config.browserCommand, args: closeArgs, timeoutMs: options.timeoutMs });
	} catch {
		// Best effort: a failed close must not mask the extraction result or error.
	}
}

async function runBrowserCommand(
	step: string,
	config: WebConfig,
	args: readonly string[],
	url: string,
	options: BrowserRenderOptions,
): Promise<CommandResult> {
	try {
		return await runCommand({
			command: config.browserCommand,
			args,
			timeoutMs: options.timeoutMs,
			signal: options.signal,
		});
	} catch (error) {
		throw new Error(
			`Browser rendering failed during ${step} using ${config.browserCommand}.\n${errorMessage(error)}\n${browserLoginGuidance(config, url)}`,
		);
	}
}

function browserLoginGuidance(config: WebConfig, url: string): string {
	return [
		"If this site requires authentication, log in through the dedicated agent-browser profile and retry.",
		`Run: ${formatBrowserLoginCommand(config, url)}`,
		"Do not use your personal/default Chrome profile for this workflow.",
	].join("\n");
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
