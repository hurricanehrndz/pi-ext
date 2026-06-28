import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import { expandHome } from "./path.js";

describe("expandHome", () => {
	test("expands a bare tilde", () => {
		expect(expandHome("~")).toBe(homedir());
	});

	test("expands a path under the home directory", () => {
		expect(expandHome("~/.cache/pi-ext")).toBe(join(homedir(), ".cache/pi-ext"));
	});

	test("leaves non-home paths unchanged", () => {
		expect(expandHome("/tmp/pi-ext")).toBe("/tmp/pi-ext");
	});
});
