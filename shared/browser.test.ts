import { describe, expect, test } from "bun:test";

import { buildPersistentBrowserOpenArgs, formatPersistentBrowserLoginCommand, type BrowserProfileConfig } from "./browser.js";

const config: BrowserProfileConfig = {
	browserCommand: "agent-browser",
	browserSession: "pi-web",
	browserProfile: "~/.cache/pi-ext/web-research/browser-profile",
};

describe("buildPersistentBrowserOpenArgs", () => {
	test("builds persistent profile open args", () => {
		expect(buildPersistentBrowserOpenArgs(config, "https://example.com")).toEqual([
			"--session",
			"pi-web",
			"--profile",
			"~/.cache/pi-ext/web-research/browser-profile",
			"open",
			"https://example.com",
		]);
	});
});

describe("formatPersistentBrowserLoginCommand", () => {
	test("formats the headed login command for the dedicated profile", () => {
		expect(formatPersistentBrowserLoginCommand(config, "https://example.com")).toBe(
			"agent-browser --session pi-web --profile ~/.cache/pi-ext/web-research/browser-profile --headed open https://example.com",
		);
	});
});
