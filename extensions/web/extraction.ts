import { runCommand } from "./command.js";
import { extractGitHubMarkdown, isGitHubHostUrl, parseGitHubUrl } from "./github.js";

export type ExtractionMethod = "github" | "cloudflare-markdown" | "html2markdown";

export type ExtractedMarkdown = {
	url: string;
	finalUrl?: string;
	method: ExtractionMethod;
	markdown: string;
	status?: number;
	contentType?: string;
	warnings: string[];
};

export type ExtractMarkdownOptions = {
	includeSelector?: string;
	excludeSelector?: string;
	signal?: AbortSignal;
	html2markdownCommand?: string;
	timeoutMs?: number;
};

type CloudflareMarkdownAttempt = {
	extracted?: ExtractedMarkdown;
	warnings: string[];
};

const DEFAULT_HTML2MARKDOWN_COMMAND = "html2markdown";

export async function extractMarkdownFromUrl(url: string, options: ExtractMarkdownOptions = {}): Promise<ExtractedMarkdown> {
	const parsedUrl = parseHttpUrl(url);
	const normalizedUrl = parsedUrl.toString();

	const githubTarget = parseGitHubUrl(normalizedUrl);
	if (githubTarget !== null) {
		const github = await extractGitHubMarkdown(githubTarget, {
			signal: options.signal,
			timeoutMs: options.timeoutMs,
		});
		return {
			url: normalizedUrl,
			method: "github",
			markdown: github.markdown,
			warnings: [],
		};
	}
	if (isGitHubHostUrl(normalizedUrl)) {
		throw new Error(
			`Unsupported GitHub URL form: ${normalizedUrl}. Recognized GitHub URLs are repositories, blob files, trees, issues, pull requests, and raw.githubusercontent.com files. GitHub URLs are handled only through gh; no generic HTML fallback will be used.`,
		);
	}

	const cloudflare = await tryCloudflareMarkdown(normalizedUrl, options.signal);
	if (cloudflare.extracted !== undefined) {
		return cloudflare.extracted;
	}

	return extractStaticHtmlMarkdown(normalizedUrl, options, cloudflare.warnings);
}

async function tryCloudflareMarkdown(url: string, signal: AbortSignal | undefined): Promise<CloudflareMarkdownAttempt> {
	const warnings: string[] = [];
	let response: Response;
	try {
		response = await fetch(url, {
			headers: { Accept: "text/markdown" },
			signal,
		});
	} catch (error) {
		warnings.push(`Cloudflare markdown request failed; trying static HTML. ${errorMessage(error)}`);
		return { warnings };
	}

	const contentType = response.headers.get("content-type") ?? undefined;
	const markdownTokens = response.headers.get("x-markdown-tokens");
	const body = await response.text();
	if (markdownTokens !== null) {
		warnings.push(`x-markdown-tokens: ${markdownTokens}`);
	}

	if (response.ok && contentTypeIncludes(contentType, "text/markdown") && body.trim().length > 0) {
		return {
			warnings,
			extracted: {
				url,
				finalUrl: response.url || undefined,
				method: "cloudflare-markdown",
				markdown: body,
				status: response.status,
				contentType,
				warnings,
			},
		};
	}

	if (!response.ok) {
		warnings.push(`Cloudflare markdown request returned HTTP ${response.status}; trying static HTML.`);
	}

	return { warnings };
}

async function extractStaticHtmlMarkdown(
	url: string,
	options: ExtractMarkdownOptions,
	warnings: string[],
): Promise<ExtractedMarkdown> {
	const response = await fetch(url, {
		headers: {
			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		},
		signal: options.signal,
	});
	const html = await response.text();
	if (!response.ok) {
		throw new Error(`Static HTML fetch failed with HTTP ${response.status}: ${snippet(html)}`);
	}

	const finalUrl = response.url || url;
	const markdown = await htmlToMarkdown(html, finalUrl, options);
	const contentType = response.headers.get("content-type") ?? undefined;

	return {
		url,
		finalUrl,
		method: "html2markdown",
		markdown,
		status: response.status,
		contentType,
		warnings,
	};
}

async function htmlToMarkdown(html: string, domainUrl: string, options: ExtractMarkdownOptions): Promise<string> {
	const result = await runCommand({
		command: options.html2markdownCommand ?? DEFAULT_HTML2MARKDOWN_COMMAND,
		args: buildHtml2MarkdownArgs(domainUrl, options),
		stdin: html,
		timeoutMs: options.timeoutMs,
		signal: options.signal,
	});

	return result.stdout.trimEnd();
}

export function buildHtml2MarkdownArgs(domainUrl: string, options: Pick<ExtractMarkdownOptions, "includeSelector" | "excludeSelector">): string[] {
	const args = ["--domain", domainUrl, "--plugin-table"];

	const includeSelector = cleanSelector(options.includeSelector);
	if (includeSelector !== undefined) {
		args.push("--include-selector", includeSelector);
	}

	const excludeSelector = cleanSelector(options.excludeSelector);
	if (excludeSelector !== undefined) {
		args.push("--exclude-selector", excludeSelector);
	}

	return args;
}

function parseHttpUrl(input: string): URL {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new Error(`Invalid URL: ${input}`);
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error(`URL must use http or https: ${input}`);
	}

	return url;
}

function contentTypeIncludes(contentType: string | undefined, expected: string): boolean {
	return contentType?.toLowerCase().includes(expected) ?? false;
}

function cleanSelector(value: string | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function snippet(value: string): string {
	const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
	if (normalized.length <= 500) {
		return normalized;
	}

	return `${normalized.slice(0, 500)}… [truncated]`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
