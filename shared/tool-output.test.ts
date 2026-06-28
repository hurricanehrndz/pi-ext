import { describe, expect, test } from "bun:test";

import { truncateForToolOutput } from "./tool-output.js";

describe("truncateForToolOutput", () => {
	test("uses pi head truncation limits for tool-visible output", () => {
		const truncation = truncateForToolOutput("line 1\nline 2\nline 3", { maxLines: 2, maxBytes: 1000 });

		expect(truncation.content).toBe("line 1\nline 2");
		expect(truncation.result.truncated).toBe(true);
		expect(truncation.summary).toContain("Output truncated by lines");
	});
});
