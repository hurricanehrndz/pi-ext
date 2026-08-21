import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildHtml2MarkdownArgs, extractMarkdownFromUrl } from "./extraction.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("extractMarkdownFromUrl", () => {
	test("rejects unsupported GitHub URL forms instead of falling back to static HTML", async () => {
		await expect(extractMarkdownFromUrl("https://github.com/CeramicTeam/html-to-markdown/v2")).rejects.toThrow(
			"Unsupported GitHub URL form",
		);
	});

	test("uses Cloudflare Markdown-for-Agents when available", async () => {
		let requestCount = 0;
		globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
			requestCount += 1;
			expect(new Headers(init?.headers).get("accept")).toBe("text/markdown");
			return new Response("# Cloudflare Markdown", {
				status: 200,
				headers: { "content-type": "text/markdown", "x-markdown-tokens": "3" },
			});
		}) as unknown as typeof fetch;

		const extracted = await extractMarkdownFromUrl("https://example.com/docs");

		expect(requestCount).toBe(1);
		expect(extracted.method).toBe("cloudflare-markdown");
		expect(extracted.markdown).toBe("# Cloudflare Markdown");
		expect(extracted.warnings).toEqual(["x-markdown-tokens: 3"]);
	});

	test("falls back to static HTML and html2markdown", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fake-html2markdown-"));
		const command = join(dir, "html2markdown");
		await writeFile(command, "#!/bin/sh\ncat\n");
		await chmod(command, 0o755);

		const responses = [
			new Response("<html><body>initial response</body></html>", {
				status: 200,
				headers: { "content-type": "text/html" },
			}),
			new Response("<html><body><main>Static article</main></body></html>", {
				status: 200,
				headers: { "content-type": "text/html" },
			}),
		];
		globalThis.fetch = (async () => {
			const response = responses.shift();
			if (response === undefined) {
				throw new Error("unexpected fetch");
			}
			return response;
		}) as unknown as typeof fetch;

		const extracted = await extractMarkdownFromUrl("https://example.com/article", {
			html2markdownCommand: command,
			includeSelector: "main",
			excludeSelector: "nav",
		});

		expect(responses).toHaveLength(0);
		expect(extracted.method).toBe("html2markdown");
		expect(extracted.markdown).toContain("Static article");
		expect(extracted.contentType).toBe("text/html");
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
