const SMALL_TEXT_THRESHOLD = 500;
const HIGH_SCRIPT_COUNT = 8;

const STRONG_SPA_MARKERS = [
	/\bid=["'](?:root|app|__next|svelte)["']/i,
	/__NEXT_DATA__/i,
	/data-reactroot/i,
	/ng-version[=\s]/i,
	/<script\b[^>]*\btype=["']module["']/i,
	/\/[@]?vite\/client/i,
	/\benable JavaScript\b/i,
	/please enable javascript/i,
	/requires javascript/i,
];

export function looksLikeJsAppShell(html: string, markdown: string): boolean {
	const markdownText = collapseWhitespace(markdown);
	const bodyText = collapseWhitespace(extractVisibleBodyText(html));
	const hasSmallExtractedText = markdownText.length < SMALL_TEXT_THRESHOLD && bodyText.length < SMALL_TEXT_THRESHOLD;

	if (!hasSmallExtractedText) {
		return false;
	}

	if (STRONG_SPA_MARKERS.some((pattern) => pattern.test(html))) {
		return true;
	}

	return countScriptTags(html) >= HIGH_SCRIPT_COUNT && bodyText.length < SMALL_TEXT_THRESHOLD / 2;
}

function extractVisibleBodyText(html: string): string {
	const body = extractBody(html);
	return decodeBasicHtmlEntities(
		body
			.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
			.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
			.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
			.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
			.replace(/<[^>]+>/g, " "),
	);
}

function extractBody(html: string): string {
	const match = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
	return match?.[1] ?? html;
}

function countScriptTags(html: string): number {
	return html.match(/<script\b/gi)?.length ?? 0;
}

function collapseWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function decodeBasicHtmlEntities(value: string): string {
	return value
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/g, "'");
}
