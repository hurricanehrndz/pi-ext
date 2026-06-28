import { describe, expect, test } from "bun:test";

import { looksLikeJsAppShell } from "./shell-detect.js";

describe("looksLikeJsAppShell", () => {
	test("does not trigger for article-like static HTML", () => {
		const paragraph = "This article has meaningful text for static extraction. ".repeat(20);
		const html = `<html><body><main><h1>Article</h1><p>${paragraph}</p></main></body></html>`;
		const markdown = `# Article\n\n${paragraph}`;

		expect(looksLikeJsAppShell(html, markdown)).toBe(false);
	});

	test("triggers for a tiny SPA root shell", () => {
		const html = `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`;

		expect(looksLikeJsAppShell(html, "Loading...")).toBe(true);
	});

	test("does not trigger solely because a page has many scripts when body text is meaningful", () => {
		const scripts = Array.from({ length: 20 }, (_value, index) => `<script src="/${index}.js"></script>`).join("");
		const paragraph = "Meaningful body text remains available without browser rendering. ".repeat(20);
		const html = `<html><body><main><p>${paragraph}</p></main>${scripts}</body></html>`;
		const markdown = paragraph;

		expect(looksLikeJsAppShell(html, markdown)).toBe(false);
	});
});
