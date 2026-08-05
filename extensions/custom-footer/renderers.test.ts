import { describe, expect, test } from "bun:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";

import { getSessionCost } from "./renderers.js";

function messageEntry(id: string, message: AssistantMessage | UserMessage): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: "2026-08-05T00:00:00.000Z",
		message,
	};
}

function assistantMessage(cost: number): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: "test",
		provider: "test",
		model: "test",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: cost },
		},
		stopReason: "stop",
		timestamp: 0,
	};
}

describe("getSessionCost", () => {
	test("adds the cost of every assistant response and ignores other messages", () => {
		const entries = [
			messageEntry("first", assistantMessage(0.012)),
			messageEntry("user", { role: "user", content: "continue", timestamp: 0 }),
			messageEntry("second", assistantMessage(0.034)),
		];

		expect(getSessionCost(entries)).toBeCloseTo(0.046);
	});
});
