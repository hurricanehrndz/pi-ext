import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
	type TruncationOptions,
	type TruncationResult,
} from "@earendil-works/pi-coding-agent";

import type { WebSearchResult } from "./search.js";

export type ToolOutputTruncation = {
	content: string;
	result: TruncationResult;
	summary?: string;
};

export function truncateForToolOutput(content: string, options?: TruncationOptions): ToolOutputTruncation {
	const result = truncateHead(content, {
		maxLines: options?.maxLines ?? DEFAULT_MAX_LINES,
		maxBytes: options?.maxBytes ?? DEFAULT_MAX_BYTES,
	});

	return {
		content: result.content,
		result,
		summary: formatTruncationSummary(result),
	};
}

export function formatTruncationSummary(result: TruncationResult): string | undefined {
	if (!result.truncated) {
		return undefined;
	}

	const truncatedBy = result.truncatedBy ?? "limit";
	return `Output truncated by ${truncatedBy}: showing ${result.outputLines}/${result.totalLines} lines (${formatSize(result.outputBytes)} of ${formatSize(result.totalBytes)}).`;
}

export type FetchedMarkdownForFormatting = {
	url: string;
	finalUrl?: string;
	method: string;
	markdown: string;
	status?: number;
	contentType?: string;
	warnings?: readonly string[];
};

export function formatSearchResultsMarkdown(query: string, results: readonly WebSearchResult[]): string {
	const lines = [`Search results for: ${query}`, ""];

	if (results.length === 0) {
		lines.push("No results found.");
		return lines.join("\n");
	}

	results.forEach((result, index) => {
		lines.push(`${index + 1}. [${escapeMarkdownLinkText(result.title)}](${result.url})`);

		const metadata = formatSearchResultMetadata(result);
		if (metadata.length > 0) {
			lines.push(`   ${metadata}`);
		}

		if (result.content !== undefined) {
			lines.push(`   ${result.content}`);
		}

		if (index < results.length - 1) {
			lines.push("");
		}
	});

	return lines.join("\n");
}

export function formatFetchedMarkdown(fetch: FetchedMarkdownForFormatting): string {
	const lines = [`URL: ${fetch.url}`];

	if (fetch.finalUrl !== undefined && fetch.finalUrl !== fetch.url) {
		lines.push(`Final URL: ${fetch.finalUrl}`);
	}

	lines.push(`Extraction method: ${fetch.method}`);

	if (fetch.status !== undefined) {
		lines.push(`Status: ${fetch.status}`);
	}
	if (fetch.contentType !== undefined) {
		lines.push(`Content-Type: ${fetch.contentType}`);
	}
	if (fetch.warnings !== undefined && fetch.warnings.length > 0) {
		lines.push("Warnings:");
		for (const warning of fetch.warnings) {
			lines.push(`- ${warning}`);
		}
	}

	lines.push("", "---", "", fetch.markdown);
	return lines.join("\n");
}

function formatSearchResultMetadata(result: WebSearchResult): string {
	const parts: string[] = [];
	if (result.engines.length > 0) {
		parts.push(`Source: ${result.engines.join(", ")}`);
	}
	if (result.category !== undefined) {
		parts.push(`Category: ${result.category}`);
	}
	if (result.score !== undefined) {
		parts.push(`Score: ${result.score}`);
	}
	if (result.publishedDate !== undefined) {
		parts.push(`Published: ${result.publishedDate}`);
	}

	return parts.join(" | ");
}

function escapeMarkdownLinkText(value: string): string {
	return value.replace(/]/g, "\\]");
}
