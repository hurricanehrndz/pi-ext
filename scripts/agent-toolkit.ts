#!/usr/bin/env bun

import { existsSync, lstatSync, readlinkSync, readdirSync } from "node:fs";
import { mkdir, readFile, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

type Agent = "pi" | "prime" | "codex" | "claude";
type Command = "install" | "sync" | "status" | "uninstall" | "validate";

const AGENT_SKILL_PATHS: Record<Agent, string> = {
	pi: ".pi/agent/skills",
	prime: ".prime/agent/skills",
	codex: ".codex/skills",
	claude: ".claude/skills",
};
const AGENT_CONTEXT_PATHS: Record<Agent, string> = {
	pi: ".pi/agent/APPEND_SYSTEM.md",
	prime: ".prime/agent/APPEND_SYSTEM.md",
	codex: ".codex/AGENTS.md",
	claude: ".claude/CLAUDE.md",
};
const CONTEXT_SOURCE_PATH = "context/working-style.md";
const ALL_AGENTS = Object.keys(AGENT_SKILL_PATHS) as Agent[];
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface Options {
	command: Command;
	agents: Agent[];
	home: string;
	dryRun: boolean;
}

interface Skill {
	name: string;
	path: string;
}

type SkillScopes = Map<string, Agent[]>;

interface Summary {
	changed: number;
	conflicts: number;
}

function usage(): string {
	return `Usage: agent-toolkit <command> [options]

Commands:
  validate                 Validate optional config, context, and skill frontmatter
  status                   Show managed resource state for selected agents
  install                  Link missing managed resources without removing anything
  sync                     Reconcile resources and remove stale checkout-owned links
  uninstall                Remove links owned by this checkout

Options:
  --agent <name[,name...]>  pi, prime, codex, claude, or all (repeatable)
  --home <path>             Override the home directory (useful for testing)
  --dry-run                 Print changes without applying them
  -h, --help                Show this help
`;
}

function parseAgents(value: string): Agent[] {
	const requested = value.split(",").map((part) => part.trim());
	if (requested.includes("all")) {
		if (requested.length !== 1) {
			throw new Error('"all" cannot be combined with named agents.');
		}
		return ALL_AGENTS;
	}
	for (const agent of requested) {
		if (!ALL_AGENTS.includes(agent as Agent)) {
			throw new Error(`Unknown agent "${agent}". Expected: ${ALL_AGENTS.join(", ")}, or all.`);
		}
	}
	return requested as Agent[];
}

export function parseOptions(argv: string[]): Options {
	if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
		process.stdout.write(usage());
		process.exit(0);
	}
	const command = argv[0] as Command;
	if (!["install", "sync", "status", "uninstall", "validate"].includes(command)) {
		throw new Error(`Unknown command "${argv[0]}".

${usage()}`);
	}

	let home = homedir();
	let dryRun = false;
	let agents: Agent[] = [];
	let selectedAll = false;
	let selectedNamedAgent = false;
	for (let index = 1; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (argument === "--home" || argument === "--agent") {
			const value = argv[index + 1];
			if (!value) {
				throw new Error(`${argument} requires a value.`);
			}
			index += 1;
			if (argument === "--home") {
				home = resolve(value);
			} else {
				const selectsAll = value.split(",").map((part) => part.trim()).includes("all");
				if ((selectsAll && selectedNamedAgent) || (!selectsAll && selectedAll)) {
					throw new Error('"all" cannot be combined with named agents.');
				}
				agents.push(...parseAgents(value));
				selectedAll ||= selectsAll;
				selectedNamedAgent ||= !selectsAll;
			}
			continue;
		}
		throw new Error(`Unknown option "${argument}".`);
	}
	if (agents.length === 0) {
		agents = ALL_AGENTS;
	}
	return { command, agents: [...new Set(agents)], home, dryRun };
}

export async function discoverSkills(skillsRoot: string): Promise<Skill[]> {
	const skills: Skill[] = [];
	for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name.startsWith(".")) {
			continue;
		}
		const path = join(skillsRoot, entry.name);
		if (existsSync(join(path, "SKILL.md"))) {
			skills.push({ name: entry.name, path });
		}
	}
	return skills.sort((left, right) => left.name.localeCompare(right.name));
}


