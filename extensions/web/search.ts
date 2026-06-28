export type SearchTimeRange = "day" | "week" | "month" | "year";

export type WebSearchResult = {
	title: string;
	url: string;
	content?: string;
	engines: string[];
	category?: string;
	score?: number;
	publishedDate?: string;
};

export type SearxngSearchParams = {
	query: string;
	limit?: number;
	page?: number;
	categories?: readonly string[];
	engines?: readonly string[];
	language?: string;
	timeRange?: SearchTimeRange;
};

export type SearchSearxngOptions = SearxngSearchParams & {
	baseUrl: string;
	signal?: AbortSignal;
};

export function buildSearxngSearchUrl(baseUrl: string, params: SearxngSearchParams): URL {
	const base = new URL(baseUrl);
	const baseHref = base.href.endsWith("/") ? base.href : `${base.href}/`;
	const url = new URL("search", baseHref);

	url.searchParams.set("q", params.query);
	url.searchParams.set("format", "json");

	if (params.page !== undefined) {
		url.searchParams.set("pageno", String(params.page));
	}
	if (params.categories !== undefined && params.categories.length > 0) {
		url.searchParams.set("categories", params.categories.join(","));
	}
	if (params.engines !== undefined && params.engines.length > 0) {
		url.searchParams.set("engines", params.engines.join(","));
	}
	if (params.language !== undefined && params.language.trim().length > 0) {
		url.searchParams.set("language", params.language.trim());
	}
	if (params.timeRange !== undefined) {
		url.searchParams.set("time_range", params.timeRange);
	}

	return url;
}

export async function searchSearxng(options: SearchSearxngOptions): Promise<WebSearchResult[]> {
	const url = buildSearxngSearchUrl(options.baseUrl, options);
	const response = await fetch(url, {
		headers: { Accept: "application/json" },
		signal: options.signal,
	});
	const body = await response.text();

	if (!response.ok) {
		throw new Error(`SearXNG search failed with HTTP ${response.status}: ${snippet(body)}`);
	}

	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown JSON parse error";
		throw new Error(`SearXNG search returned invalid JSON: ${message}`);
	}

	return normalizeSearxngResponse(payload, options.limit);
}

export function normalizeSearxngResponse(payload: unknown, limit = 8): WebSearchResult[] {
	if (!isRecord(payload)) {
		throw new Error("Invalid SearXNG response: expected a JSON object");
	}

	const rawResults = payload.results;
	if (!Array.isArray(rawResults)) {
		throw new Error("Invalid SearXNG response: missing results array");
	}

	const normalizedLimit = Math.max(0, Math.floor(limit));
	const results: WebSearchResult[] = [];
	for (const rawResult of rawResults) {
		const result = normalizeResult(rawResult);
		if (result !== null) {
			results.push(result);
		}
		if (results.length >= normalizedLimit) {
			break;
		}
	}

	return results;
}

function normalizeResult(rawResult: unknown): WebSearchResult | null {
	if (!isRecord(rawResult)) {
		return null;
	}

	const title = optionalTrimmedString(rawResult.title);
	const url = optionalTrimmedString(rawResult.url);
	if (title === undefined || url === undefined) {
		return null;
	}

	const result: WebSearchResult = {
		title,
		url,
		engines: normalizeStringArray(rawResult.engines),
	};

	const content = optionalTrimmedString(rawResult.content);
	if (content !== undefined) {
		result.content = content;
	}

	const category = optionalTrimmedString(rawResult.category);
	if (category !== undefined) {
		result.category = category;
	}

	const score = normalizeNumber(rawResult.score);
	if (score !== undefined) {
		result.score = score;
	}

	const publishedDate = optionalTrimmedString(rawResult.publishedDate) ?? optionalTrimmedString(rawResult.published_date);
	if (publishedDate !== undefined) {
		result.publishedDate = publishedDate;
	}

	return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalTrimmedString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
	}

	if (typeof value === "string") {
		return value
			.split(",")
			.map((item) => item.trim())
			.filter((item) => item.length > 0);
	}

	return [];
}

function normalizeNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function snippet(value: string): string {
	const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
	if (normalized.length <= 500) {
		return normalized;
	}

	return `${normalized.slice(0, 500)}… [truncated]`;
}
