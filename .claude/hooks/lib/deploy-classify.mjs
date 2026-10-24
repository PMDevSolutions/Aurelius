#!/usr/bin/env node
// deploy-classify.mjs — classify a Bash command for deploy-guard.sh.
//
// The command is split into the commands it actually runs (command-segments.mjs,
// so a commit message that mentions `vercel --prod` stays text), and each one is
// matched against the ways an Aurelius project reaches users. The most serious
// match wins:
//
//   gate     production deploys, registry publishes, store submissions,
//            releases, PR merges, workflow dispatches, force pushes, pushes to
//            the default branch, a deploy remote or a tag, remote deletes, and
//            production config changes (Vercel env, Worker secrets, remote D1).
//            The main session asks a human; a subagent is denied.
//   preview  preview deploys: a public URL, but not production. The main
//            session gets a reminder; a subagent is denied.
//   outward  routine outward actions: a feature-branch push, opening or
//            commenting on a PR or issue. Silent in the main session; a
//            subagent is denied.
//
// A command carrying --dry-run (or `git push -n`) is never classified.
//
// Usage: node deploy-classify.mjs [--cwd <dir>]   (command text on stdin)
// Prints "<tier><TAB><reason>" for the most serious match, or nothing.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { splitCommand } from "./command-segments.mjs";

const RANK = { outward: 1, preview: 2, gate: 3 };
const WRAPPERS = new Set(["env", "command", "exec", "time", "nohup", "sudo", "builtin"]);
const PROD_BRANCH = /^(main|master|prod|production|release(\/.*)?|gh-pages)$/;
const DEPLOY_REMOTES = new Set(["heroku", "dokku", "production", "prod", "live", "deploy"]);

// Quote-aware split of one segment into words, with the quotes removed.
export function words(segment) {
  const out = [];
  let cur = "";
  let started = false;
  let quote = null;
  const s = String(segment);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && i + 1 < s.length) cur += s[++i];
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; started = true; continue; }
    if (c === "\\" && i + 1 < s.length) { cur += s[++i]; started = true; continue; }
    if (/\s/.test(c)) {
      if (started) { out.push(cur); cur = ""; started = false; }
      continue;
    }
    cur += c;
    started = true;
  }
  if (started) out.push(cur);
  return out;
}

// The words a segment runs: leading VAR=value assignments and wrappers dropped.
export function argv(segment) {
  let w = words(segment);
  for (;;) {
    while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) w = w.slice(1);
    if (w.length && WRAPPERS.has(w[0])) {
      w = w.slice(1);
      while (w.length && w[0].startsWith("-")) w = w.slice(1);
      continue;
    }
    return w;
  }
}

