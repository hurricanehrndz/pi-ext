import { describe, expect, test } from "bun:test";

import { runCommand } from "./command.js";

describe("runCommand", () => {
	test("captures stdout without using a shell string", async () => {
		const result = await runCommand({ command: "printf", args: ["hello"] });

		expect(result).toEqual({ stdout: "hello", stderr: "", exitCode: 0 });
	});

	test("writes stdin when provided", async () => {
		const result = await runCommand({ command: "cat", args: [], stdin: "hello from stdin" });

		expect(result.stdout).toBe("hello from stdin");
		expect(result.exitCode).toBe(0);
	});

	test("throws on non-zero exit", async () => {
		await expect(runCommand({ command: "false", args: [] })).rejects.toThrow("exit code 1");
	});

	test("rejects before spawning when already aborted", async () => {
		const controller = new AbortController();
		controller.abort();

		await expect(runCommand({ command: "printf", args: ["never"], signal: controller.signal })).rejects.toThrow(
			"aborted before start",
		);
	});

	test("terminates a command that exceeds its timeout", async () => {
		await expect(runCommand({ command: "sleep", args: ["1"], timeoutMs: 10 })).rejects.toThrow("timed out after 10ms");
	});
});
