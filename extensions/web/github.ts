import { Buffer } from "node:buffer";

import { runCommand } from "./command.js";

export type GitHubTarget =
	| { kind: "repo"; owner: string; repo: string }
	| { kind: "blob"; owner: string; repo: string; ref: string; path: string }
	| { kind: "tree"; owner: string; repo: string; ref: string; path: string }
	| { kind: "issue"; owner: string; repo: string; number: number }
	| { kind: "pull"; owner: string; repo: string; number: number };

export function parseGitHubUrl(input: string): GitHubTarget | null {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return null;
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		return null;
	}

	const hostname = url.hostname.toLowerCase();
	if (hostname === "github.com" || hostname === "www.github.com") {
		return parseGitHubWebUrl(url);
	}

	if (hostname === "raw.githubusercontent.com") {
		return parseRawGitHubUrl(url);
	}

	return null;
}

export function isGitHubUrl(input: string): boolean {
	return parseGitHubUrl(input) !== null;
}

export function isGitHubHostUrl(input: string): boolean {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return false;
	}

	const hostname = url.hostname.toLowerCase();
	return hostname === "github.com" || hostname === "www.github.com" || hostname === "raw.githubusercontent.com";
}

function parseGitHubWebUrl(url: URL): GitHubTarget | null {
	const segments = pathSegments(url);
	const owner = segments[0];
	const repo = segments[1];
	if (owner === undefined || repo === undefined) {
		return null;
	}

	const route = segments[2];
	if (route === undefined) {
		return segments.length === 2 ? { kind: "repo", owner, repo } : null;
	}

	if (route === "blob") {
		const refAndPath = parseRefAndPath(segments.slice(3));
		if (refAndPath === null || refAndPath.path.length === 0) {
			return null;
		}
		return { kind: "blob", owner, repo, ref: refAndPath.ref, path: refAndPath.path };
	}

	if (route === "tree") {
		const refAndPath = parseRefAndPath(segments.slice(3));
		if (refAndPath === null) {
			return null;
		}
		return { kind: "tree", owner, repo, ref: refAndPath.ref, path: refAndPath.path };
	}

	if (route === "issues") {
		const number = parsePositiveInteger(segments[3]);
		return number === null ? null : { kind: "issue", owner, repo, number };
	}

	if (route === "pull") {
		const number = parsePositiveInteger(segments[3]);
		return number === null ? null : { kind: "pull", owner, repo, number };
	}

	return null;
}

function parseRawGitHubUrl(url: URL): GitHubTarget | null {
	const segments = pathSegments(url);
	const owner = segments[0];
	const repo = segments[1];
	const ref = segments[2];
	const path = segments.slice(3).join("/");
	if (owner === undefined || repo === undefined || ref === undefined || path.length === 0) {
		return null;
	}

	return { kind: "blob", owner, repo, ref, path };
}

function parseRefAndPath(segments: readonly string[]): { ref: string; path: string } | null {
	const ref = segments[0];
	if (ref === undefined || ref.length === 0) {
		return null;
	}

	return { ref, path: segments.slice(1).join("/") };
}

