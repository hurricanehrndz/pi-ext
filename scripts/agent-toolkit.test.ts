import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, lstatSync, readlinkSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

import { run } from "./agent-toolkit";

let sandbox: string;
let repoRoot: string;
let home: string;
let configured: Record<string, string[]>;

const roots = {
	pi: ".pi/agent/skills",
	prime: ".prime/agent/skills",
	codex: ".codex/skills",
	claude: ".claude/skills",
} as const;

async function writeConfig(value: unknown = { skills: configured }): Promise<void> {
	await writeFile(join(repoRoot, "agent-toolkit.json"), `${JSON.stringify(value, null, 2)}
`);
}

async function addSkill(name: string, agents = ["pi", "prime", "codex", "claude"]): Promise<string> {
	const path = join(repoRoot, "skills", name);
	await mkdir(path, { recursive: true });
	await writeFile(join(path, "SKILL.md"), `---
name: ${name}
description: Use ${name} while testing.
---

# ${name}
`);
	configured[name] = agents;
	await writeConfig();
	return path;
}

async function capture(callback: () => Promise<number>): Promise<{ code: number; stdout: string; stderr: string }> {
	let stdout = "";
	let stderr = "";
	const out = spyOn(process.stdout, "write").mockImplementation((chunk) => {
		stdout += String(chunk);
		return true;
	});
	const err = spyOn(process.stderr, "write").mockImplementation((chunk) => {
		stderr += String(chunk);
		return true;
	});
	try {
		return { code: await callback(), stdout, stderr };
	} finally {
		out.mockRestore();
		err.mockRestore();
	}
}

beforeEach(async () => {
	sandbox = await mkdtemp(join(tmpdir(), "agent-toolkit-installer-"));
	repoRoot = join(sandbox, "repo");
	home = join(sandbox, "home");
	configured = {};
	await mkdir(join(repoRoot, "skills"), { recursive: true });
	await mkdir(home, { recursive: true });
	await writeConfig();
});

afterEach(async () => {
	await rm(sandbox, { recursive: true, force: true });
});