const YAML_NON_STRING_KEYS = new Set(["false", "no", "null", "off", "on", "true", "yes"]);

function validateFlatYamlFrontmatter(source: string): string | undefined {
	const seen = new Set<string>();
	for (const [index, line] of source.split(/\r?\n/).entries()) {
		if (line.length === 0 || line.startsWith("#")) {
			continue;
		}
		if (/^\s/.test(line)) {
			return `line ${index + 1} must not be indented`;
		}
		const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]+.*)?$/);
		if (!match) {
			return `line ${index + 1} must be an unindented plain-key mapping entry`;
		}
		const key = match[1]!;
		if (YAML_NON_STRING_KEYS.has(key.toLowerCase())) {
			return `line ${index + 1} key ${JSON.stringify(key)} must resolve to a string`;
		}
		if (seen.has(key)) {
			return `duplicate top-level key ${JSON.stringify(key)}`;
		}
		seen.add(key);
	}
	return undefined;
}

class StrictJsonDuplicateScanner {
	private index = 0;

	constructor(private readonly source: string) {}

	scan(): void {
		this.skipWhitespace();
		this.scanValue();
	}

	private skipWhitespace(): void {
		while (/\s/.test(this.source[this.index] ?? "")) {
			this.index += 1;
		}
	}

	private scanString(): string {
		const start = this.index;
		this.index += 1;
		while (this.index < this.source.length) {
			const character = this.source[this.index];
			if (character === "\\") {
				this.index += 2;
				continue;
			}
			this.index += 1;
			if (character === '"') {
				return JSON.parse(this.source.slice(start, this.index)) as string;
			}
		}
		throw new SyntaxError("unterminated string");
	}

	private scanValue(): void {
		this.skipWhitespace();
		const character = this.source[this.index];
		if (character === "{") {
			this.scanObject();
			return;
		}
		if (character === "[") {
			this.scanArray();
			return;
		}
		if (character === '"') {
			this.scanString();
			return;
		}
		const start = this.index;
		while (this.index < this.source.length && !/[\s,\]}]/.test(this.source[this.index]!)) {
			this.index += 1;
		}
		if (this.index === start) {
			throw new SyntaxError("expected a JSON value");
		}
	}

	private scanObject(): void {
		this.index += 1;
		this.skipWhitespace();
		const keys = new Set<string>();
		if (this.source[this.index] === "}") {
			this.index += 1;
			return;
		}
		while (this.index < this.source.length) {
			if (this.source[this.index] !== '"') {
				throw new SyntaxError("expected an object key");
			}
			const key = this.scanString();
			if (keys.has(key)) {
				throw new SyntaxError(`duplicate object key ${JSON.stringify(key)}`);
			}
			keys.add(key);
			this.skipWhitespace();
			if (this.source[this.index] !== ":") {
				throw new SyntaxError("expected ':' after an object key");
			}
			this.index += 1;
			this.scanValue();
			this.skipWhitespace();
			if (this.source[this.index] === "}") {
				this.index += 1;
				return;
			}
			if (this.source[this.index] !== ",") {
				throw new SyntaxError("expected ',' between object entries");
			}
			this.index += 1;
			this.skipWhitespace();
		}
		throw new SyntaxError("unterminated object");
	}

	private scanArray(): void {
		this.index += 1;
		this.skipWhitespace();
		if (this.source[this.index] === "]") {
			this.index += 1;
			return;
		}
		while (this.index < this.source.length) {
			this.scanValue();
			this.skipWhitespace();
			if (this.source[this.index] === "]") {
				this.index += 1;
				return;
			}
			if (this.source[this.index] !== ",") {
				throw new SyntaxError("expected ',' between array values");
			}
			this.index += 1;
			this.skipWhitespace();
		}
		throw new SyntaxError("unterminated array");
	}
}

function parseStrictJson(source: string): unknown {
	new StrictJsonDuplicateScanner(source).scan();
	return JSON.parse(source) as unknown;
}