function parsePositiveInteger(value: string | undefined): number | null {
	if (value === undefined || !/^\d+$/.test(value)) {
		return null;
	}

	const parsed = Number.parseInt(value, 10);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function pathSegments(url: URL): string[] {
	return url.pathname
		.split("/")
		.filter((segment) => segment.length > 0)
		.map(decodePathSegment);
}

function decodePathSegment(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

export type GitHubExtractionOptions = {
	command?: string;
	timeoutMs?: number;
	signal?: AbortSignal;
};

export type GitHubExtractedMarkdown = {
	target: GitHubTarget;
	markdown: string;
};

export async function extractGitHubUrlMarkdown(
	url: string,
	options: GitHubExtractionOptions = {},
): Promise<GitHubExtractedMarkdown> {
	const target = parseGitHubUrl(url);
	if (target === null) {
		throw new Error(`URL is not a recognized GitHub URL: ${url}`);
	}

	return extractGitHubMarkdown(target, options);
}

export async function extractGitHubMarkdown(
	target: GitHubTarget,
	options: GitHubExtractionOptions = {},
): Promise<GitHubExtractedMarkdown> {
	switch (target.kind) {
		case "repo":
			return { target, markdown: await extractRepoMarkdown(target, options) };
		case "blob":
			return { target, markdown: await extractBlobMarkdown(target, options) };
		case "tree":
			return { target, markdown: await extractTreeMarkdown(target, options) };
		case "issue":
			return { target, markdown: await extractIssueMarkdown(target, options) };
		case "pull":
			return { target, markdown: await extractPullMarkdown(target, options) };
	}
}

async function extractRepoMarkdown(
	target: Extract<GitHubTarget, { kind: "repo" }>,
	options: GitHubExtractionOptions,
): Promise<string> {
	const repoEndpoint = `repos/${apiPathSegment(target.owner)}/${apiPathSegment(target.repo)}`;
	const metadata = asRecord(await ghApiJson(repoEndpoint, options), "repository metadata");

	let readmeMarkdown: string | undefined;
	let readmeWarning: string | undefined;
	try {
		const readme = asRecord(await ghApiJson(`${repoEndpoint}/readme`, options), "repository README");
		readmeMarkdown = decodeBase64Content(readme);
	} catch (error) {
		if (isLikelyAuthOrRateLimitError(error)) {
			throw error;
		}
		readmeWarning = `README unavailable: ${errorMessage(error)}`;
	}

	const lines = [`# ${getString(metadata, "full_name") ?? `${target.owner}/${target.repo}`}`, ""];
	appendIfPresent(lines, "Description", getString(metadata, "description"));
	appendIfPresent(lines, "Repository", getString(metadata, "html_url"));
	appendIfPresent(lines, "Homepage", getString(metadata, "homepage"));
	appendIfPresent(lines, "Default branch", getString(metadata, "default_branch"));
	appendIfPresent(lines, "License", getNestedString(metadata, "license", "spdx_id") ?? getNestedString(metadata, "license", "name"));
	appendIfPresent(lines, "Stars", formatNumber(getNumber(metadata, "stargazers_count")));
	appendIfPresent(lines, "Forks", formatNumber(getNumber(metadata, "forks_count")));
	appendIfPresent(lines, "Open issues", formatNumber(getNumber(metadata, "open_issues_count")));
	appendIfPresent(lines, "Pushed at", getString(metadata, "pushed_at"));

	if (readmeWarning !== undefined) {
		lines.push("", `> ${readmeWarning}`);
	}

	if (readmeMarkdown !== undefined) {
		lines.push("", "## README", "", readmeMarkdown);
	}

	return lines.join("\n");
}

async function extractBlobMarkdown(
	target: Extract<GitHubTarget, { kind: "blob" }>,
	options: GitHubExtractionOptions,
): Promise<string> {
	const payload = asRecord(await ghApiJson(contentsEndpoint(target), options), "repository file content");
	const content = decodeBase64Content(payload);
	const htmlUrl = getString(payload, "html_url");

	const lines = [`# ${target.owner}/${target.repo}/${target.path}`, "", `Ref: ${target.ref}`];
	appendIfPresent(lines, "Source", htmlUrl);
	lines.push("", "---", "");

	if (isLikelyMarkdownPath(target.path)) {
		lines.push(content);
	} else {
		const fence = codeFenceFor(content);
		const language = languageForPath(target.path);
		lines.push(`${fence}${language}`, content, fence);
	}

	return lines.join("\n");
}

async function extractTreeMarkdown(
	target: Extract<GitHubTarget, { kind: "tree" }>,
	options: GitHubExtractionOptions,
): Promise<string> {
	const payload = await ghApiJson(contentsEndpoint(target), options);
	const entries = Array.isArray(payload) ? asRecordArray(payload, "repository directory listing") : [asRecord(payload, "repository content")];
	const titlePath = target.path.length > 0 ? target.path : ".";
	const lines = [`# ${target.owner}/${target.repo}/${titlePath}`, "", `Ref: ${target.ref}`, "", "## Directory listing", ""];

	if (entries.length === 0) {
		lines.push("_No entries returned._");
		return lines.join("\n");
	}

	for (const entry of entries) {
		const name = getString(entry, "name") ?? getString(entry, "path") ?? "(unknown)";
		const type = getString(entry, "type") ?? "unknown";
		const url = getString(entry, "html_url");
		lines.push(`- ${url === undefined ? name : `[${name}](${url})`} — ${type}`);
	}

	return lines.join("\n");
}

async function extractIssueMarkdown(
	target: Extract<GitHubTarget, { kind: "issue" }>,
	options: GitHubExtractionOptions,
): Promise<string> {
	const issueEndpoint = `repos/${apiPathSegment(target.owner)}/${apiPathSegment(target.repo)}/issues/${target.number}`;
	const issue = asRecord(await ghApiJson(issueEndpoint, options), "GitHub issue");
	const comments = asRecordArray(await ghApiJson(`${issueEndpoint}/comments?per_page=50`, options), "GitHub issue comments");

	const title = getString(issue, "title") ?? `(untitled issue #${target.number})`;
	const lines = [`# Issue #${target.number}: ${title}`, "", `Repository: ${target.owner}/${target.repo}`];
	appendIfPresent(lines, "State", getString(issue, "state"));
	appendIfPresent(lines, "Author", getNestedString(issue, "user", "login"));
	appendIfPresent(lines, "URL", getString(issue, "html_url"));
	appendIfPresent(lines, "Labels", labels(issue).join(", ") || undefined);
	lines.push("", "## Body", "", bodyText(issue));

	lines.push("", `## Comments (${comments.length})`);
	if (comments.length === 0) {
		lines.push("", "_No comments returned._");
	} else {
		comments.forEach((comment, index) => {
			lines.push("", `### Comment ${index + 1} by ${getNestedString(comment, "user", "login") ?? "unknown"}`, "", bodyText(comment));
		});
	}

	return lines.join("\n");
}

async function extractPullMarkdown(
	target: Extract<GitHubTarget, { kind: "pull" }>,
	options: GitHubExtractionOptions,
): Promise<string> {
	const pullEndpoint = `repos/${apiPathSegment(target.owner)}/${apiPathSegment(target.repo)}/pulls/${target.number}`;
	const pull = asRecord(await ghApiJson(pullEndpoint, options), "GitHub pull request");
	const files = asRecordArray(await ghApiJson(`${pullEndpoint}/files?per_page=50`, options), "GitHub pull request files");

	const title = getString(pull, "title") ?? `(untitled pull request #${target.number})`;
	const lines = [`# Pull Request #${target.number}: ${title}`, "", `Repository: ${target.owner}/${target.repo}`];
	appendIfPresent(lines, "State", getString(pull, "state"));
	appendIfPresent(lines, "Author", getNestedString(pull, "user", "login"));
	appendIfPresent(lines, "URL", getString(pull, "html_url"));
	appendIfPresent(lines, "Source", branchLabel(pull, "head"));
	appendIfPresent(lines, "Base", branchLabel(pull, "base"));
	lines.push("", "## Body", "", bodyText(pull), "", `## Changed files (${files.length})`);

	if (files.length === 0) {
		lines.push("", "_No changed files returned._");
	} else {
		lines.push("");
		for (const file of files) {
			const filename = getString(file, "filename") ?? "(unknown)";
			const status = getString(file, "status") ?? "unknown";
			const additions = getNumber(file, "additions") ?? 0;
			const deletions = getNumber(file, "deletions") ?? 0;
			const changes = getNumber(file, "changes") ?? additions + deletions;
			lines.push(`- ${filename} — ${status}, +${additions}/-${deletions} (${changes} changes)`);
		}
	}

	return lines.join("\n");
}

async function ghApiJson(endpoint: string, options: GitHubExtractionOptions): Promise<unknown> {
	const command = options.command ?? "gh";
	let stdout: string;
	try {
		const result = await runCommand({
			command,
			args: ["api", endpoint],
			timeoutMs: options.timeoutMs,
			signal: options.signal,
		});
		stdout = result.stdout;
	} catch (error) {
		throw formatGhError(command, endpoint, error);
	}

	try {
		return JSON.parse(stdout) as unknown;
	} catch (error) {
		throw new Error(`gh api ${endpoint} returned invalid JSON: ${errorMessage(error)}`);
	}
}

function formatGhError(command: string, endpoint: string, error: unknown): Error {
	const message = errorMessage(error);
	if (isLikelyAuthOrRateLimitMessage(message)) {
		return new Error(
			`gh api ${endpoint} failed because GitHub authentication or rate limiting appears to be blocking the request. Run \`gh auth login\` or resolve the rate limit, then retry.\n${message}`,
		);
	}

	return new Error(
		`gh api ${endpoint} failed while running ${command}. GitHub URLs are handled only through gh; no generic HTML fallback will be used.\n${message}`,
	);
}

function isLikelyAuthOrRateLimitError(error: unknown): boolean {
	return isLikelyAuthOrRateLimitMessage(errorMessage(error));
}

function isLikelyAuthOrRateLimitMessage(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes("gh auth login") ||
		lower.includes("authentication") ||
		lower.includes("not logged") ||
		lower.includes("bad credentials") ||
		lower.includes("requires authentication") ||
		lower.includes("rate limit") ||
		lower.includes("api rate limit") ||
		lower.includes("http 401") ||
		lower.includes("http 403") ||
		lower.includes("status code 401") ||
		lower.includes("status code 403")
	);
}

function contentsEndpoint(target: Extract<GitHubTarget, { kind: "blob" | "tree" }>): string {
	const path = target.path.length > 0 ? `/${apiPath(target.path)}` : "";
	return `repos/${apiPathSegment(target.owner)}/${apiPathSegment(target.repo)}/contents${path}?ref=${encodeURIComponent(target.ref)}`;
}

function apiPath(path: string): string {
	return path.split("/").map(apiPathSegment).join("/");
}

function apiPathSegment(value: string): string {
	return encodeURIComponent(value);
}

function decodeBase64Content(payload: JsonRecord): string {
	const content = getString(payload, "content");
	if (content === undefined) {
		throw new Error("GitHub content response did not include base64 content");
	}

	const encoding = getString(payload, "encoding");
	if (encoding !== undefined && encoding !== "base64") {
		throw new Error(`GitHub content response used unsupported encoding: ${encoding}`);
	}

	return Buffer.from(content.replace(/\s/g, ""), "base64").toString("utf8");
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown, description: string): JsonRecord {
	if (isRecord(value)) {
		return value;
	}

	throw new Error(`Invalid ${description}: expected a JSON object`);
}

function asRecordArray(value: unknown, description: string): JsonRecord[] {
	if (!Array.isArray(value)) {
		throw new Error(`Invalid ${description}: expected a JSON array`);
	}

	return value.map((entry, index) => {
		if (!isRecord(entry)) {
			throw new Error(`Invalid ${description}: entry ${index + 1} was not a JSON object`);
		}
		return entry;
	});
}

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(record: JsonRecord, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getNumber(record: JsonRecord, key: string): number | undefined {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getNestedString(record: JsonRecord, key: string, nestedKey: string): string | undefined {
	const nested = record[key];
	return isRecord(nested) ? getString(nested, nestedKey) : undefined;
}

function appendIfPresent(lines: string[], label: string, value: string | undefined): void {
	if (value !== undefined && value.length > 0) {
		lines.push(`${label}: ${value}`);
	}
}

function formatNumber(value: number | undefined): string | undefined {
	return value === undefined ? undefined : String(value);
}

function labels(issue: JsonRecord): string[] {
	const rawLabels = issue.labels;
	if (!Array.isArray(rawLabels)) {
		return [];
	}

	return rawLabels.flatMap((label) => {
		if (typeof label === "string" && label.trim().length > 0) {
			return [label.trim()];
		}
		if (isRecord(label)) {
			const name = getString(label, "name");
			return name === undefined ? [] : [name];
		}
		return [];
	});
}

function bodyText(record: JsonRecord): string {
	return getString(record, "body") ?? "_No body._";
}

function branchLabel(pull: JsonRecord, key: "base" | "head"): string | undefined {
	const branch = pull[key];
	if (!isRecord(branch)) {
		return undefined;
	}

	return getString(branch, "label") ?? getString(branch, "ref");
}

function isLikelyMarkdownPath(path: string): boolean {
	return /(?:^|\.)(?:md|markdown|mdx)$/i.test(path);
}

function languageForPath(path: string): string {
	const extension = path.split(".").pop()?.toLowerCase();
	if (extension === undefined || extension === path.toLowerCase()) {
		return "";
	}

	const languages: Record<string, string> = {
		js: "javascript",
		jsx: "jsx",
		ts: "typescript",
		tsx: "tsx",
		json: "json",
		py: "python",
		rb: "ruby",
		rs: "rust",
		go: "go",
		java: "java",
		kt: "kotlin",
		sh: "bash",
		yml: "yaml",
		yaml: "yaml",
		toml: "toml",
	};

	const language = languages[extension];
	return language === undefined ? "" : language;
}

function codeFenceFor(content: string): string {
	let fence = "```";
	while (content.includes(fence)) {
		fence += "`";
	}
	return fence;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
