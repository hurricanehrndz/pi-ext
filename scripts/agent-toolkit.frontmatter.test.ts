import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { parseFlatYamlFrontmatter, run } from "./agent-toolkit.mjs";

let sandbox: string;
let repoRoot: string;
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;

async function validate(document: string): Promise<{ code: number; stderr: string }> {
	await writeFile(join(repoRoot, "skills/valid/SKILL.md"), document);
	let stderr = "";
	process.stdout.write = (() => true) as typeof process.stdout.write;
	process.stderr.write = ((chunk: string | Uint8Array) => {
		stderr += chunk.toString();
		return true;
	}) as typeof process.stderr.write;
	try {
		return { code: await run(["validate"], repoRoot), stderr };
	} finally {
		process.stdout.write = originalStdoutWrite;
		process.stderr.write = originalStderrWrite;
	}
}

beforeEach(async () => {
	sandbox = await mkdtemp(join(tmpdir(), "agent-toolkit-frontmatter-"));
	repoRoot = join(sandbox, "repo");
	await mkdir(join(repoRoot, "skills/valid"), { recursive: true });
});

afterEach(async () => {
	process.stdout.write = originalStdoutWrite;
	process.stderr.write = originalStderrWrite;
	await rm(sandbox, { recursive: true, force: true });
});

describe("flat frontmatter parser", () => {
	const accepted = [
		"name: valid\ndescription: Plain metadata.\n",
		'name: "valid"\ndescription: "A quoted colon: stays text."\n',
		"name: 'valid'\ndescription: 'It''s a YAML single-quoted string.'\n",
		"name: valid\ndescription: Plain C# and https://example.com/#fragment\ndisable-model-invocation: true\nuser-invocable: false\n",
		"name: valid\ndescription: Plain metadata.\nmetadata-version: 2\noptional: null\n",
		'name: valid\ndescription: "A # marker in quotes is text."\n',
	];

	for (const [index, frontmatter] of accepted.entries()) {
		test(`accepts supported scalar case ${index + 1}`, async () => {
			const result = await validate(`---\n${frontmatter}---\n`);
			expect(result).toEqual({ code: 0, stderr: "" });
		});
	}

	const yamlNumberCompatibility: Array<[string, "number" | "string"]> = [
		[".nan", "number"],
		[".NaN", "number"],
		[".NAN", "number"],
		[".inf", "number"],
		["+.INF", "number"],
		["-.Inf", "number"],
		["0x10", "number"],
		["+0x10", "number"],
		["-0x10", "number"],
		["0o7", "number"],
		["+0o7", "number"],
		["-0o7", "number"],
		[".5", "number"],
		["+.5", "string"],
		["-.5", "string"],
		["+.nan", "string"],
		["-.nan", "string"],
		["0X10", "string"],
		["0b10", "string"],
	];

	for (const [scalar, yamlType] of yamlNumberCompatibility) {
		test(`matches Bun YAML typing for ${scalar}`, async () => {
			const parsed = Bun.YAML.parse(`description: ${scalar}\n`) as { description: unknown };
			const toolkitValue = parseFlatYamlFrontmatter(`description: ${scalar}\n`).description;
			expect(typeof toolkitValue).toBe(yamlType);
			if (typeof parsed.description === "number" && Number.isNaN(parsed.description)) {
				expect(Number.isNaN(toolkitValue)).toBeTrue();
			} else {
				expect(toolkitValue).toBe(parsed.description as string | number);
			}
			const result = await validate(`---\nname: valid\ndescription: ${scalar}\n---\n`);
			expect(result.code).toBe(yamlType === "string" ? 0 : 1);
		});
	}

	const rejected: Array<[string, string, string]> = [
		["duplicate keys", "name: valid\nname: valid\ndescription: duplicate\n", "duplicate top-level key"],
		["implicit boolean keys", "name: valid\ndescription: metadata\ntrue: value\n", "must resolve to a string"],
		["indentation", " name: valid\ndescription: indented\n", "must not be indented"],
		["nested mappings", "name: valid\ndescription: nested\nmetadata:\n  child: value\n", "must not be indented"],
		["flow mappings", "name: valid\ndescription: flow\nmetadata: {child: value}\n", "unsupported YAML scalar form"],
		["flow sequences", "name: valid\ndescription: flow\nmetadata: [one, two]\n", "unsupported YAML scalar form"],
		["sequence indicators", "name: valid\ndescription: - item\n", "unsupported YAML scalar form"],
		["literal blocks", "name: valid\ndescription: |\n  multiline\n", "unsupported YAML scalar form"],
		["folded blocks", "name: valid\ndescription: >\n  multiline\n", "unsupported YAML scalar form"],
		["tags", "name: valid\ndescription: !text tagged\n", "unsupported YAML scalar form"],
		["anchors", "name: valid\ndescription: &description anchored\n", "unsupported YAML scalar form"],
		["aliases", "name: valid\ndescription: *description\n", "unsupported YAML scalar form"],
		["malformed double quotes", 'name: valid\ndescription: "bad\\xescape"\n', "invalid double-quoted scalar"],
		["malformed single quotes", "name: valid\ndescription: 'isn't escaped'\n", "invalid single-quoted scalar"],
		["whole-line comments", "name: valid\n# comment\ndescription: commented\n", "comments are not supported"],
		["inline comments", "name: valid\ndescription: value # comment\n", "comments are not supported"],
		["ambiguous colons", "name: valid\ndescription: unquoted: value\n", "ambiguous unquoted colon"],
		["trailing colons", "name: valid\ndescription: unquoted:\n", "ambiguous unquoted colon"],
		["quoted keys", '"name": valid\ndescription: quoted key\n', "plain-key mapping entry"],
		["numeric names", "name: 123\ndescription: number name\n", "frontmatter name must match"],
		["leading-zero numeric descriptions", "name: valid\ndescription: 01\n", "description is required"],
		["boolean descriptions", "name: valid\ndescription: false\n", "description is required"],
		["empty descriptions", "name: valid\ndescription:\n", "description is required"],
	];

	for (const [label, frontmatter, message] of rejected) {
		test(`rejects ${label}`, async () => {
			const result = await validate(`---\n${frontmatter}---\n`);
			expect(result.code).toBe(1);
			expect(result.stderr).toContain(message);
		});
	}
});

test("every checked-in skill satisfies the frontmatter contract", async () => {
	let stderr = "";
	process.stdout.write = (() => true) as typeof process.stdout.write;
	process.stderr.write = ((chunk: string | Uint8Array) => {
		stderr += chunk.toString();
		return true;
	}) as typeof process.stderr.write;
	try {
		expect(await run(["validate"], resolve(import.meta.dir, ".."))).toBe(0);
		expect(stderr).toBe("");
	} finally {
		process.stdout.write = originalStdoutWrite;
		process.stderr.write = originalStderrWrite;
	}
});