export async function validateSkills(skillsRoot: string): Promise<string[]> {
	const errors: string[] = [];
	for (const skill of await discoverSkills(skillsRoot)) {
		const document = await readFile(join(skill.path, "SKILL.md"), "utf8");
		const match = document.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
		if (!match) {
			errors.push(`${skill.name}: SKILL.md must start with YAML frontmatter`);
			continue;
		}
		const frontmatter = match[1] ?? "";
		const grammarError = validateFlatYamlFrontmatter(frontmatter);
		if (grammarError !== undefined) {
			errors.push(`${skill.name}: invalid YAML frontmatter: ${grammarError}`);
			continue;
		}
		let metadata: Record<string, unknown>;
		try {
			const parsed: unknown = Bun.YAML.parse(frontmatter);
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
				throw new Error("frontmatter must be a mapping");
			}
			metadata = parsed as Record<string, unknown>;
			if (Object.values(metadata).some((value) => typeof value === "object" && value !== null)) {
				throw new Error("frontmatter values must be scalars");
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			errors.push(`${skill.name}: invalid YAML frontmatter: ${message}`);
			continue;
		}
		const name = typeof metadata.name === "string" ? metadata.name : undefined;
		const description = typeof metadata.description === "string" ? metadata.description : undefined;
		if (name !== skill.name) {
			errors.push(`${skill.name}: frontmatter name must match its directory`);
		}
		if (!NAME_PATTERN.test(skill.name) || skill.name.length > 64) {
			errors.push(`${skill.name}: name must be <=64 lowercase letters, numbers, and single hyphens`);
		}
		if (!description || description.trim().length === 0) {
			errors.push(`${skill.name}: description is required`);
		} else if (description.length > 1024) {
			errors.push(`${skill.name}: description must be <=1024 characters`);
		}
	}
	return errors;
}

export async function loadConfig(configPath: string, skills: Skill[]): Promise<{ scopes: SkillScopes; errors: string[] }> {
	const scopes: SkillScopes = new Map(skills.map((skill) => [skill.name, [...ALL_AGENTS]]));
	const errors: string[] = [];
	if (!existsSync(configPath)) {
		return { scopes, errors };
	}
	let parsed: unknown;
	try {
		parsed = parseStrictJson(await readFile(configPath, "utf8"));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { scopes, errors: [`agent-toolkit.json: invalid JSON: ${message}`] };
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return { scopes: new Map(), errors: ["agent-toolkit.json: top level must be an object"] };
	}
	const config = parsed as Record<string, unknown>;
	for (const key of Object.keys(config)) {
		if (key !== "skills") {
			errors.push(`agent-toolkit.json: unknown top-level key "${key}"`);
		}
	}
	if (typeof config.skills !== "object" || config.skills === null || Array.isArray(config.skills)) {
		errors.push("agent-toolkit.json: skills must be an object");
		return { scopes: new Map(), errors };
	}

	const configured = config.skills as Record<string, unknown>;
	const discoveredNames = new Set(skills.map((skill) => skill.name));
	for (const [skillName, rawAgents] of Object.entries(configured)) {
		if (!discoveredNames.has(skillName)) {
			errors.push(`agent-toolkit.json: configured skill "${skillName}" is missing from skills/`);
		}
		if (!Array.isArray(rawAgents)) {
			errors.push(`agent-toolkit.json: ${skillName} must have an agent array`);
			continue;
		}
		if (rawAgents.length === 0) {
			errors.push(`agent-toolkit.json: ${skillName} must have at least one agent`);
			continue;
		}
		const agents: Agent[] = [];
		const seen = new Set<string>();
		for (const rawAgent of rawAgents) {
			if (typeof rawAgent !== "string" || !ALL_AGENTS.includes(rawAgent as Agent)) {
				errors.push(`agent-toolkit.json: ${skillName} has unknown agent ${JSON.stringify(rawAgent)}`);
				continue;
			}
			if (seen.has(rawAgent)) {
				errors.push(`agent-toolkit.json: ${skillName} lists agent "${rawAgent}" more than once`);
				continue;
			}
			seen.add(rawAgent);
			agents.push(rawAgent as Agent);
		}
		scopes.set(skillName, agents);
	}
	return { scopes, errors };
}

function targetOfLink(path: string): string | undefined {
	try {
		if (!lstatSync(path).isSymbolicLink()) {
			return undefined;
		}
		return resolve(dirname(path), readlinkSync(path));
	} catch {
		return undefined;
	}
}

