import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";

import { getWebConfig } from "./config.js";
import {
	extractMarkdownFromUrl,
	type ExtractionMethod,
	type RenderMode,
} from "./extraction.js";
import { formatFetchedMarkdown, formatSearchResultsMarkdown, truncateForToolOutput } from "./format.js";
import { searchSearxng, type SearchTimeRange, type WebSearchResult } from "./search.js";

const DEFAULT_SEARCH_LIMIT = 8;
const DEFAULT_SEARCH_PAGE = 1;

const WebSearchParams = Type.Object({
	query: Type.String({ description: "Search query to send to SearXNG" }),
	userRequestReason: Type.String({
		description: "Briefly state the user's explicit request that authorizes web search for this task",
	}),
	limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, default: DEFAULT_SEARCH_LIMIT })),
	page: Type.Optional(Type.Integer({ minimum: 1, default: DEFAULT_SEARCH_PAGE })),
	categories: Type.Optional(Type.Array(Type.String())),
	engines: Type.Optional(Type.Array(Type.String())),
	language: Type.Optional(Type.String()),
	timeRange: Type.Optional(StringEnum(["day", "week", "month", "year"] as const)),
});

const WebFetchMarkdownParams = Type.Object({
	url: Type.String({ description: "URL to fetch and convert to Markdown" }),
	userRequestReason: Type.String({
		description: "Briefly state the user's explicit request that authorizes reading this web URL",
	}),
	renderMode: Type.Optional(StringEnum(["auto", "static", "browser"] as const)),
	includeSelector: Type.Optional(Type.String({ description: "Optional CSS selector to include for html2markdown conversion" })),
	excludeSelector: Type.Optional(Type.String({ description: "Optional CSS selector to exclude for html2markdown conversion" })),
});

type WebSearchDetails = {
	query: string;
	userRequestReason: string;
	params: {
		limit: number;
		page: number;
		categories?: string[];
		engines?: string[];
		language?: string;
		timeRange?: SearchTimeRange;
	};
	resultCount: number;
	results: WebSearchResult[];
	searchBaseUrl: string;
	truncation: ToolTruncationDetails;
};

type WebFetchMarkdownDetails = {
	url: string;
	finalUrl?: string;
	userRequestReason: string;
	params: {
		renderMode: RenderMode;
		includeSelector?: string;
		excludeSelector?: string;
	};
	method: ExtractionMethod;
	status?: number;
	contentType?: string;
	warnings: string[];
	truncation: ToolTruncationDetails;
};

type ToolTruncationDetails = {
	truncated: boolean;
	truncatedBy: "lines" | "bytes" | null;
	totalLines: number;
	totalBytes: number;
	outputLines: number;
	outputBytes: number;
	fullOutputPath?: string;
	summary?: string;
};

