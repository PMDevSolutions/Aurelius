import type { ScreenId } from "../product/manifest";
import type { InitInput, InitResult } from "./init";
import type { PipelineInput, PipelineResult } from "./pipeline";
import type { PrereqReport } from "./prerequisites";
import type { QaArtifacts } from "./qa";
import type { ProjectRef } from "./project";
import type { TaskEvent, TaskSnapshot } from "./task";

/** Payload carried on the main → renderer push channel for task output. */
export interface TaskEventEnvelope {
  taskId: string;
  event: TaskEvent;
}

/**
 * The typed surface exposed to the renderer as `window.aurelius` (via contextBridge).
 * This is the ONLY way the renderer talks to main — it can invoke these named,
 * typed operations and nothing else (no arbitrary command execution).
 *
 * Extension model: add one typed method here + a matching
 * ipcMain.handle, and (optionally) a new TaskKind. The generic task methods
 * (onTaskEvent / getTaskSnapshot / cancelTask) already work for any task.
 */
export interface AureliusBridge {
  /** The current project root + validity. */
  getProject(): Promise<ProjectRef>;

  /** Open a native folder picker to choose the Aurelius project; persists the choice. */
  selectProject(): Promise<ProjectRef>;

  /** Native folder picker; returns the chosen absolute path, or null if cancelled. */
  selectDirectory(): Promise<string | null>;

  /** Native file picker filtered to the given extensions; returns path, or null. */
  selectFile(extensions: string[]): Promise<string | null>;

  /** Start a prerequisite check; returns the task id to subscribe to. */
  runPrereqCheck(): Promise<{ taskId: string }>;

  /** Fetch the parsed report once the prereq task reaches a terminal state. */
  getPrereqResult(taskId: string): Promise<PrereqReport>;

  /** Run project setup (the init wizard); returns the task id to subscribe to. */
  runInit(input: InitInput): Promise<{ taskId: string }>;

  /** Fetch the init outcome once the init task reaches a terminal state. */
  getInitResult(taskId: string): Promise<InitResult>;

  /** Run any manifest step by screen/step id with runtime vars; returns a task id.
   *  Used for script-backed buttons (QA scripts, the Playwright installer). */
  runStep(
    screenId: ScreenId,
    stepId: string,
    vars?: Record<string, string>,
  ): Promise<{ taskId: string }>;

  /** Launch the Figma-to-app pipeline; returns a task id. */
  runPipeline(input: PipelineInput): Promise<{ taskId: string }>;

  /** Fetch the conversion outcome once the pipeline task reaches a terminal state. */
  getPipelineResult(taskId: string): Promise<PipelineResult>;

  /** Discover the QA artifacts currently on disk. */
  getQaArtifacts(): Promise<QaArtifacts>;

  /** Read a QA PNG as a data URL (sandboxed to artifact dirs), or null. */
  readQaImage(relPath: string): Promise<string | null>;

  /** Read a QA text/markdown artifact (sandboxed), or null. */
  readQaText(relPath: string): Promise<string | null>;

  /** Open an http(s) URL in the user's default browser. */
  openExternal(url: string): Promise<void>;

  /** Open a project-relative doc (e.g. a troubleshooting .md) in the OS default app.
   *  Returns '' on success or an error message. */
  openPath(relPath: string): Promise<string>;

  /** Snapshot any task (state + bounded log tail). */
  getTaskSnapshot(taskId: string): Promise<TaskSnapshot | null>;

  /** Request cancellation of a running task. */
  cancelTask(taskId: string): Promise<void>;

  /** Subscribe to a task's streamed events. Returns an unsubscribe disposer. */
  onTaskEvent(taskId: string, cb: (event: TaskEvent) => void): () => void;
}