describe("agent-toolkit installer", () => {
	test("installs each skill only into agents in its explicit scope", async () => {
		const portable = await addSkill("portable");
		const piOnly = await addSkill("pi-only", ["pi"]);

		expect(await run(["install", "--home", home], repoRoot)).toBe(0);
		for (const [agent, relativeRoot] of Object.entries(roots)) {
			const portableLink = join(home, relativeRoot, "portable");
			expect(resolve(join(portableLink, ".."), readlinkSync(portableLink))).toBe(portable);
			const piLink = join(home, relativeRoot, "pi-only");
			if (agent === "pi") {
				expect(resolve(join(piLink, ".."), readlinkSync(piLink))).toBe(piOnly);
			} else {
				expect(existsSync(piLink)).toBeFalse();
			}
		}
	});

	test("--agent all and repeated selected agents use the four exact roots", async () => {
		await addSkill("example");
		const cases = [
			{ args: ["--agent", "all"], installationHome: join(sandbox, "all-home") },
			{ args: ["--agent", "pi,prime", "--agent", "codex,claude"], installationHome: join(sandbox, "selected-home") },
		];
		for (const { args, installationHome } of cases) {
			expect(await run(["install", ...args, "--home", installationHome], repoRoot)).toBe(0);
			for (const relativeRoot of Object.values(roots)) {
				expect(lstatSync(join(installationHome, relativeRoot, "example")).isSymbolicLink()).toBeTrue();
			}
		}
	});

	test("rejects all combined with a named agent across repeated flags", async () => {
		await addSkill("example");
		for (const args of [
			["--agent", "all", "--agent", "pi"],
			["--agent", "pi", "--agent", "all"],
		]) {
			const result = await capture(() => run(["install", ...args, "--home", home], repoRoot));
			expect(result.code).toBe(2);
			expect(result.stderr).toContain('"all" cannot be combined with named agents.');
		}
	});

	test("dry-run reports scoped changes without creating roots", async () => {
		await addSkill("pi-only", ["pi"]);
		const result = await capture(() => run(["sync", "--dry-run", "--home", home], repoRoot));
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("Dry run: 1 change(s) would be made.");
		for (const relativeRoot of Object.values(roots)) {
			expect(existsSync(join(home, relativeRoot))).toBeFalse();
		}
	});

	test("sync removes a checkout-owned link after its agent scope changes", async () => {
		const skill = await addSkill("scoped", ["pi", "prime"]);
		expect(await run(["install", "--home", home], repoRoot)).toBe(0);
		configured.scoped = ["pi"];
		await writeConfig();
		expect(await run(["sync", "--agent", "prime", "--home", home], repoRoot)).toBe(0);
		expect(existsSync(join(home, roots.prime, "scoped"))).toBeFalse();
		expect(resolve(join(home, roots.pi, "scoped/.."), readlinkSync(join(home, roots.pi, "scoped")))).toBe(skill);
	});

	test("existing files, directories, and external links are conflicts and are not replaced", async () => {
		await addSkill("example");
		const destinations = [join(home, roots.pi, "example"), join(home, roots.prime, "example"), join(home, roots.codex, "example")];
		await mkdir(join(home, roots.pi), { recursive: true });
		await writeFile(destinations[0]!, "keep");
		await mkdir(destinations[1]!, { recursive: true });
		const external = join(sandbox, "external");
		await mkdir(external);
		await mkdir(join(home, roots.codex), { recursive: true });
		await symlink(external, destinations[2]!);
		expect(await run(["sync", "--agent", "pi,prime,codex", "--home", home], repoRoot)).toBe(1);
		expect(await Bun.file(destinations[0]!).text()).toBe("keep");
		expect(lstatSync(destinations[1]!).isDirectory()).toBeTrue();
		expect(readlinkSync(destinations[2]!)).toBe(external);
	});

	test("links from a moved checkout conflict and survive sync and uninstall", async () => {
		await addSkill("example");
		const oldSkill = join(sandbox, "old-checkout/skills/example");
		const destination = join(home, roots.claude, "example");
		await mkdir(oldSkill, { recursive: true });
		await mkdir(join(home, roots.claude), { recursive: true });
		await symlink(oldSkill, destination);
		expect(await run(["sync", "--agent", "claude", "--home", home], repoRoot)).toBe(1);
		expect(await run(["uninstall", "--agent", "claude", "--home", home], repoRoot)).toBe(0);
		expect(resolve(join(destination, ".."), readlinkSync(destination))).toBe(oldSkill);
	});

	test("sync and uninstall preserve unmanaged and separately managed resources", async () => {
		await addSkill("managed");
		const root = join(home, roots.codex);
		await mkdir(join(root, "respec"), { recursive: true });
		await writeFile(join(root, "file"), "keep");
		await writeFile(join(root, "respec/SKILL.md"), "separate owner");
		const brokenExternal = join(sandbox, "missing-external");
		await symlink(brokenExternal, join(root, "external"));
		expect(await run(["sync", "--agent", "codex", "--home", home], repoRoot)).toBe(0);
		expect(await run(["uninstall", "--agent", "codex", "--home", home], repoRoot)).toBe(0);
		expect(await Bun.file(join(root, "file")).text()).toBe("keep");
		expect(await Bun.file(join(root, "respec/SKILL.md")).text()).toBe("separate owner");
		expect(readlinkSync(join(root, "external"))).toBe(brokenExternal);
		expect(existsSync(join(root, "managed"))).toBeFalse();
	});

	test("uninstall removes even deleted-skill links owned by this checkout", async () => {
		await addSkill("current");
		const root = join(home, roots.pi);
		await mkdir(root, { recursive: true });
		await symlink(join(repoRoot, "skills/removed"), join(root, "removed"));
		expect(await run(["install", "--agent", "pi", "--home", home], repoRoot)).toBe(0);
		expect(await run(["uninstall", "--agent", "pi", "--home", home], repoRoot)).toBe(0);
		expect(existsSync(join(root, "current"))).toBeFalse();
		expect(existsSync(join(root, "removed"))).toBeFalse();
	});

	test("recognizes current and broken stale relative links owned by the checkout", async () => {
		const skill = await addSkill("relative");
		const destination = join(home, roots.pi, "relative");
		const stale = join(home, roots.pi, "removed");
		await mkdir(dirname(destination), { recursive: true });
		await symlink(relative(dirname(destination), skill), destination);
		await symlink(relative(dirname(stale), join(repoRoot, "skills/removed")), stale);
		expect(await run(["sync", "--agent", "pi", "--home", home], repoRoot)).toBe(0);
		expect(readlinkSync(destination)).toBe(relative(dirname(destination), skill));
		expect(() => lstatSync(stale)).toThrow();
	});

	test("dry-run sync and uninstall report removals without removing links", async () => {
		await addSkill("scoped", ["prime"]);
		expect(await run(["install", "--agent", "prime", "--home", home], repoRoot)).toBe(0);
		const destination = join(home, roots.prime, "scoped");
		configured.scoped = ["pi"];
		await writeConfig();
		const sync = await capture(() => run(["sync", "--agent", "prime", "--dry-run", "--home", home], repoRoot));
		expect(sync.stdout).toContain("Dry run: 1 change(s) would be made.");
		expect(lstatSync(destination).isSymbolicLink()).toBeTrue();
		const uninstall = await capture(() => run(["uninstall", "--agent", "prime", "--dry-run", "--home", home], repoRoot));
		expect(uninstall.stdout).toContain("Dry run: 1 change(s) would be made.");
		expect(lstatSync(destination).isSymbolicLink()).toBeTrue();
	});

	test("status returns a conflict exit code without changing the destination", async () => {
		await addSkill("example", ["pi"]);
		const destination = join(home, roots.pi, "example");
		await mkdir(dirname(destination), { recursive: true });
		await writeFile(destination, "keep");
		const result = await capture(() => run(["status", "--agent", "pi", "--home", home], repoRoot));
		expect(result.code).toBe(1);
		expect(result.stdout).toContain("1 conflicts");
		expect(await Bun.file(destination).text()).toBe("keep");
	});

	test("status considers only skills scoped to the selected agent", async () => {
		await addSkill("pi-only", ["pi"]);
		await addSkill("portable");
		const result = await capture(() => run(["status", "--agent", "prime", "--home", home], repoRoot));
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("prime: 0 linked, 1 missing, 0 conflicts");
	});

	test("rejects frontmatter mismatch and malformed or incomplete config", async () => {
		await addSkill("valid");
		await writeFile(join(repoRoot, "skills/valid/SKILL.md"), "---\nname: wrong\ndescription: mismatch\n---\n");
		expect((await capture(() => run(["validate"], repoRoot))).stderr).toContain("frontmatter name must match");

		await writeFile(join(repoRoot, "skills/valid/SKILL.md"), "---\nname: valid\ndescription: valid skill metadata\n---\n");
		await writeFile(join(repoRoot, "agent-toolkit.json"), "{broken");
		expect((await capture(() => run(["validate"], repoRoot))).stderr).toContain("invalid JSON");
		await writeConfig({ skills: {}, extra: true });
		const incomplete = await capture(() => run(["validate"], repoRoot));
		expect(incomplete.stderr).toContain('unknown top-level key "extra"');
		expect(incomplete.stderr).toContain('discovered skill "valid" is not configured');
	});

	test("rejects whitespace descriptions and duplicate YAML frontmatter keys", async () => {
		await addSkill("valid");
		await writeFile(join(repoRoot, "skills/valid/SKILL.md"), "---\nname: valid\ndescription: '   '\n---\n");
		expect((await capture(() => run(["validate"], repoRoot))).stderr).toContain("description is required");

		for (const duplicate of ["name: other", "description: second"]) {
			await writeFile(
				join(repoRoot, "skills/valid/SKILL.md"),
				`---\nname: valid\ndescription: first\n${duplicate}\n---\n`,
			);
			const result = await capture(() => run(["validate"], repoRoot));
			expect(result.code).toBe(1);
			expect(result.stderr).toContain("duplicate top-level key");
		}
	});

	test("accepts only flat frontmatter with plain unindented keys and scalar values", async () => {
		await addSkill("valid");
		const invalidDocuments = [
			`---
name: valid
description: first
"descr\\x69ption": second
---
`,
			`---
{name: valid, name: valid, description: first}
---
`,
			`---
 name: valid
 description: first
 name: valid
---
`,
			`---
name: valid
description: first
"name": valid
---
`,
			`---
name: valid
description: first
metadata:
  nested: value
---
`,
			`---
name: valid
description: first
metadata: { nested: value }
---
`,
			`---
name: valid
description: first
true: one
True: two
---
`,
			`---
name: valid
description: first
null: one
Null: two
---
`,
			`---
name: valid
description: first
1: one
01: two
---
`,
		];
		for (const document of invalidDocuments) {
			await writeFile(join(repoRoot, "skills/valid/SKILL.md"), document);
			const result = await capture(() => run(["validate"], repoRoot));
			expect(result.code).toBe(1);
			expect(result.stderr).toContain("invalid YAML frontmatter");
		}

		await writeFile(
			join(repoRoot, "skills/valid/SKILL.md"),
			`---
name: valid
description: "Use this: safely."
---
`,
		);
		expect(await run(["validate"], repoRoot)).toBe(0);
	});

	test("rejects duplicate JSON object keys at every nesting level", async () => {
		await addSkill("valid");
		const documents = [
			'{"skills":{},"skills":{"valid":["pi"]}}',
			'{"skills":{"valid":["pi"],"valid":["prime"]}}',
			'{"skills":{"valid":["pi"]},"metadata":{"nested":{"x":1,"x":2}}}',
		];
		for (const document of documents) {
			await writeFile(join(repoRoot, "agent-toolkit.json"), document);
			const result = await capture(() => run(["validate"], repoRoot));
			expect(result.code).toBe(1);
			expect(result.stderr).toContain("duplicate object key");
		}
	});

	test("rejects missing skills, empty scopes, duplicate agents, and unknown agents", async () => {
		await addSkill("valid");
		await writeConfig({ skills: { valid: ["pi", "pi", "unknown"], empty: [], missing: ["pi"] } });
		const result = await capture(() => run(["validate"], repoRoot));
		expect(result.code).toBe(1);
		expect(result.stderr).toContain('lists agent "pi" more than once');
		expect(result.stderr).toContain("has unknown agent");
		expect(result.stderr).toContain("must have at least one agent");
		expect(result.stderr).toContain('configured skill "missing" is missing');
	});
});

describe("package ownership", () => {
	test("all checked-in skill metadata satisfies the flat frontmatter contract", async () => {
		const actualRepo = resolve(import.meta.dir, "..");
		const result = await capture(() => run(["validate"], actualRepo));
		expect(result.code).toBe(0);
		expect(result.stderr).toBe("");
	});

	test("the repository package exposes the installer and does not also deliver Pi skills", async () => {
		const manifest = await Bun.file(join(import.meta.dir, "../package.json")).json();
		expect(manifest.bin).toEqual({ "agent-toolkit": "./scripts/agent-toolkit.ts" });
		expect(manifest.pi.extensions).toEqual(["./extensions"]);
		expect(manifest.pi.skills).toBeUndefined();
	});
});