export default function webExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "internet_search",
		label: "Web Search",
		description: "Search the public web through SearXNG when the user explicitly requests web or current external information.",
		promptSnippet: "Search the public web through SearXNG only when the user explicitly asks for web/current information",
		promptGuidelines: [
			"Use internet_search only when the user explicitly asks for web search, current web information, or finding external web pages.",
			"Do not use internet_search speculatively when local files, provided context, or repository search are sufficient.",
			"When using internet_search, set userRequestReason to the user's explicit web-search directive.",
		],
		parameters: WebSearchParams,
		async execute(_toolCallId, params, signal) {
			const query = params.query.trim();
			if (query.length === 0) {
				throw new Error("internet_search query must not be empty");
			}

			const userRequestReason = params.userRequestReason.trim();
			if (userRequestReason.length === 0) {
				throw new Error("internet_search userRequestReason must state the user's explicit web-search request");
			}

			const config = getWebConfig();
			const effectiveParams = {
				limit: params.limit ?? DEFAULT_SEARCH_LIMIT,
				page: params.page ?? DEFAULT_SEARCH_PAGE,
				categories: cleanStringArray(params.categories),
				engines: cleanStringArray(params.engines),
				language: cleanOptionalString(params.language),
				timeRange: params.timeRange,
			};

			const results = await searchSearxng({
				baseUrl: config.searchBaseUrl,
				query,
				limit: effectiveParams.limit,
				page: effectiveParams.page,
				categories: effectiveParams.categories,
				engines: effectiveParams.engines,
				language: effectiveParams.language,
				timeRange: effectiveParams.timeRange,
				signal,
			});

			const markdown = formatSearchResultsMarkdown(query, results);
			const output = await prepareToolOutput(markdown, "web-search-results");

			const details: WebSearchDetails = {
				query,
				userRequestReason,
				params: effectiveParams,
				resultCount: results.length,
				results,
				searchBaseUrl: config.searchBaseUrl,
				truncation: {
					truncated: output.truncation.result.truncated,
					truncatedBy: output.truncation.result.truncatedBy,
					totalLines: output.truncation.result.totalLines,
					totalBytes: output.truncation.result.totalBytes,
					outputLines: output.truncation.result.outputLines,
					outputBytes: output.truncation.result.outputBytes,
					fullOutputPath: output.fullOutputPath,
					summary: output.truncation.summary,
				},
			};

			return {
				content: [{ type: "text", text: output.content }],
				details,
			};
		},
	});

	pi.registerTool({
		name: "web_fetch_markdown",
		label: "Web Fetch Markdown",
		description: "Fetch a user-requested URL and convert it to Markdown through GitHub, Cloudflare markdown, or html2markdown extraction.",
		promptSnippet: "Fetch a user-requested URL and convert it to Markdown using GitHub/Cloudflare/html2markdown/browser extraction",
		promptGuidelines: [
			"Use web_fetch_markdown only when the user explicitly asks to read, inspect, summarize, or extract a URL or website.",
			"Do not use web_fetch_markdown speculatively when local files or provided context are sufficient.",
			"Use web_fetch_markdown for URLs returned by internet_search only when the original user request asked for web research or URL inspection.",
			"When using web_fetch_markdown, set userRequestReason to the user's explicit URL-reading directive.",
		],
		parameters: WebFetchMarkdownParams,
		async execute(_toolCallId, params, signal) {
			const rawUrl = params.url.trim();
			if (rawUrl.length === 0) {
				throw new Error("web_fetch_markdown url must not be empty");
			}
			const url = normalizeHttpUrl(rawUrl);

			const userRequestReason = params.userRequestReason.trim();
			if (userRequestReason.length === 0) {
				throw new Error("web_fetch_markdown userRequestReason must state the user's explicit URL-reading request");
			}

			const renderMode = params.renderMode ?? "auto";
			const includeSelector = cleanOptionalString(params.includeSelector);
			const excludeSelector = cleanOptionalString(params.excludeSelector);
			const extracted = await extractMarkdownFromUrl(url, {
				renderMode,
				includeSelector,
				excludeSelector,
				signal,
			});

			const markdown = formatFetchedMarkdown(extracted);
			const output = await prepareToolOutput(markdown, "web-fetch-markdown");

			const details: WebFetchMarkdownDetails = {
				url: extracted.url,
				finalUrl: extracted.finalUrl,
				userRequestReason,
				params: {
					renderMode,
					includeSelector,
					excludeSelector,
				},
				method: extracted.method,
				status: extracted.status,
				contentType: extracted.contentType,
				warnings: extracted.warnings,
				truncation: buildTruncationDetails(output),
			};

			return {
				content: [{ type: "text", text: output.content }],
				details,
			};
		},
	});
}

type PreparedToolOutput = {
	content: string;
	fullOutputPath?: string;
	truncation: ReturnType<typeof truncateForToolOutput>;
};

function buildTruncationDetails(output: PreparedToolOutput): ToolTruncationDetails {
	return {
		truncated: output.truncation.result.truncated,
		truncatedBy: output.truncation.result.truncatedBy,
		totalLines: output.truncation.result.totalLines,
		totalBytes: output.truncation.result.totalBytes,
		outputLines: output.truncation.result.outputLines,
		outputBytes: output.truncation.result.outputBytes,
		fullOutputPath: output.fullOutputPath,
		summary: output.truncation.summary,
	};
}

async function prepareToolOutput(content: string, filePrefix: string): Promise<PreparedToolOutput> {
	const truncation = truncateForToolOutput(content);
	if (!truncation.result.truncated) {
		return { content: truncation.content, truncation };
	}

	const dir = await mkdtemp(join(tmpdir(), `${filePrefix}-`));
	const fullOutputPath = join(dir, "full-output.md");
	await writeFile(fullOutputPath, content, "utf8");

	const note = [
		truncation.summary ?? "Output truncated.",
		`Full output saved to: ${fullOutputPath}`,
	].join("\n");

	return {
		content: `${truncation.content}\n\n${note}`,
		fullOutputPath,
		truncation,
	};
}

function cleanStringArray(values: string[] | undefined): string[] | undefined {
	if (values === undefined) {
		return undefined;
	}

	const cleaned = values.map((value) => value.trim()).filter((value) => value.length > 0);
	return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeHttpUrl(input: string): string {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new Error(`Invalid URL: ${input}`);
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error(`URL must use http or https: ${input}`);
	}

	return url.toString();
}

function cleanOptionalString(value: string | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}
