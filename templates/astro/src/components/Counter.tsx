import { useState } from "react";

export interface CounterProps {
  /** Starting value for the counter. */
  initial?: number;
  /** Accessible label for the increment control. */
  label?: string;
}

/**
 * Interactive React island. Hydrated on the page via a `client:*` directive
 * (e.g. `client:load` above the fold, `client:visible` below it). Tested with
 * Vitest + @testing-library/react, exactly like the Vite/Next React path.
 */
export default function Counter({ initial = 0, label = "Increment" }: CounterProps) {
  const [count, setCount] = useState(initial);

  return (
    <div className="inline-flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-2">
      <span className="tabular-nums text-slate-900" aria-live="polite">
        {count}
      </span>
      <button
        type="button"
        className="rounded-md bg-slate-900 px-3 py-1 text-sm font-medium text-white"
        onClick={() => setCount((c) => c + 1)}
      >
        {label}
      </button>
    </div>
  );
}
