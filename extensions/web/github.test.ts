import { describe, expect, test } from "bun:test";

import { parseGitHubUrl } from "./github.js";

describe("parseGitHubUrl", () => {
	test("parses repository URLs", () => {
		expect(parseGitHubUrl("https://github.com/OWNER/REPO")).toEqual({
			kind: "repo",
			owner: "OWNER",
			repo: "REPO",
		});
	});

	test("parses blob URLs", () => {
		expect(parseGitHubUrl("https://github.com/OWNER/REPO/blob/main/src/index.ts")).toEqual({
			kind: "blob",
			owner: "OWNER",
			repo: "REPO",
			ref: "main",
			path: "src/index.ts",
		});
	});

	test("parses tree URLs", () => {
		expect(parseGitHubUrl("https://github.com/OWNER/REPO/tree/main/src")).toEqual({
			kind: "tree",
			owner: "OWNER",
			repo: "REPO",
			ref: "main",
			path: "src",
		});
	});

	test("parses issue URLs", () => {
		expect(parseGitHubUrl("https://github.com/OWNER/REPO/issues/123")).toEqual({
			kind: "issue",
			owner: "OWNER",
			repo: "REPO",
			number: 123,
		});
	});

	test("parses pull request URLs", () => {
		expect(parseGitHubUrl("https://github.com/OWNER/REPO/pull/456")).toEqual({
			kind: "pull",
			owner: "OWNER",
			repo: "REPO",
			number: 456,
		});
	});

	test("parses raw GitHub URLs as blobs", () => {
		expect(parseGitHubUrl("https://raw.githubusercontent.com/OWNER/REPO/main/README.md")).toEqual({
			kind: "blob",
			owner: "OWNER",
			repo: "REPO",
			ref: "main",
			path: "README.md",
		});
	});

	test("returns null for non-GitHub URLs", () => {
		expect(parseGitHubUrl("https://example.com/OWNER/REPO")).toBeNull();
	});
});
