export type BrowserProfileConfig = {
	browserCommand: string;
	browserSession: string;
	browserProfile: string;
};

export function buildPersistentBrowserOpenArgs(config: BrowserProfileConfig, url: string): string[] {
	return ["--session", config.browserSession, "--profile", config.browserProfile, "open", url];
}

export function formatPersistentBrowserLoginCommand(config: BrowserProfileConfig, url: string): string {
	return `${config.browserCommand} --session ${config.browserSession} --profile ${config.browserProfile} --headed open ${url}`;
}
