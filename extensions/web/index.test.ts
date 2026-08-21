import { describe, expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import webExtension from "./index.js";

type RegisteredTool = {
	name: string;
	promptGuidelines?: readonly string[];
	parameters: {
		properties?: Record<string, unknown>;
	};
};

describe("web extension public tools", () => {
	test("registers only the simplified web_search and web_fetch surfaces", () => {
		const tools: RegisteredTool[] = [];
		const pi = {
			registerTool(tool: RegisteredTool) {
				tools.push(tool);
			},
		} as unknown as ExtensionAPI;

		webExtension(pi);

		expect(tools.map((tool) => tool.name)).toEqual(["web_search", "web_fetch"]);
		expect(Object.keys(tools[1]?.parameters.properties ?? {})).toEqual([
			"url",
			"userRequestReason",
			"includeSelector",
			"excludeSelector",
		]);
		expect(tools.every((tool) => tool.promptGuidelines?.every((line) => line.includes(tool.name)) ?? false)).toBe(true);
	});
});
