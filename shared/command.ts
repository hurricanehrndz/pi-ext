import { Buffer } from "node:buffer";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const DEFAULT_ERROR_SNIPPET_CHARS = 800;

export type CommandResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

export type RunCommandOptions = {
	command: string;
	args: readonly string[];
	stdin?: string;
	cwd?: string;
	timeoutMs?: number;
	signal?: AbortSignal;
};

type ProcessExit = {
	exitCode: number | null;
	signal: NodeJS.Signals | null;
	error?: Error;
};

export async function runCommand(options: RunCommandOptions): Promise<CommandResult> {
	const command = options.command.trim();
	if (command.length === 0) {
		throw new Error("Command must not be empty");
	}

	if (options.timeoutMs !== undefined && options.timeoutMs <= 0) {
		throw new Error("Command timeoutMs must be greater than 0");
	}

	if (options.signal?.aborted) {
		throw new Error(`Command ${command} aborted before start`);
	}

	const stdoutChunks: string[] = [];
	const stderrChunks: string[] = [];
	let abortReason: string | undefined;

	let subprocess: ChildProcessWithoutNullStreams;
	try {
		subprocess = spawn(command, [...options.args], {
			cwd: options.cwd,
			windowsHide: true,
		});
	} catch (error) {
		throw new Error(buildCommandFailureMessage(command, 1, "", "", errorMessage(error)));
	}

	subprocess.stdout.on("data", (chunk: Buffer | string) => {
		stdoutChunks.push(chunk.toString());
	});
	subprocess.stderr.on("data", (chunk: Buffer | string) => {
		stderrChunks.push(chunk.toString());
	});

	// Avoid an unhandled EPIPE if the child exits before consuming stdin.
	subprocess.stdin.on("error", () => undefined);
	subprocess.stdin.end(options.stdin ?? "", "utf8");

	const killSubprocess = (reason: string) => {
		if (abortReason === undefined) {
			abortReason = reason;
		}
		if (!subprocess.killed) {
			subprocess.kill("SIGTERM");
		}
	};

	const onAbort = () => killSubprocess("aborted");
	options.signal?.addEventListener("abort", onAbort, { once: true });
	if (options.signal?.aborted) {
		onAbort();
	}

	const timeout =
		options.timeoutMs === undefined
			? undefined
			: setTimeout(() => killSubprocess(`timed out after ${options.timeoutMs}ms`), options.timeoutMs);

	try {
		const exit = await waitForExit(subprocess);
		const stdout = stdoutChunks.join("");
		const stderr = stderrChunks.join("");

		if (exit.error !== undefined) {
			throw new Error(buildCommandFailureMessage(command, 1, stdout, stderr, exit.error.message));
		}

		const exitCode = exit.exitCode ?? 1;
		if (abortReason !== undefined) {
			throw new Error(buildCommandFailureMessage(command, exitCode, stdout, stderr, abortReason));
		}

		if (exit.signal !== null) {
			throw new Error(buildCommandFailureMessage(command, exitCode, stdout, stderr, `terminated by signal ${exit.signal}`));
		}

		if (exitCode !== 0) {
			throw new Error(buildCommandFailureMessage(command, exitCode, stdout, stderr, undefined));
		}

		return { stdout, stderr, exitCode };
	} finally {
		if (timeout !== undefined) {
			clearTimeout(timeout);
		}
		options.signal?.removeEventListener("abort", onAbort);
	}
}

function waitForExit(subprocess: ChildProcessWithoutNullStreams): Promise<ProcessExit> {
	return new Promise((resolve) => {
		let settled = false;
		const settle = (exit: ProcessExit) => {
			if (!settled) {
				settled = true;
				resolve(exit);
			}
		};

		subprocess.once("error", (error) => settle({ exitCode: 1, signal: null, error }));
		subprocess.once("close", (exitCode, signal) => settle({ exitCode, signal }));
	});
}

function buildCommandFailureMessage(
	command: string,
	exitCode: number,
	stdout: string,
	stderr: string,
	reason: string | undefined,
): string {
	const parts = [`Command ${command} failed with exit code ${exitCode}`];
	if (reason !== undefined) {
		parts.push(`Reason: ${reason}`);
	}

	const stderrSnippet = formatOutputSnippet(stderr);
	if (stderrSnippet.length > 0) {
		parts.push(`stderr: ${stderrSnippet}`);
	}

	const stdoutSnippet = formatOutputSnippet(stdout);
	if (stdoutSnippet.length > 0) {
		parts.push(`stdout: ${stdoutSnippet}`);
	}

	return parts.join("\n");
}

function formatOutputSnippet(output: string): string {
	const normalized = output.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
	if (normalized.length <= DEFAULT_ERROR_SNIPPET_CHARS) {
		return normalized;
	}

	return `${normalized.slice(0, DEFAULT_ERROR_SNIPPET_CHARS)}… [truncated]`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