// Positional words after an index, skipping options and the values of options
// that take one (listed per tool, `--opt=value` handled everywhere).
function positionals(w, from, valued = new Set()) {
  const out = [];
  for (let i = from; i < w.length; i++) {
    const a = w[i];
    if (a === "--") { out.push(...w.slice(i + 1)); break; }
    if (a.startsWith("-")) {
      if (!a.includes("=") && valued.has(a)) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

const has = (w, ...flags) => w.some((a) => flags.includes(a) || flags.some((f) => f.startsWith("--") && a.startsWith(`${f}=`)));
function optionValue(w, ...names) {
  for (let i = 0; i < w.length; i++) {
    for (const n of names) {
      if (w[i] === n && i + 1 < w.length) return w[i + 1];
      if (w[i].startsWith(`${n}=`)) return w[i].slice(n.length + 1);
    }
  }
  return null;
}

function defaultGitBranch(cwd) {
  const git = (...args) => {
    try { return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).trim(); } catch { return ""; }
  };
  const current = git("symbolic-ref", "--quiet", "--short", "HEAD");
  const remoteHead = git("symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD").replace(/^origin\//, "");
  return { current, defaultBranch: remoteHead };
}

function classifyGitPush(w, ctx) {
  // w starts at the word after `push`.
  if (has(w, "-n", "--dry-run")) return null;
  if (has(w, "--force", "-f", "--force-with-lease", "--force-if-includes") || w.some((a) => /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a) && !a.startsWith("--"))) {
    return ["gate", "git push --force rewrites the remote branch's history"];
  }
  if (has(w, "--tags", "--follow-tags", "--mirror", "--all")) return ["gate", "git push of tags or every ref (a tag push starts this repo's release, and an app's deploy hooks often watch tags)"];
  if (has(w, "--delete", "-d")) return ["gate", "git push --delete removes a remote branch or tag"];
  const [remote, ...refspecs] = positionals(w, 0, new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"]));
  if (remote && DEPLOY_REMOTES.has(remote)) return ["gate", `git push to the "${remote}" remote deploys whatever it receives`];
  let info = null;
  const branchInfo = () => (info ??= ctx.branch(ctx.cwd));
  const isReleaseBranch = (name) => !!name && (PROD_BRANCH.test(name) || name === branchInfo().defaultBranch);
  for (const spec of refspecs) {
    if (spec.startsWith("+")) return ["gate", "git push with a +refspec force-pushes, rewriting the remote branch's history"];
    if (spec.startsWith(":")) return ["gate", "git push :<ref> deletes a remote branch or tag"];
    const [src, dst = src] = spec.split(":");
    const target = dst.replace(/^refs\/heads\//, "");
    if (/^refs\/tags\//.test(dst) || /^v\d/.test(target)) return ["gate", `git push of the tag ${target} (tag pushes start releases)`];
    if (target === "HEAD") {
      if (isReleaseBranch(branchInfo().current)) return ["gate", `git push of HEAD while ${branchInfo().current} is checked out, the branch that deploys and releases`];
    } else if (isReleaseBranch(target)) {
      return ["gate", `git push to ${target}, the branch that deploys and releases`];
    }
  }
  if (!refspecs.length && isReleaseBranch(branchInfo().current)) return ["gate", `git push of the current branch, ${branchInfo().current}, the branch that deploys and releases`];
  return ["outward", "git push publishes commits to the remote"];
}

function classifyGit(w, ctx) {
  // Global options before the subcommand: -C <dir>, -c <cfg>, --git-dir=…, …
  let i = 1;
  while (i < w.length && w[i].startsWith("-")) {
    if (w[i] === "-C" && i + 1 < w.length) { ctx = { ...ctx, cwd: resolve(ctx.cwd, w[i + 1]) }; i += 2; continue; }
    if (w[i] === "-c" && i + 1 < w.length) { i += 2; continue; }
    i += 1;
  }
  if (w[i] === "push") return classifyGitPush(w.slice(i + 1), ctx);
  return null;
}

function classifyGh(w) {
  const [cmd, sub] = positionals(w, 1, new Set(["-R", "--repo", "--hostname"]));
  if (cmd === "release" && ["create", "edit", "delete", "upload", "delete-asset"].includes(sub)) return ["gate", `gh release ${sub} publishes or changes a GitHub release`];
  if (cmd === "pr" && sub === "merge") return ["gate", "gh pr merge lands the pull request on its base branch (a merge to main can deploy or release)"];
  if (cmd === "workflow" && sub === "run") return ["gate", "gh workflow run dispatches a GitHub Actions workflow (this repo's release workflow, or an app's deploy)"];
  if (cmd === "run" && sub === "rerun") return ["gate", "gh run rerun can re-run a deploy or release"];
  if (cmd === "repo" && sub === "delete") return ["gate", "gh repo delete removes a repository"];
  if (cmd === "repo" && sub === "edit" && has(w, "--visibility")) return ["gate", "gh repo edit --visibility changes who can see the repository"];
  if (cmd === "api") {
    const text = w.join(" ");
    const writes = /(-X|--method)\s*(POST|PUT|PATCH|DELETE)\b/i.test(text) || /\s(-f|-F|--field|--raw-field|--input)\b/.test(` ${text}`);
    if (writes && /pulls\/\d+\/merge|\/merges\b|\/dispatches\b|\/releases\b|\/deployments\b/.test(text)) return ["gate", "gh api call that merges, dispatches, releases or deploys"];
    return null;
  }
  if (["pr", "issue"].includes(cmd) && ["create", "comment", "edit", "close", "reopen", "review", "ready"].includes(sub)) return ["outward", `gh ${cmd} ${sub} posts to GitHub`];
  if (cmd === "gist" && sub === "create") return ["outward", "gh gist create publishes a gist"];
  return null;
}

// Tools a package manager can run by name from node_modules/.bin (`pnpm wrangler deploy`).
const DEPLOY_TOOLS = new Set(["vercel", "vc", "netlify", "ntl", "wrangler", "firebase", "eas", "changeset", "lerna", "gh-pages", "surge", "electron-builder", "fly", "flyctl", "railway", "amplify", "chrome-webstore-upload", "chrome-webstore-upload-cli", "cws-publish", "publish-browser-extension", "web-ext", "wxt"]);

function classifyPackageManager(w, ctx, depth) {
  const pm = toolName(w[0]);
  const valued = new Set(["--filter", "-F", "--dir", "-C", "--prefix", "--workspace", "-w", "--cwd"]);
  let rest = positionals(w, 1, valued);
  if (pm === "yarn" && rest[0] === "workspace") rest = rest.slice(2);
  const [sub, next] = rest;
  if (!sub) return null;
  // `pnpm --filter web exec vercel --prod`, `pnpm wrangler deploy`: classify the tool with its own flags.
  const at = w.indexOf(sub, 1);
  if (["exec", "dlx", "x"].includes(sub) && pm !== "npm") return classifyArgv(afterRunnerOptions(w, at + 1), ctx, depth);
  if (pm !== "npm" && DEPLOY_TOOLS.has(toolName(sub))) return classifyArgv(w.slice(at), ctx, depth);
  if (sub === "publish" || (pm === "yarn" && sub === "npm" && next === "publish")) return ["gate", `${pm} publish uploads a package to the npm registry`];
  if (["unpublish", "deprecate"].includes(sub)) return ["gate", `${pm} ${sub} changes a package that is already on the npm registry`];
  if (["dist-tag", "owner"].includes(sub) && ["add", "rm", "remove"].includes(next)) return ["gate", `${pm} ${sub} ${next} changes a published package`];
  // A script run: `pnpm release`, `pnpm run deploy:prod`, `npm run release`.
  const viaRun = sub === "run" || sub === "run-script";
  const script = viaRun ? next : sub;
  if (!script) return null;
  if (pm === "pnpm" && !viaRun && script === "deploy") return null; // the built-in `pnpm deploy <dir>` copies a package locally
  if (pm === "npm" && !viaRun) return null; // npm runs scripts only through `run`
  if (/dry/i.test(script)) return null;
  if (/^release($|:)/.test(script)) return ["gate", `the ${script} script cuts a release (in an exported design system it runs changeset publish)`];
  if (/^deploy($|:)/.test(script)) return ["gate", `the ${script} script deploys`];
  if (/^publish($|:)/.test(script)) return ["gate", `the ${script} script publishes`];
  return null;
}

const VERCEL_COMMANDS = new Set(["deploy", "dev", "build", "pull", "link", "login", "logout", "ls", "list", "inspect", "logs", "whoami", "env", "project", "projects", "teams", "switch", "help", "alias", "aliases", "domains", "dns", "certs", "secrets", "promote", "rollback", "redeploy", "remove", "rm", "init", "bisect", "git", "integration", "target", "telemetry", "blob", "cache"]);

function classifyVercel(w) {
  const tool = w[0];
  const valued = new Set(["--scope", "-S", "--token", "-t", "--cwd", "--target", "-e", "--env", "-b", "--build-env", "-m", "--meta", "-A", "--local-config", "-Q", "--global-config", "--regions"]);
  const [sub, next] = positionals(w, 1, valued);
  const prod = has(w, "--prod", "--production") || /^prod(uction)?$/.test(optionValue(w, "--target") || "");
  if (sub === "promote" || sub === "rollback") return ["gate", `${tool} ${sub} changes which deployment serves production`];
  if (sub === "alias" || sub === "aliases") return next && !["ls", "list"].includes(next) ? ["gate", `${tool} alias points a domain at a deployment`] : null;
  if (sub === "env" && ["add", "rm", "remove", "update"].includes(next)) return ["gate", `${tool} env ${next} changes the Vercel project's environment variables`];
  if (sub === "remove" || sub === "rm") return ["gate", `${tool} ${sub} deletes deployments or a project`];
  if ((sub === "domains" || sub === "dns" || sub === "certs") && next && !["ls", "list", "inspect"].includes(next)) return ["gate", `${tool} ${sub} ${next} changes a production domain`];
  if (sub === "redeploy") return prod ? ["gate", `${tool} redeploy --target production redeploys production`] : ["preview", `${tool} redeploy rebuilds a deployment at a public URL`];
  if (sub === undefined || sub === "deploy" || !VERCEL_COMMANDS.has(sub)) {
    return prod ? ["gate", `${tool} --prod deploys to production`] : ["preview", `${tool} creates a public preview deployment`];
  }
  return null;
}

function classifyNetlify(w) {
  const [sub] = positionals(w, 1, new Set(["--dir", "-d", "--site", "-s", "--auth", "--alias", "--message", "-m", "--filter", "--context"]));
  if (sub === "deploy") return has(w, "--prod", "-p", "--prod-if-unlocked") ? ["gate", "netlify deploy --prod deploys the production site"] : ["preview", "netlify deploy creates a draft deploy at a public URL"];
  if (["env:set", "env:unset", "env:import", "sites:delete"].includes(sub)) return ["gate", `netlify ${sub} changes the production site`];
  return null;
}

function classifyWrangler(w) {
  const [sub, next, third] = positionals(w, 1, new Set(["--env", "-e", "--config", "-c", "--name", "--branch", "--project-name", "--message", "--tag", "--compatibility-date"]));
  if (sub === "deploy" || sub === "publish") return ["gate", `wrangler ${sub} deploys a Worker to production`];
  if (sub === "versions" && next === "deploy") return ["gate", "wrangler versions deploy shifts production traffic"];
  if (sub === "rollback" || sub === "delete") return ["gate", `wrangler ${sub} changes the deployed Worker`];
  if (sub === "secret" && ["put", "delete", "bulk"].includes(next)) return ["gate", `wrangler secret ${next} changes a production secret`];
  if (sub === "pages" && (next === "deploy" || next === "publish")) {
    const branch = optionValue(w, "--branch");
    return branch && !PROD_BRANCH.test(branch) ? ["preview", `wrangler pages deploy --branch ${branch} creates a Pages preview`] : ["gate", "wrangler pages deploy publishes the production Pages site"];
  }
  if (sub === "d1" && ((next === "migrations" && third === "apply") || next === "execute") && has(w, "--remote")) return ["gate", "wrangler d1 --remote writes to the production database"];
  return null;
}

function classifyEas(w) {
  const [sub] = positionals(w, 1, new Set(["--platform", "-p", "--profile", "-e", "--branch", "--channel", "--message", "-m", "--id", "--path"]));
  if (sub === "submit") return ["gate", "eas submit sends a build to the App Store or Google Play"];
  if (sub === "metadata:push") return ["gate", "eas metadata:push changes the store listing"];
  if (sub === "build" && has(w, "--auto-submit", "--auto-submit-with-profile")) return ["gate", "eas build --auto-submit submits the build to the stores"];
  if (sub === "update") {
    const target = optionValue(w, "--branch", "--channel");
    if (has(w, "--auto") || (target && PROD_BRANCH.test(target))) return ["gate", `eas update publishes an over-the-air update to ${target ? `the ${target} channel` : "the current branch's channel"}, straight to installed apps`];
    return ["preview", `eas update publishes an over-the-air update${target ? ` to the ${target} channel` : ""}`];
  }
  if (sub === "deploy") return has(w, "--prod", "--production") ? ["gate", "eas deploy --prod publishes EAS Hosting production"] : ["preview", "eas deploy creates an EAS Hosting preview"];
  return null;
}

// A runner may name the package rather than its binary, with a version:
// `npx vercel@latest`, `pnpm dlx @changesets/cli publish`.
const PACKAGE_BINS = { "@changesets/cli": "changeset", "netlify-cli": "netlify", "firebase-tools": "firebase", "eas-cli": "eas", "@railway/cli": "railway", "chrome-webstore-upload-cli": "chrome-webstore-upload" };
function toolName(word) {
  const pkg = String(word).replace(/^(@?[^@]+)@[^/]*$/, "$1");
  return PACKAGE_BINS[pkg] || basename(pkg);
}

// The words after a runner's own options: `npx -y vercel` → [vercel].
function afterRunnerOptions(w, from) {
  let i = from;
  while (i < w.length && w[i].startsWith("-")) i += ["-p", "--package", "-c", "--call"].includes(w[i]) ? 2 : 1;
  return w.slice(i);
}

// The most serious deploy-shaped action in one argv, or null.
function classifyArgv(w, ctx, depth = 0) {
  if (!w.length) return null;
  if (has(w, "--dry-run", "--dryrun", "--help", "-h", "--version")) return null;
  const tool = toolName(w[0]);
  // Runners that execute another tool: npx vercel, pnpm dlx wrangler, pnpm exec changeset.
  if (["npx", "pnpx", "bunx"].includes(tool)) return classifyArgv(afterRunnerOptions(w, 1), ctx, depth);
  if (["pnpm", "yarn", "bun"].includes(tool) && ["dlx", "exec", "x"].includes(w[1])) return classifyArgv(afterRunnerOptions(w, 2), ctx, depth);
  if (tool === "npm" && w[1] === "exec") return classifyArgv(afterRunnerOptions(w, 2), ctx, depth);
  // Shells and eval: classify the command string they run.
  if (["bash", "sh", "zsh"].includes(tool) && w.includes("-c") && depth < 3) {
    const script = w[w.indexOf("-c") + 1];
    return script ? classifyCommand(script, { ...ctx, depth: depth + 1 }) : null;
  }
  if (tool === "eval" && depth < 3) return classifyCommand(w.slice(1).join(" "), { ...ctx, depth: depth + 1 });
  // Task runners and project scripts named for a release step.
  if (["make", "just", "task"].includes(tool)) {
    const target = positionals(w, 1, new Set(["-f", "-C", "--directory", "--file", "-t"])).find((t) => /^(deploy|release|publish)/.test(t));
    return target ? ["gate", `${tool} ${target} runs a deploy or release target`] : null;
  }
  if (/^(deploy|release|publish)([-_.].*)?\.sh$/.test(tool)) return ["gate", `${tool} is a deploy or release script`];
  if (tool === "bash" || tool === "sh") {
    const script = w.slice(1).find((a) => !a.startsWith("-"));
    if (script && /^(deploy|release|publish)([-_.].*)?\.sh$/.test(basename(script))) return ["gate", `${basename(script)} is a deploy or release script`];
  }

  switch (tool) {
    case "git": return classifyGit(w, ctx);
    case "gh": return classifyGh(w);
    case "npm": case "pnpm": case "yarn": case "bun": return classifyPackageManager(w, ctx, depth);
    case "changeset": return w[1] === "publish" ? ["gate", "changeset publish uploads every changed package to the npm registry"] : null;
    case "lerna": return w[1] === "publish" ? ["gate", "lerna publish uploads packages to the npm registry"] : null;
    case "vercel": case "vc": return classifyVercel(w);
    case "netlify": case "ntl": return classifyNetlify(w);
    case "wrangler": return classifyWrangler(w);
    case "firebase": {
      const [sub] = positionals(w, 1, new Set(["--project", "-P", "--only", "--except", "--message", "-m"]));
      if (sub === "deploy" || sub === "hosting:clone") return ["gate", `firebase ${sub} publishes to production`];
      if (sub === "hosting:channel:deploy") return ["preview", "firebase hosting:channel:deploy creates a preview channel"];
      return null;
    }
    case "eas": return classifyEas(w);
    case "fly": case "flyctl": {
      const [sub, next] = positionals(w, 1, new Set(["--app", "-a", "--config", "-c", "--image", "-i"]));
      if (sub === "deploy") return ["gate", `${tool} deploy ships to Fly.io`];
      if (sub === "secrets" && ["set", "unset", "import"].includes(next)) return ["gate", `${tool} secrets ${next} changes production secrets`];
      return null;
    }
    case "railway": {
      const [sub] = positionals(w, 1, new Set(["--service", "-s", "--environment", "-e"]));
      return ["up", "deploy", "redeploy"].includes(sub) ? ["gate", `railway ${sub} deploys`] : null;
    }
    case "surge": {
      const [sub] = positionals(w, 1);
      return ["login", "logout", "whoami", "list", "token", "plan", "help"].includes(sub) ? null : ["gate", "surge publishes to a public domain"];
    }
    case "gh-pages": return ["gate", "gh-pages publishes to GitHub Pages"];
    case "amplify": return ["publish", "push"].includes(w[1]) ? ["gate", `amplify ${w[1]} pushes to the cloud`] : null;
    case "heroku": return /^(releases:rollback|config:set|config:unset|apps:destroy)$/.test(w[1] || "") ? ["gate", `heroku ${w[1]} changes the production app`] : null;
    case "docker": {
      if (w[1] === "push" || (w[1] === "image" && w[2] === "push")) return ["gate", "docker push publishes an image to a registry"];
      if (w[1] === "buildx" && has(w, "--push")) return ["gate", "docker buildx --push publishes an image to a registry"];
      return null;
    }
    case "aws": {
      if (w[1] !== "s3") return null;
      const [, , ...paths] = positionals(w, 1, new Set(["--profile", "--region", "--exclude", "--include", "--acl", "--cache-control", "--content-type"]));
      const verb = w[2];
      const dest = paths[paths.length - 1] || "";
      if ((["sync", "cp", "mv"].includes(verb) && dest.startsWith("s3://")) || (["rm", "rb"].includes(verb) && paths.some((p) => p.startsWith("s3://")))) return ["gate", `aws s3 ${verb} writes to an S3 bucket (a static-site bucket serves users directly)`];
      return null;
    }
    case "electron-builder": {
      const v = optionValue(w, "--publish", "-p");
      return v && v !== "never" ? ["gate", `electron-builder --publish ${v} uploads release artifacts`] : null;
    }
    case "chrome-webstore-upload": case "chrome-webstore-upload-cli": case "cws-publish": case "publish-browser-extension":
      return ["gate", `${tool} submits the extension to a browser extension store`];
    case "web-ext": return w[1] === "sign" ? ["gate", "web-ext sign submits the extension to addons.mozilla.org"] : null;
    case "wxt": return w[1] === "submit" ? ["gate", "wxt submit sends the extension to the browser stores"] : null;
    default: return null;
  }
}

function better(a, b) {
  if (!b) return a;
  if (!a) return b;
  return RANK[b[0]] > RANK[a[0]] ? b : a;
}

// The most serious match in a whole command line, or null. ctx.cwd follows
// `cd <dir>` segments so `cd app && git push` checks app's branch.
export function classifyCommand(src, { cwd = process.cwd(), branch = defaultGitBranch, depth = 0 } = {}) {
  let segments;
  try {
    segments = splitCommand(String(src ?? ""));
  } catch {
    // Unbalanced quotes: judge a naive split rather than letting anything through.
    segments = String(src ?? "").split(/&&|\|\||[;|\n]/).map((s) => s.trim()).filter(Boolean);
  }
  let ctx = { cwd, branch, depth };
  let found = null;
  for (const seg of segments) {
    const w = argv(seg);
    if (w[0] === "cd" && w[1]) { ctx = { ...ctx, cwd: resolve(ctx.cwd, w[1]) }; continue; }
    found = better(found, classifyArgv(w, ctx, depth));
    if (found && found[0] === "gate") break;
  }
  return found;
}

function runAsScript() {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}

if (runAsScript()) {
  const i = process.argv.indexOf("--cwd");
  const cwd = i > 0 && process.argv[i + 1] ? process.argv[i + 1] : process.cwd();
  let src = "";
  try { src = readFileSync(0, "utf8"); } catch { src = ""; }
  let result = null;
  try { result = classifyCommand(src, { cwd }); } catch { result = null; }
  if (result) process.stdout.write(`${result[0]}\t${result[1]}\n`);
}
