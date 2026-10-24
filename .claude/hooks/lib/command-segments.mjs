#!/usr/bin/env node
// command-segments.mjs — split a shell command into the commands it runs, so
// the deploy guard can tell a plain `git commit -m "…"` (text, never an
// action) from a compound command that also deploys. Shared with Maecenas's
// hooks (PMDevSolutions/Maecenas#49); keep the code in sync, only this header
// differs.
//
// Quote-aware: `;`, `&`, `|`, `&&`, `||` and newlines split only outside
// quotes. `$( … )`, backticks and `<( … )` open a segment of their own even
// inside double quotes, because their contents run. The body of a heredoc fed
// to git or gh is dropped (a commit message or PR body is text); any other
// heredoc body is kept as a segment of its own, since it may be a script.
//
// Usage (command text on stdin):
//   node command-segments.mjs --internal   print "internal" when every segment is
//                                          internal tooling (git, gh, cd, echo,
//                                          the test runner), "external" otherwise
//                                          or on any error. Callers exempt only on
//                                          the literal "internal", so a crash, a
//                                          missing node or an unexpected exit
//                                          never exempts anything.
//   node command-segments.mjs --json       print the segments as JSON
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function splitCommand(src) {
  const segments = [];
  const pendingHeredocs = [];
  // Each frame is one command list: the top level, or a $( … ) / `…` body.
  const stack = [{ cur: "", closer: null }];
  const top = () => stack[stack.length - 1];
  const endSegment = () => {
    const f = top();
    if (f.cur.trim()) segments.push(f.cur.trim());
    f.cur = "";
  };
  const readHeredocBodies = (i) => {
    // i points just past a newline; consume each pending heredoc body in order.
    for (const h of pendingHeredocs.splice(0)) {
      const lines = [];
      while (i < src.length) {
        let j = src.indexOf("\n", i);
        if (j === -1) j = src.length;
        const line = src.slice(i, j);
        i = j + 1;
        if ((h.stripTabs ? line.replace(/^\t+/, "") : line) === h.delim) break;
        lines.push(line);
      }
      if (!["git", "gh"].includes(programOf(h.owner)) && lines.length) segments.push(`<<heredoc ${lines.join("\n")}`);
    }
    return i;
  };

  let i = 0;
  let quote = null; // "'" or '"'
  while (i < src.length) {
    const c = src[i];
    const f = top();
    if (quote === "'") {
      f.cur += c;
      if (c === "'") quote = null;
      i += 1;
      continue;
    }
    if (c === "\\") {
      f.cur += src.slice(i, i + 2);
      i += 2;
      continue;
    }
    // Command substitution runs in and out of double quotes.
    if ((c === "$" || c === "<" || c === ">") && src[i + 1] === "(" && !(c !== "$" && quote)) {
      f.cur += " __subst__ ";
      stack.push({ cur: "", closer: ")", quote, depth: 0 });
      quote = null;
      i += 2;
      continue;
    }
    if (c === "`" && f.closer !== "`") {
      f.cur += " __subst__ ";
      stack.push({ cur: "", closer: "`", quote });
      quote = null;
      i += 1;
      continue;
    }
    if (quote === '"') {
      f.cur += c;
      if (c === '"') quote = null;
      i += 1;
      continue;
    }
    // Outside quotes from here on.
    if (f.closer === "`" && c === "`") {
      endSegment();
      const done = stack.pop();
      quote = done.quote;
      i += 1;
      continue;
    }
    if (f.closer === ")") {
      if (c === "(") f.depth += 1;
      if (c === ")") {
        if (f.depth === 0) {
          endSegment();
          const done = stack.pop();
          quote = done.quote;
          i += 1;
          continue;
        }
        f.depth -= 1;
      }
    }
    if (c === "'" || c === '"') {
      quote = c;
      f.cur += c;
      i += 1;
      continue;
    }
    if (c === "#" && (f.cur === "" || /\s$/.test(f.cur))) {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "<" && src[i + 1] === "<" && src[i + 2] !== "<") {
      const m = /^<<(-?)\s*(?:'([^']+)'|"([^"]+)"|\\?([A-Za-z0-9_.-]+))/.exec(src.slice(i));
      if (m) {
        pendingHeredocs.push({ delim: m[2] || m[3] || m[4], stripTabs: m[1] === "-", owner: f.cur });
        f.cur += m[0];
        i += m[0].length;
        continue;
      }
    }
    // Redirections that contain & are not separators: 2>&1, >&2, &>file, <&3.
    if ((c === ">" || c === "<") && src[i + 1] === "&") {
      f.cur += src.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === "&" && src[i + 1] === ">") {
      f.cur += src.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === "\n") {
      endSegment();
      i = readHeredocBodies(i + 1);
      continue;
    }
    if (c === ";" || c === "&" || c === "|") {
      endSegment();
      i += src[i + 1] === c || (c === "|" && src[i + 1] === "&") ? 2 : 1;
      continue;
    }
    f.cur += c;
    i += 1;
  }
  if (quote || stack.length > 1) throw new Error("unbalanced quotes or substitution");
  endSegment();
  return segments;
}

const WRAPPERS = new Set(["env", "command", "exec", "time", "nohup", "sudo", "builtin"]);

export function programOf(segment) {
  let s = String(segment).trim().replace(/^[({!\s]+/, "");
  // Leading variable assignments: FOO=bar, X="$HOME", Y='a b'.
  s = s.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"(?:[^"\\]|\\.)*"|'[^']*'|\S*)\s+)+/, "");
  for (;;) {
    const m = /^(\S+)\s*(.*)$/s.exec(s);
    if (!m) return "";
    if (WRAPPERS.has(m[1])) {
      s = m[2].replace(/^(?:-\S+\s+)*/, "").replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, "");
      continue;
    }
    return m[1];
  }
}

const INTERNAL_PROGRAMS = new Set(["git", "gh", "cd", "pushd", "popd", "true", "false", ":", "echo", "printf", "test", "[", "vitest"]);

export function isInternalSegment(segment) {
  const prog = programOf(segment);
  if (INTERNAL_PROGRAMS.has(prog)) return true;
  // The test runner and linter through the package manager.
  const rest = String(segment).trim().replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, "");
  return /^(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:test|vitest|lint)\b/.test(rest) || /^(?:npx|pnpm\s+(?:exec|dlx))\s+vitest\b/.test(rest);
}

export function isInternalCommand(src) {
  const segments = splitCommand(src);
  return segments.length > 0 && segments.every(isInternalSegment);
}

function runAsScript() {
  // Compare real paths: a path with spaces or a symlinked plugin cache must
  // still be recognised as a direct run.
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}

if (runAsScript()) {
  let src = "";
  try { src = readFileSync(0, "utf8"); } catch { src = null; }
  if (process.argv.includes("--json")) {
    try { process.stdout.write(JSON.stringify(splitCommand(src ?? "")) + "\n"); } catch (e) { process.stdout.write(JSON.stringify({ error: e.message }) + "\n"); }
  } else {
    let internal = false;
    try { internal = src !== null && isInternalCommand(src); } catch { internal = false; }
    process.stdout.write(internal ? "internal\n" : "external\n");
  }
}
