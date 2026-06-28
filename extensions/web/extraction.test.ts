import { describe, expect, test } from "bun:test";

import { buildHtml2MarkdownArgs, extractMarkdownFromUrl, shouldUseBrowserFallback } from "./extraction.js";

describe("shouldUseBrowserFallback", () => {
	test("does not use browser fallback when renderMode is static, even for app-shell HTML", () => {
		const html = `<!doctype html><html><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>`;

		expect(shouldUseBrowserFallback("static", html, "Loading...")).toBe(false);
	});

	test("uses browser fallback when renderMode is browser", () => {
		expect(shouldUseBrowserFallback("browser", "<html><body>Article text</body></html>", "Article text")).toBe(true);
	});

	test("uses browser fallback in auto mode for app-shell HTML", () => {
		const html = `<!doctype html><html><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>`;

		expect(shouldUseBrowserFallback("auto", html, "Loading...")).toBe(true);
	});

	test("does not use browser fallback in auto mode for static article HTML", () => {
		const paragraph = "Useful static article content. ".repeat(30);
		const html = `<html><body><article><p>${paragraph}</p></article></body></html>`;

		expect(shouldUseBrowserFallback("auto", html, paragraph)).toBe(false);
	});
});

describe("extractMarkdownFromUrl", () => {
	test("rejects unsupported GitHub URL forms instead of falling back to static HTML", async () => {
		await expect(extractMarkdownFromUrl("https://github.com/CeramicTeam/html-to-markdown/v2", { renderMode: "static" })).rejects.toThrow(
			"Unsupported GitHub URL form",
		);
	});

	test("errors before fetching when renderMode browser is requested but the browser is unavailable", async () => {
		await expect(
			extractMarkdownFromUrl("https://example.com", { renderMode: "browser", browserAvailable: () => false }),
		).rejects.toThrow("agent-browser command was not found on PATH");
	});
});

describe("buildHtml2MarkdownArgs", () => {
	test("passes domain and table plugin", () => {
		expect(buildHtml2MarkdownArgs("https://example.com/docs", {})).toEqual([
			"--domain",
			"https://example.com/docs",
			"--plugin-table",
		]);
	});

	test("adds trimmed include and exclude selectors", () => {
		expect(
			buildHtml2MarkdownArgs("https://example.com/docs", {
				includeSelector: " main ",
				excludeSelector: " nav ",
			}),
		).toEqual([
			"--domain",
			"https://example.com/docs",
			"--plugin-table",
			"--include-selector",
			"main",
			"--exclude-selector",
			"nav",
		]);
	});
});
