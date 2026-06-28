import { expandHome } from "../../shared/path.js";

export const DEFAULT_SEARCH_BASE_URL = "https://search.hrndz.ca";
export const DEFAULT_BROWSER_SESSION = "pi-web";
export const DEFAULT_BROWSER_PROFILE = "~/.cache/pi-ext/web-research/browser-profile";
export const DEFAULT_BROWSER_COMMAND = "agent-browser";

export type WebConfig = {
	searchBaseUrl: string;
	browserSession: string;
	browserProfile: string;
	browserCommand: string;
};

export function getWebConfig(env: Record<string, string | undefined> = process.env): WebConfig {
	return {
		searchBaseUrl: env.PI_WEB_SEARCH_BASE_URL || DEFAULT_SEARCH_BASE_URL,
		browserSession: env.PI_WEB_BROWSER_SESSION || DEFAULT_BROWSER_SESSION,
		browserProfile: expandHome(env.PI_WEB_BROWSER_PROFILE || DEFAULT_BROWSER_PROFILE),
		browserCommand: env.PI_WEB_BROWSER_COMMAND || DEFAULT_BROWSER_COMMAND,
	};
}
