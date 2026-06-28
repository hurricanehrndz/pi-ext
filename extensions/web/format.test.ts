import { describe, expect, test } from "bun:test";

import { formatFetchedMarkdown, formatSearchResultsMarkdown, truncateForToolOutput } from "./format.js";

describe("formatSearchResultsMarkdown", () => {
	test("formats search results as concise Markdown", () => {
		const markdown = formatSearchResultsMarkdown("test query", [
			{
				title: "Example result",
				url: "https://example.com",
				content: "A useful snippet.",
				engines: ["duckduckgo", "google"],
				category: "general",
			},
		]);

		expect(markdown).toContain("Search results for: test query");
		expect(markdown).toContain("1. [Example result](https://example.com)");
		expect(markdown).toContain("Source: duckduckgo, google | Category: general");
		expect(markdown).toContain("A useful snippet.");
	});

	test("formats an empty result set", () => {
		expect(formatSearchResultsMarkdown("missing", [])).toBe("Search results for: missing\n\nNo results found.");
	});
});

describe("formatFetchedMarkdown", () => {
	test("formats extraction metadata header and Markdown body", () => {
		const markdown = formatFetchedMarkdown({
			url: "https://example.com",
			finalUrl: "https://www.example.com",
			method: "html2markdown",
			status: 200,
			contentType: "text/html",
			warnings: ["Used static HTML"],
			markdown: "# Example",
		});

		expect(markdown).toContain("URL: https://example.com");
		expect(markdown).toContain("Final URL: https://www.example.com");
		expect(markdown).toContain("Extraction method: html2markdown");
		expect(markdown).toContain("Warnings:\n- Used static HTML");
		expect(markdown.endsWith("---\n\n# Example")).toBe(true);
	});
});

describe("truncateForToolOutput", () => {
	test("uses pi head truncation limits for tool-visible output", () => {
		const truncation = truncateForToolOutput("line 1\nline 2\nline 3", { maxLines: 2, maxBytes: 1000 });

		expect(truncation.content).toBe("line 1\nline 2");
		expect(truncation.result.truncated).toBe(true);
		expect(truncation.summary).toContain("Output truncated by lines");
	});
});
