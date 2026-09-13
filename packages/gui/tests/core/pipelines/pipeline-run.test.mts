import { test } from "node:test";
import assert from "node:assert/strict";
import { createPipelineRun } from "../../../src/core/pipelines/pipeline-run";
import { CommandBuilder } from "../../../src/core/shell/command-builder";
import { getScreen, getStep } from "../../../src/shared/product";
import { aureliusManifest } from "../../../src/shared/product/aurelius";
import type { ShellResolver } from "../../../src/core/shell/shell-resolver";
import type {
  ProcessEvent,
  ProcessResult,
  ProcessRunner,
  RunHandle,
  RunSpec,
} from "../../../src/core/process/runner-types";
import type { PipelineInput } from "../../../src/shared/types/pipeline";

const fakeShell: ShellResolver = {
  resolveBash: async () => "bash",
  resolveTool: async () => null,
};
const commands = new CommandBuilder(fakeShell);

const pipeline = getScreen(aureliusManifest, "pipeline");
const figmaCommand = getStep(pipeline, "figma").command;
const canvaCommand = getStep(pipeline, "canva").command;
const indesignCommand = getStep(pipeline, "indesign").command;

/** A ProcessRunner that records the spec it was handed, then exits with a code. */
class CaptureRunner implements ProcessRunner {
  lastSpec: RunSpec | null = null;
  constructor(private readonly code = 0) {}
  run(spec: RunSpec, onEvent: (e: ProcessEvent) => void): RunHandle {
    this.lastSpec = spec;
    let settle!: (r: ProcessResult) => void;
    const done = new Promise<ProcessResult>((resolve) => {
      settle = resolve;
    });
    queueMicrotask(() => {
      onEvent({ type: "exit", code: this.code, signal: null });
      settle({ code: this.code, signal: null });
    });
    return { pid: 1, done, cancel: () => {} };
  }
}

test("figma pipeline renders a `claude -p` spec embedding the URL and slug", async () => {
  const runner = new CaptureRunner(0);
  const input: PipelineInput = { kind: "figma", slug: "my-site", figmaUrl: "https://figma.com/x" };
  const run = await createPipelineRun({
    repoRoot: "/repo",
    input,
    runner,
    commands,
    command: figmaCommand,
  });
  run.run(() => {});
  const result = await run.result;
  assert.equal(result.ok, true);
  assert.equal(runner.lastSpec?.command, "claude");
  assert.equal(runner.lastSpec?.args[0], "-p");
  assert.match(String(runner.lastSpec?.args[1]), /https:\/\/figma\.com\/x/);
  assert.match(String(runner.lastSpec?.args[1]), /my-site/);
  assert.match(String(runner.lastSpec?.args[1]), /figma-to-wix-autonomous-workflow/);
});

test("canva pipeline renders a `claude -p` spec embedding the export dir and slug", async () => {
  const runner = new CaptureRunner(0);
  const input: PipelineInput = { kind: "canva", slug: "my-site", canvaExport: "./canva-export" };
  const run = await createPipelineRun({
    repoRoot: "/repo",
    input,
    runner,
    commands,
    command: canvaCommand,
  });
  run.run(() => {});
  await run.result;
  assert.equal(runner.lastSpec?.command, "claude");
  assert.match(String(runner.lastSpec?.args[1]), /\.\/canva-export/);
  assert.match(String(runner.lastSpec?.args[1]), /canva-to-wix-autonomous-workflow/);
});

test("indesign pipeline renders the `node bin/aurelius.mjs` CLI spec", async () => {
  const runner = new CaptureRunner(0);
  const input: PipelineInput = { kind: "indesign", slug: "broch", indesignFile: "./a.idml" };
  const run = await createPipelineRun({
    repoRoot: "/repo",
    input,
    runner,
    commands,
    command: indesignCommand,
  });
  run.run(() => {});
  await run.result;
  assert.ok(runner.lastSpec?.args[0].endsWith("aurelius.mjs"));
  assert.deepEqual(runner.lastSpec?.args.slice(1), [
    "pipeline",
    "indesign",
    "./a.idml",
    "--slug",
    "broch",
  ]);
});

test("figma rejects without a URL (before any task is created)", async () => {
  await assert.rejects(() =>
    createPipelineRun({
      repoRoot: "/repo",
      input: { kind: "figma", slug: "s" },
      runner: new CaptureRunner(0),
      commands,
      command: figmaCommand,
    }),
  );
});

test("canva rejects without an export directory", async () => {
  await assert.rejects(() =>
    createPipelineRun({
      repoRoot: "/repo",
      input: { kind: "canva", slug: "s" },
      runner: new CaptureRunner(0),
      commands,
      command: canvaCommand,
    }),
  );
});

test("indesign rejects without a file", async () => {
  await assert.rejects(() =>
    createPipelineRun({
      repoRoot: "/repo",
      input: { kind: "indesign", slug: "s" },
      runner: new CaptureRunner(0),
      commands,
      command: indesignCommand,
    }),
  );
});
