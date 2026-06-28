import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { commandExists, runCommand } from "./command.js";

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
});

describe("commandExists", () => {
	test("finds a bare command in a PATH directory", async () => {
		const dir = await mkdtemp(join(tmpdir(), "cmd-exists-"));
		const bin = join(dir, "fake-tool");
		await writeFile(bin, "#!/bin/sh\n");
		await chmod(bin, 0o755);

		expect(await commandExists("fake-tool", { PATH: dir })).toBe(true);
		expect(await commandExists("missing-tool", { PATH: dir })).toBe(false);
	});

	test("resolves a path-qualified executable directly, ignoring PATH", async () => {
		const dir = await mkdtemp(join(tmpdir(), "cmd-exists-"));
		const bin = join(dir, "fake-tool");
		await writeFile(bin, "#!/bin/sh\n");
		await chmod(bin, 0o755);

		expect(await commandExists(bin, { PATH: "" })).toBe(true);
		expect(await commandExists(join(dir, "nope"), { PATH: "" })).toBe(false);
	});

	test("returns false for empty command or empty PATH", async () => {
		expect(await commandExists("", { PATH: "/usr/bin" })).toBe(false);
		expect(await commandExists("  ", { PATH: "/usr/bin" })).toBe(false);
		expect(await commandExists("fake-tool", { PATH: "" })).toBe(false);
	});
});
