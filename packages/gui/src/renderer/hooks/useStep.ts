import { useCallback, useState } from "react";
import type { ScreenId } from "../../shared/product/manifest";
import { bridge } from "../api/bridge";
import { useTaskStream } from "./useTaskStream";

export interface StepController {
  /** The step currently (or last) run on this screen. */
  active: { taskId: string; label: string } | null;
  lines: string[];
  state: ReturnType<typeof useTaskStream>["state"];
  /** True while a step is running. */
  busy: boolean;
  error: string | null;
  run: (screenId: ScreenId, stepId: string, label: string, vars?: Record<string, string>) => void;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Drives any script-backed manifest step (QA scripts, the Playwright installer) via runStep. */
export function useStep(): StepController {
  const [active, setActive] = useState<{ taskId: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stream = useTaskStream(active?.taskId ?? null);

  const run = useCallback(
    (screenId: ScreenId, stepId: string, label: string, vars?: Record<string, string>) => {
      setError(null);
      bridge()
        .runStep(screenId, stepId, vars)
        .then(({ taskId }) => setActive({ taskId, label }))
        .catch((e) => setError(message(e)));
    },
    [],
  );

  const terminal =
    stream.state === "succeeded" || stream.state === "failed" || stream.state === "cancelled";
  const busy = active !== null && !terminal;

  return { active, lines: stream.lines, state: stream.state, busy, error, run };
}
