import type { ProcessEvent, ProcessRunner, RunHandle, RunSpec } from "./runner-types";

/**
 * PTY-backed runner — DEFERRED. node-pty (a native module needing @electron/rebuild)
 * is only required where a program changes behavior under a TTY: the Figma/Canva
 * `claude` live sessions and interactive flows like `aurelius login --editor`
 * (consent prompt + headed login). This stub satisfies ProcessRunner so call sites
 * and the IPC contract won't change when it's enabled. Until then, callers use
 * ChildProcessRunner.
 */
export class PtyRunner implements ProcessRunner {
  run(_spec: RunSpec, _onEvent: (event: ProcessEvent) => void): RunHandle {
    throw new Error(
      "PtyRunner is not enabled yet — node-pty is wired in with the Figma pipeline sub-issue. Use ChildProcessRunner.",
    );
  }
}
