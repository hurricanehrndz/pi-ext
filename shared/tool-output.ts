import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
	type TruncationOptions,
	type TruncationResult,
} from "@earendil-works/pi-coding-agent";

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
