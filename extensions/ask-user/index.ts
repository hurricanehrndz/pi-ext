/**
 * ask-user — lets the AI agent ask the user free-form questions.
 *
 * Inspired by https://github.com/edlsh/pi-ask-user
 *
 * A simple, focused tool:
 *   - Shows all questions as a numbered list with live status icons
 *   - Edits answers one at a time with a multi-line editor
 *   - Navigates with Tab / Shift-Tab / Enter; cancels with Esc
 *   - Falls back to sequential ctx.ui.input() when no TUI is available
 */

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  Spacer,
  Text,
  truncateToWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserQuestion {
  question: string;
  context?: string;
}

interface QuestionAnswer {
  question: string;
  context?: string;
  answer: string;
}

interface AskResult {
  answers: QuestionAnswer[];
  cancelled: boolean;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const QuestionSchema = Type.Object({
  question: Type.String({ description: "The question to ask the user" }),
  context: Type.Optional(
    Type.String({
      description:
        "Optional background or context to show below the question (findings, constraints, etc.)",
    }),
  ),
});

const AskUserParams = Type.Object({
  questions: Type.Array(QuestionSchema, {
    description: "One or more questions to ask. Each gets its own free-form text answer.",
    minItems: 1,
  }),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusIcon(
  index: number,
  current: number,
  answered: Map<number, string>,
  theme: Theme,
): string {
  if (index === current) return theme.fg("accent", "→");
  if (answered.has(index)) return theme.fg("success", "✓");
  return theme.fg("dim", "○");
}

function editorThemeFrom(theme: Theme): EditorTheme {
  return {
    borderColor: (s) => theme.fg("accent", s),
    selectList: {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    },
  };
}

// ─── TUI component ────────────────────────────────────────────────────────────

/**
 * Renders the full ask-user panel:
 *   ─────────────────────────────────────────
 *    ask_user  (N questions)
 *   ─────────────────────────────────────────
 *    → 1. What database should we use?
 *      2. ✓ Which auth strategy?
 *      3. ○ Preferred deployment target?
 *   ─────────────────────────────────────────
 *    Context: <text>
 *
 *    Answer: (editor)
 *   ─────────────────────────────────────────
 *    Tab/Enter next • Shift-Tab prev • Esc cancel
 *   ─────────────────────────────────────────
 */
class AskUserComponent extends Container {
  private questions: UserQuestion[];
  private current = 0;
  private answers = new Map<number, string>();
  private editor: Editor;
  private cachedLines?: string[];

  // Focusable support for IME cursor positioning
  private _focused = false;
  get focused(): boolean {
    return this._focused;
  }
  set focused(value: boolean) {
    this._focused = value;
    (this.editor as unknown as { focused: boolean }).focused = value;
  }

  onDone: (result: AskResult) => void = () => {};

  constructor(
    questions: UserQuestion[],
    private tui: { requestRender(): void; terminal: { rows: number; columns: number } },
    private theme: Theme,
    kb: unknown,
  ) {
    super();
    this.questions = questions;

    this.editor = new Editor(this.tui as never, editorThemeFrom(theme));
    this.editor.disableSubmit = false;
    this.editor.onSubmit = (text: string) => {
      this.saveCurrentAnswer(text);
      if (this.current < this.questions.length - 1) {
        this.current++;
        this.editor.setText("");
        this.refresh();
      } else {
        this.submitAll();
      }
    };
  }

  // ── public ──

  override invalidate(): void {
    super.invalidate();
    this.cachedLines = undefined;
  }

  handleInput(data: string): void {
    // Esc → cancel
    if (matchesKey(data, Key.escape)) {
      this.onDone({ answers: [], cancelled: true });
      return;
    }

    // Shift+Tab → previous question
    if (matchesKey(data, Key.shift("tab"))) {
      this.saveCurrentDraft();
      if (this.current > 0) {
        this.current--;
        this.editor.setText(this.answers.get(this.current) ?? "");
        this.refresh();
      }
      return;
    }

    // Tab → next question (skip empty answers allowed via tab)
    if (matchesKey(data, Key.tab)) {
      this.saveCurrentDraft();
      if (this.current < this.questions.length - 1) {
        this.current++;
        this.editor.setText(this.answers.get(this.current) ?? "");
        this.refresh();
      }
      return;
    }

    // Delegate all other input to the editor
    this.editor.handleInput(data);
    this.refresh();
  }

  override render(width: number): string[] {
    if (this.cachedLines) return this.cachedLines;

    const theme = this.theme;
    const lines: string[] = [];
    const add = (s: string) => lines.push(truncateToWidth(s, width));
    const divider = () => add(theme.fg("accent", "─".repeat(width)));
    const blank = () => lines.push("");

    // ── header ──────────────────────────────────────────────────────────────
    divider();
    const count = this.questions.length;
    add(
      ` ${theme.fg("accent", theme.bold("ask_user"))}  ${theme.fg("dim", `${count} question${count !== 1 ? "s" : ""}`)}`
    );
    divider();

    // ── question list ────────────────────────────────────────────────────────
    blank();
    for (let i = 0; i < this.questions.length; i++) {
      const icon = statusIcon(i, this.current, this.answers, theme);
      const num = theme.fg("dim", `${i + 1}.`);
      const qText = this.questions[i]?.question ?? "";
      const label =
        i === this.current
          ? theme.fg("accent", theme.bold(qText))
          : this.answers.has(i)
            ? theme.fg("muted", qText)
            : theme.fg("text", qText);
      add(` ${icon} ${num} ${label}`);
    }
    blank();
    divider();

    // ── current question detail ──────────────────────────────────────────────
    const q = this.questions[this.current];
    if (!q) {
      this.cachedLines = lines;
      return lines;
    }

    blank();
    // Question text (wrapped)
    const questionLines = wrapTextWithAnsi(q.question, Math.max(10, width - 4));
    for (const l of questionLines) {
      add(`  ${theme.fg("text", theme.bold(l))}`);
    }

    // Context block (if any)
    if (q.context) {
      blank();
      const ctxLines = wrapTextWithAnsi(q.context, Math.max(10, width - 6));
      add(`  ${theme.fg("dim", "Context:")}`);
      for (const l of ctxLines) {
        add(`    ${theme.fg("muted", l)}`);
      }
    }

    blank();
    add(`  ${theme.fg("accent", "Answer:")}`);

    // Editor (indented 2)
    for (const l of this.editor.render(Math.max(10, width - 2))) {
      lines.push(` ${l}`);
    }

    blank();
    divider();

    // ── footer help ──────────────────────────────────────────────────────────
    const isLast = this.current === this.questions.length - 1;
    const submitHint = isLast
      ? theme.fg("success", "Enter submit all")
      : theme.fg("dim", "Enter next");
    const help = [
      theme.fg("dim", "Tab next"),
      theme.fg("dim", "Shift-Tab prev"),
      submitHint,
      theme.fg("dim", "Esc cancel"),
    ].join(theme.fg("dim", " • "));
    add(` ${help}`);
    divider();

    this.cachedLines = lines;
    return lines;
  }

  // ── private ──

  private saveCurrentAnswer(text: string): void {
    const trimmed = text.trim();
    if (trimmed) {
      this.answers.set(this.current, trimmed);
    } else {
      this.answers.delete(this.current);
    }
  }

  private saveCurrentDraft(): void {
    const getText = (this.editor as unknown as { getText?(): string }).getText;
    if (typeof getText === "function") {
      this.saveCurrentAnswer(getText.call(this.editor) as string);
    }
  }

  private submitAll(): void {
    this.saveCurrentDraft();
    const answers: QuestionAnswer[] = this.questions.map((q, i) => ({
      question: q.question,
      context: q.context,
      answer: this.answers.get(i) ?? "",
    }));
    this.onDone({ answers, cancelled: false });
  }

  private refresh(): void {
    this.cachedLines = undefined;
    this.tui.requestRender();
  }
}

// ─── No-UI fallback ───────────────────────────────────────────────────────────

async function askViaDialogs(
  ui: { input(title: string, placeholder?: string): Promise<string | undefined> },
  questions: UserQuestion[],
): Promise<AskResult> {
  const answers: QuestionAnswer[] = [];

  for (const q of questions) {
    const prompt = q.context ? `${q.question}\n\nContext:\n${q.context}` : q.question;
    const answer = await ui.input(prompt, "Type your answer…");
    if (answer === undefined) {
      return { answers: [], cancelled: true };
    }
    answers.push({ question: q.question, context: q.context, answer: answer.trim() });
  }

  return { answers, cancelled: false };
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description:
      "Ask the user one or more free-form questions. " +
      "Use when information is needed that cannot be inferred from the codebase, " +
      "when requirements are ambiguous, or before making high-stakes decisions. " +
      "Each question gets a dedicated long-form text answer.",
    promptSnippet:
      "Ask the user one or more focused questions requiring free-form answers",
    promptGuidelines: [
      "Use ask_user when the user's intent is ambiguous or a decision requires explicit human input.",
      "Use ask_user before high-stakes, hard-to-reverse changes when requirements are unclear.",
      "Each ask_user question should be focused and specific — avoid combining unrelated questions.",
      "Gather context from available tools (read, bash, etc.) before calling ask_user so you can provide useful context per question.",
      "Do not call ask_user for information that can be obtained by reading files or running commands.",
    ],
    parameters: AskUserParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const questions = params.questions as UserQuestion[];

      if (questions.length === 0) {
        return {
          content: [{ type: "text", text: "Error: no questions provided" }],
          details: { answers: [], cancelled: false } satisfies AskResult,
        };
      }

      // ── headless fallback ──────────────────────────────────────────────────
      if (!ctx.hasUI) {
        const result = await askViaDialogs(
          { input: (title, placeholder) => ctx.ui.input(title, placeholder) },
          questions,
        );
        return buildReturn(result, questions);
      }

      // ── interactive TUI ────────────────────────────────────────────────────
      const result = await ctx.ui.custom<AskResult>((tui, theme, kb, done) => {
        const component = new AskUserComponent(questions, tui, theme, kb);
        component.onDone = done;
        return component;
      });

      return buildReturn(result ?? { answers: [], cancelled: true }, questions);
    },

    // ── custom rendering ─────────────────────────────────────────────────────

    renderCall(args, theme) {
      const qs = (args.questions as UserQuestion[]) ?? [];
      const count = qs.length;
      const preview = qs
        .map((q, i) => `${i + 1}. ${q.question}`)
        .join(" · ");
      const text =
        theme.fg("toolTitle", theme.bold("ask_user ")) +
        theme.fg("dim", `${count} question${count !== 1 ? "s" : ""}`) +
        (preview ? `\n${theme.fg("dim", "  " + preview)}` : "");
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = result.details as AskResult | undefined;
      if (!details) {
        const first = result.content[0];
        return new Text(first?.type === "text" ? first.text : "", 0, 0);
      }
      if (details.cancelled) {
        return new Text(theme.fg("warning", "Cancelled"), 0, 0);
      }
      const lines = details.answers.map(
        (a) =>
          theme.fg("success", "✓ ") +
          theme.fg("accent", a.question) +
          "\n" +
          theme.fg("muted", "  " + a.answer.replace(/\n/g, "\n  ")),
      );
      return new Text(lines.join("\n"), 0, 0);
    },
  });
}

// ─── Result builder ───────────────────────────────────────────────────────────

function buildReturn(
  result: AskResult,
  questions: UserQuestion[],
): { content: { type: "text"; text: string }[]; details: AskResult } {
  if (result.cancelled) {
    return {
      content: [{ type: "text", text: "User cancelled the question session." }],
      details: result,
    };
  }

  const lines = result.answers.map((a, i) => {
    const num = `Q${i + 1}`;
    const ans = a.answer.trim() || "(no answer provided)";
    return `${num}. ${a.question}\nAnswer: ${ans}`;
  });

  return {
    content: [{ type: "text", text: lines.join("\n\n") }],
    details: result,
  };
}