function validateContextSource(contextSource: string): { exists: boolean; errors: string[] } {
	try {
		if (!lstatSync(contextSource).isFile()) {
			return { exists: true, errors: [`${CONTEXT_SOURCE_PATH}: must be a regular file`] };
		}
		return { exists: true, errors: [] };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { exists: false, errors: [] };
		}
		throw error;
	}
}

function isOwnedContextLink(destination: string, contextSource: string): boolean {
	return targetOfLink(destination) === contextSource;
}

function isWithin(path: string, parent: string): boolean {
	const pathFromParent = relative(parent, path);
	return pathFromParent !== ".." && !pathFromParent.startsWith(`..${sep}`) && !isAbsolute(pathFromParent);
}

function isManagedLink(path: string, skillsRoot: string): boolean {
	const target = targetOfLink(path);
	return target !== undefined && isWithin(target, skillsRoot) && dirname(target) === skillsRoot;
}

async function ensureLink(skill: Skill, destinationRoot: string, dryRun: boolean): Promise<"linked" | "present" | "conflict"> {
	const destination = join(destinationRoot, skill.name);
	const currentTarget = targetOfLink(destination);
	if (currentTarget === skill.path) {
		return "present";
	}
	if (existsSync(destination) || currentTarget !== undefined) {
		return "conflict";
	}
	if (!dryRun) {
		await mkdir(destinationRoot, { recursive: true });
		await symlink(skill.path, destination, "dir");
	}
	return "linked";
}

async function removeStaleLinks(destinationRoot: string, skills: Skill[], skillsRoot: string, dryRun: boolean): Promise<number> {
	if (!existsSync(destinationRoot)) {
		return 0;
	}
	const expected = new Set(skills.map((skill) => skill.name));
	let removed = 0;
	for (const entry of readdirSync(destinationRoot)) {
		const path = join(destinationRoot, entry);
		if (!expected.has(entry) && isManagedLink(path, skillsRoot)) {
			process.stdout.write(`remove ${path}
`);
			if (!dryRun) {
				await rm(path);
			}
			removed += 1;
		}
	}
	return removed;
}

function skillsForAgent(skills: Skill[], scopes: SkillScopes, agent: Agent): Skill[] {
	return skills.filter((skill) => scopes.get(skill.name)?.includes(agent) === true);
}

async function ensureContextLink(
	contextSource: string,
	destination: string,
	dryRun: boolean,
): Promise<"linked" | "present" | "conflict"> {
	const currentTarget = targetOfLink(destination);
	if (currentTarget === contextSource) {
		return "present";
	}
	if (existsSync(destination) || currentTarget !== undefined) {
		return "conflict";
	}
	if (!dryRun) {
		await mkdir(dirname(destination), { recursive: true });
		await symlink(contextSource, destination, "file");
	}
	return "linked";
}

async function removeOwnedContextLink(destination: string, contextSource: string, dryRun: boolean): Promise<number> {
	if (!isOwnedContextLink(destination, contextSource)) {
		return 0;
	}
	process.stdout.write(`remove context: ${destination}
`);
	if (!dryRun) {
		await rm(destination);
	}
	return 1;
}

async function installOrSync(
	options: Options,
	skills: Skill[],
	scopes: SkillScopes,
	skillsRoot: string,
	contextSource: string,
	hasContext: boolean,
): Promise<Summary> {
	let changed = 0;
	let conflicts = 0;
	for (const agent of options.agents) {
		const destinationRoot = join(options.home, AGENT_SKILL_PATHS[agent]);
		const scopedSkills = skillsForAgent(skills, scopes, agent);
		process.stdout.write(`${agent}: ${destinationRoot}
`);
		for (const skill of scopedSkills) {
			const result = await ensureLink(skill, destinationRoot, options.dryRun);
			if (result === "linked") {
				process.stdout.write(`  link ${skill.name}
`);
				changed += 1;
			} else if (result === "conflict") {
				process.stderr.write(`  conflict ${skill.name}: destination already exists
`);
				conflicts += 1;
			}
		}
		if (options.command === "sync") {
			changed += await removeStaleLinks(destinationRoot, scopedSkills, skillsRoot, options.dryRun);
		}

		const contextDestination = join(options.home, AGENT_CONTEXT_PATHS[agent]);
		if (hasContext) {
			const result = await ensureContextLink(contextSource, contextDestination, options.dryRun);
			if (result === "linked") {
				process.stdout.write(`  link context: ${contextDestination}
`);
				changed += 1;
			} else if (result === "conflict") {
				process.stderr.write(`  conflict context: ${contextDestination} already exists
`);
				conflicts += 1;
			}
		} else if (options.command === "sync") {
			changed += await removeOwnedContextLink(contextDestination, contextSource, options.dryRun);
		}
	}
	return { changed, conflicts };
}

