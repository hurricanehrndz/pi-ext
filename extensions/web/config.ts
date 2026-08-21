export const DEFAULT_SEARCH_BASE_URL = "https://search.hrndz.ca";

export type WebConfig = {
	searchBaseUrl: string;
};

export function getWebConfig(env: Record<string, string | undefined> = process.env): WebConfig {
	return {
		searchBaseUrl: env.PI_WEB_SEARCH_BASE_URL || DEFAULT_SEARCH_BASE_URL,
	};
}
