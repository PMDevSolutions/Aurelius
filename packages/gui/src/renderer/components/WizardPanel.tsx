import { useState, type FormEvent } from "react";
import { activeManifest, getScreen } from "../../shared/product";
import type { InitInput } from "../../shared/types/init";
import { useInit } from "../hooks/useInit";
import { LogStream } from "./LogStream";

const WIZARD = getScreen(activeManifest, "wizard");
const FRAMEWORKS = WIZARD.extras?.frameworks ?? [];
const NAME_RULE = /^[a-z0-9-]+$/;

const DEFAULT_INPUT: InitInput = {
  name: "",
  renderer: FRAMEWORKS[0]?.id ?? "vite",
  preview: false,
};

export function WizardPanel() {
  const [input, setInput] = useState<InitInput>(DEFAULT_INPUT);
  const { result, error, running, lines, run, reset } = useInit();

  function update<K extends keyof InitInput>(key: K, value: InitInput[K]): void {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  const name = input.name.trim();
  const nameValid = NAME_RULE.test(name);
  const canSubmit = nameValid && !running;

  function submit(e: FormEvent): void {
    e.preventDefault();
    if (canSubmit) run({ ...input, name });
  }

  if (result) {
    const label = FRAMEWORKS.find((f) => f.id === result.renderer)?.label ?? result.renderer;
    return (
      <section className="panel">
        <header className="panel-header">
          <h1>{WIZARD.title}</h1>
          <button type="button" onClick={reset}>
            Start over
          </button>
        </header>
        {result.ok ? (
          <>
            <div className="banner banner-ok">
              <strong>
                {result.preview ? "Preview complete" : `Project created: ${result.projectName}`}
              </strong>
              <span className="summary">{label}</span>
            </div>
            {!result.preview && (
              <div className="next-steps">
                <h2>Next steps</h2>
                <ol>
                  <li>
                    In a terminal: <code>cd {result.projectName} && pnpm install && pnpm dev</code>
                  </li>
                  <li>
                    Build the app from a design on the <strong>Build from Figma</strong> tab.
                  </li>
                  <li>
                    Verify it on the <strong>Visual QA</strong> tab while the dev server runs.
                  </li>
                </ol>
              </div>
            )}
          </>
        ) : (
          <div className="banner banner-error">
            <strong>Setup failed</strong>
            <span>{result.error}</span>
          </div>
        )}
        <details className="raw" open={!result.ok || result.preview}>
          <summary>Setup log</summary>
          <LogStream lines={lines} />
        </details>
      </section>
    );
  }

  if (running) {
    return (
      <section className="panel">
        <header className="panel-header">
          <h1>{input.preview ? "Previewing…" : "Creating project…"}</h1>
        </header>
        <p className="panel-intro">
          Running <code>scripts/setup-project.sh</code> — the same script as the CLI.
        </p>
        <LogStream lines={lines} />
      </section>
    );
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <h1>{WIZARD.title}</h1>
      </header>
      <p className="panel-intro">
        Scaffold a new app the same way <code>./scripts/setup-project.sh</code> does: pick a name
        and a framework, and the project is created next to this checkout&rsquo;s{" "}
        <code>scripts/</code> folder with the shared Aurelius configs.
      </p>

      {error && <div className="banner banner-error">Could not start setup: {error}</div>}

      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Project name</span>
          <input
            value={input.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="my-app"
            spellCheck={false}
          />
          {input.name.trim() !== "" && !nameValid && (
            <span className="field-error">Lowercase letters, numbers, and hyphens only.</span>
          )}
        </label>

        <div className="field">
          <span>Framework</span>
          {FRAMEWORKS.map((f) => (
            <label key={f.id} className="field-check">
              <input
                type="radio"
                name="renderer"
                value={f.id}
                checked={input.renderer === f.id}
                onChange={() => update("renderer", f.id)}
              />
              <span>{f.label}</span>
            </label>
          ))}
        </div>

        <label className="field-check">
          <input
            type="checkbox"
            checked={input.preview}
            onChange={(e) => update("preview", e.target.checked)}
          />
          <span>Preview only (dry run — print the plan, create nothing)</span>
        </label>

        <div className="form-actions">
          <button type="submit" disabled={!canSubmit}>
            {input.preview ? "Preview" : (WIZARD.steps[0]?.cta ?? "Create project")}
          </button>
        </div>
      </form>
    </section>
  );
}
