import { describe, expect, test } from "bun:test";

import { buildBrowserRenderCommandPlan, formatBrowserLoginCommand } from "./browser.js";
import type { WebConfig } from "./config.js";

const config: WebConfig = {
	searchBaseUrl: "https://search.example",
	browserSession: "pi-web",
	browserProfile: "~/.cache/pi-ext/web-research/browser-profile",
	browserCommand: "agent-browser",
};

describe("buildBrowserRenderCommandPlan", () => {
	test("builds the planned persistent profile render commands", () => {
		expect(buildBrowserRenderCommandPlan(config, "https://example.com")).toEqual({
			openArgs: [
				"--session",
				"pi-web",
				"--profile",
				"~/.cache/pi-ext/web-research/browser-profile",
				"open",
				"https://example.com",
			],
			evalArgs: ["--session", "pi-web", "eval", "document.documentElement.outerHTML", "--json"],
			closeArgs: ["--session", "pi-web", "close"],
		});
	});
});

describe("formatBrowserLoginCommand", () => {
	test("formats the headed login command for the dedicated profile", () => {
		expect(formatBrowserLoginCommand(config, "https://example.com")).toBe(
			"agent-browser --session pi-web --profile ~/.cache/pi-ext/web-research/browser-profile --headed open https://example.com",
		);
	});
});