async function showStatus(
	options: Options,
	skills: Skill[],
	scopes: SkillScopes,
	contextSource: string,
	hasContext: boolean,
): Promise<Summary> {
	let conflicts = 0;
	for (const agent of options.agents) {
		const destinationRoot = join(options.home, AGENT_SKILL_PATHS[agent]);
		let linked = 0;
		let missing = 0;
		let agentConflicts = 0;
		for (const skill of skillsForAgent(skills, scopes, agent)) {
			const destination = join(destinationRoot, skill.name);
			const target = targetOfLink(destination);
			if (target === skill.path) {
				linked += 1;
			} else if (!existsSync(destination) && target === undefined) {
				missing += 1;
			} else {
				agentConflicts += 1;
			}
		}
		conflicts += agentConflicts;
		process.stdout.write(`${agent}: ${linked} linked, ${missing} missing, ${agentConflicts} conflicts (${destinationRoot})
`);
		if (hasContext) {
			const contextDestination = join(options.home, AGENT_CONTEXT_PATHS[agent]);
			const target = targetOfLink(contextDestination);
			let state: "linked" | "missing" | "conflict";
			if (target === contextSource) {
				state = "linked";
			} else if (!existsSync(contextDestination) && target === undefined) {
				state = "missing";
			} else {
				state = "conflict";
				conflicts += 1;
			}
			process.stdout.write(`  context: ${state} (${contextDestination})
`);
		}
	}
	return { changed: 0, conflicts };
}

async function uninstall(options: Options, skillsRoot: string, contextSource: string): Promise<Summary> {
	let changed = 0;
	for (const agent of options.agents) {
		const destinationRoot = join(options.home, AGENT_SKILL_PATHS[agent]);
		if (existsSync(destinationRoot)) {
			for (const entry of readdirSync(destinationRoot)) {
				const path = join(destinationRoot, entry);
				if (!isManagedLink(path, skillsRoot)) {
					continue;
				}
				process.stdout.write(`remove ${agent}/${entry}
`);
				if (!options.dryRun) {
					await rm(path);
				}
				changed += 1;
			}
		}
		const contextDestination = join(options.home, AGENT_CONTEXT_PATHS[agent]);
		changed += await removeOwnedContextLink(contextDestination, contextSource, options.dryRun);
	}
	return { changed, conflicts: 0 };
}

export async function run(argv: string[], repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")): Promise<number> {
	try {
		const options = parseOptions(argv);
		const skillsRoot = join(repoRoot, "skills");
		const skills = await discoverSkills(skillsRoot);
		const validationErrors = await validateSkills(skillsRoot);
		const config = await loadConfig(join(repoRoot, "agent-toolkit.json"), skills);
		validationErrors.push(...config.errors);
		const contextSource = resolve(repoRoot, CONTEXT_SOURCE_PATH);
		const context = validateContextSource(contextSource);
		validationErrors.push(...context.errors);
		if (validationErrors.length > 0) {
			for (const error of validationErrors) {
				process.stderr.write(`error: ${error}
`);
			}
			return 1;
		}
		if (options.command === "validate") {
			process.stdout.write(`Validated ${skills.length} skills.
`);
			return 0;
		}

		let summary: Summary;
		if (options.command === "status") {
			summary = await showStatus(options, skills, config.scopes, contextSource, context.exists);
		} else if (options.command === "uninstall") {
			summary = await uninstall(options, skillsRoot, contextSource);
		} else {
			summary = await installOrSync(options, skills, config.scopes, skillsRoot, contextSource, context.exists);
		}
		if (options.dryRun && summary.changed > 0) {
			process.stdout.write(`Dry run: ${summary.changed} change(s) would be made.
`);
		}
		return summary.conflicts > 0 ? 1 : 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`error: ${message}
`);
		return 2;
	}
}

if (import.meta.main) {
	process.exitCode = await run(process.argv.slice(2));
}
