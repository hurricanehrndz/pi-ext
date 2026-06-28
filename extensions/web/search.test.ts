import { describe, expect, test } from "bun:test";

import { buildSearxngSearchUrl, normalizeSearxngResponse } from "./search.js";

describe("buildSearxngSearchUrl", () => {
	test("builds a SearXNG JSON search URL", () => {
		const url = buildSearxngSearchUrl("https://search.example", {
			query: "html2markdown selectors",
			page: 2,
			categories: ["general", "it"],
			engines: ["duckduckgo"],
			language: "en",
			timeRange: "week",
		});

		expect(url.toString()).toBe(
			"https://search.example/search?q=html2markdown+selectors&format=json&pageno=2&categories=general%2Cit&engines=duckduckgo&language=en&time_range=week",
		);
	});
});

describe("normalizeSearxngResponse", () => {
	test("ignores number_of_results and limits normalized results by actual array length", () => {
		const results = normalizeSearxngResponse(
			{
				number_of_results: 1000,
				results: [
					{ title: "One", url: "https://example.com/1", content: "First", engines: ["duckduckgo"] },
					{ title: "Two", url: "https://example.com/2", content: "Second", engines: ["brave"] },
					{ title: "Three", url: "https://example.com/3", content: "Third", engines: ["google"] },
				],
			},
			2,
		);

		expect(results).toHaveLength(2);
		expect(results.map((result) => result.title)).toEqual(["One", "Two"]);
	});

	test("handles missing optional fields without crashing", () => {
		const results = normalizeSearxngResponse({ results: [{ title: "Title", url: "https://example.com" }] });

		expect(results).toEqual([
			{
				title: "Title",
				url: "https://example.com",
				engines: [],
			},
		]);
	});

	test("normalizes optional metadata when present", () => {
		const results = normalizeSearxngResponse({
			results: [
				{
					title: "Title",
					url: "https://example.com",
					content: "Snippet",
					engines: ["duckduckgo", 123, "google"],
					category: "general",
					score: 12.5,
					publishedDate: "2026-01-02",
				},
			],
		});

		expect(results[0]).toEqual({
			title: "Title",
			url: "https://example.com",
			content: "Snippet",
			engines: ["duckduckgo", "google"],
			category: "general",
			score: 12.5,
			publishedDate: "2026-01-02",
		});
	});

	test("throws when the response does not contain a results array", () => {
		expect(() => normalizeSearxngResponse({})).toThrow("missing results array");
	});
});
