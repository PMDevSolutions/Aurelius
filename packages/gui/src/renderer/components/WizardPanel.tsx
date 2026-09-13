import { useEffect, useState, type FormEvent } from "react";
import type { InitInput, SiteMode } from "../../shared/types/init";
import { bridge } from "../api/bridge";
import { useInit } from "../hooks/useInit";
import { LogStream } from "./LogStream";

const DEFAULT_INPUT: InitInput = {
  name: "",
  title: "",
  apiKey: "",
  accountId: "",
  siteMode: "skip",
  siteId: "",
  git: true,
};

const SITE_MODES: { value: SiteMode; label: string }[] = [
  { value: "skip", label: "Not yet — record the steps in docs/NEXT-STEPS.md" },
  { value: "create", label: "Create a new Wix Studio site (needs API key + account id)" },
  { value: "connect", label: "Connect an existing site by id" },
];

export function WizardPanel() {
  const [input, setInput] = useState<InitInput>(DEFAULT_INPUT);
  const { result, error, running, lines, run, reset } = useInit();

  useEffect(() => {
    bridge()
      .getProject()
      .then((p) => {
        if (!p.valid) return;
        const base = p.root.split(/[\\/]/).pop() ?? "";
        setInput((prev) => (prev.name ? prev : { ...prev, name: base }));
      })
      .catch(() => {});
  }, []);

  function update<K extends keyof InitInput>(key: K, value: InitInput[K]): void {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  const hasCreds = input.apiKey.trim() !== "" && input.accountId.trim() !== "";
  const canSubmit =
    input.name.trim() !== "" &&
    (input.siteMode !== "connect" || input.siteId.trim() !== "") &&
    (input.siteMode !== "create" || hasCreds) &&
    !running;

  function submit(e: FormEvent): void {
    e.preventDefault();
    run(input);
  }

  if (result) {
    return (
      <section className="panel">
        <header className="panel-header">
          <h1>Setup wizard</h1>
          <button type="button" onClick={reset}>
            Start over
          </button>
        </header>
        {result.ok ? (
          <>
            <div className="banner banner-ok">
              <strong>Project ready: {result.projectName}</strong>
              <span className="summary">
                Site title: {result.siteTitle}
                {result.siteMode === "connect" && result.siteId
                  ? ` · Connected to ${result.siteId}`
                  : result.siteMode === "create"
                    ? " · Site provisioning requested"
                    : " · No site yet"}
              </span>
            </div>
            <div className="next-steps">
              <h2>Next steps</h2>
              <ol>
                <li>
                  Open the <strong>Wix site</strong> tab to check the connection
                  {result.siteMode === "skip" && (
                    <>
                      {" "}
                      (the exact commands were written to <code>docs/NEXT-STEPS.md</code>)
                    </>
                  )}
                  .
                </li>
                <li>
                  Convert a design from the <strong>Convert design</strong> tab — it compiles a
                  BuildPlan under <code>.aurelius/plans/</code>.
                </li>
                <li>
                  Apply the plan and publish from the <strong>Wix site</strong> tab.
                </li>
              </ol>
            </div>
          </>
        ) : (
          <div className="banner banner-error">
            <strong>Setup failed</strong>
            <span>{result.error}</span>
          </div>
        )}
        <details className="raw" open={!result.ok}>
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
          <h1>Setting up…</h1>
        </header>
        <p className="panel-intro">
          Running project setup — the same code path as <code>pnpm run init</code>.
        </p>
        <LogStream lines={lines} />
      </section>
    );
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <h1>Setup wizard</h1>
      </header>
      <p className="panel-intro">
        Configure the project the same way <code>pnpm run init</code> does — this calls the
        wizard&rsquo;s <code>apply()</code> directly, so the GUI and CLI stay in lockstep. It writes
        the Wix credentials into <code>.env</code>, optionally provisions or connects the target
        Studio site, and verifies the result.
      </p>

      {error && <div className="banner banner-error">Could not start setup: {error}</div>}

      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Project slug</span>
          <input
            value={input.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="my-site"
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span>
            Site title <em>(optional)</em>
          </span>
          <input
            value={input.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="My Site"
          />
        </label>

        <label className="field">
          <span>
            Wix API key <em>(optional — dry-run works without it)</em>
          </span>
          <input
            type="password"
            value={input.apiKey}
            onChange={(e) => update("apiKey", e.target.value)}
            placeholder="account-level key from manage.wix.com/account/api-keys"
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span>
            Wix account id <em>(optional)</em>
          </span>
          <input
            value={input.accountId}
            onChange={(e) => update("accountId", e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span>Target Wix site</span>
          <select
            value={input.siteMode}
            onChange={(e) => update("siteMode", e.target.value as SiteMode)}
          >
            {SITE_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        {input.siteMode === "connect" && (
          <label className="field">
            <span>Site id</span>
            <input
              value={input.siteId}
              onChange={(e) => update("siteId", e.target.value)}
              placeholder="site GUID (aurelius site list shows them)"
              spellCheck={false}
            />
          </label>
        )}

        {input.siteMode === "create" && !hasCreds && (
          <p className="hint-note">
            Creating a site calls the Wix API, so it needs both the API key and the account id
            above.
          </p>
        )}

        <label className="field-check">
          <input
            type="checkbox"
            checked={input.git}
            onChange={(e) => update("git", e.target.checked)}
          />
          <span>Initialize a git repository</span>
        </label>

        <p className="hint-note">
          Editor automation (the consent-gated browser plane) is <em>not</em> enabled here — when
          you need it, run <code>pnpm aurelius login --editor</code> in a terminal.
        </p>

        <div className="form-actions">
          <button type="submit" disabled={!canSubmit}>
            Run setup
          </button>
        </div>
      </form>
    </section>
  );
}
