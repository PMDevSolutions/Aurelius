import { useCallback, useEffect, useState } from "react";
import { activeManifest, getScreen } from "../../shared/product";
import type { QaArtifacts } from "../../shared/types/qa";
import { bridge } from "../api/bridge";
import { useStep } from "../hooks/useStep";
import { ArtifactImage } from "./ArtifactImage";
import { LogStream } from "./LogStream";

const QA = getScreen(activeManifest, "qa");
const DEFAULT_URL = "http://localhost:3000";
const URL_RULE = /^https?:\/\/\S+$/i;

function QaReportView({ path, title }: { path: string; title: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    bridge()
      .readQaText(path)
      .then(setText)
      .catch(() => setText(null));
  }, [path]);
  if (!text) return null;
  return (
    <div className="group">
      <h2>{title}</h2>
      <pre className="log-stream">{text}</pre>
    </div>
  );
}

export function QaPanel() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [artifacts, setArtifacts] = useState<QaArtifacts | null>(null);
  const step = useStep();

  const refresh = useCallback(() => {
    bridge()
      .getQaArtifacts()
      .then(setArtifacts)
      .catch(() => setArtifacts(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-scan the artifact directories whenever a step finishes.
  useEffect(() => {
    if (step.active && !step.busy) refresh();
  }, [step.active, step.busy, refresh]);

  const urlValid = URL_RULE.test(url.trim());

  return (
    <section className="panel">
      <header className="panel-header">
        <h1>{QA.title}</h1>
        <button type="button" onClick={refresh}>
          Refresh
        </button>
      </header>
      <p className="panel-intro">
        Run the visual-QA scripts against your running app, then review what they wrote under{" "}
        <code>.claude/visual-qa/</code>. Start the dev server first (<code>pnpm dev</code>), and
        capture baselines before running the regression diff.
      </p>

      <label className="field">
        <span>App URL</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={DEFAULT_URL}
          spellCheck={false}
        />
        {!urlValid && <span className="field-error">Enter an http(s) URL.</span>}
      </label>

      <div className="button-row">
        {QA.steps.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={step.busy || !urlValid}
            onClick={() => step.run("qa", s.id, s.label, { url: url.trim() })}
          >
            {s.cta ?? s.label}
          </button>
        ))}
      </div>

      {step.error && <div className="banner banner-error">Could not start: {step.error}</div>}

      {step.active && (
        <div className="group">
          <h2>
            {step.active.label}
            {step.busy
              ? " — running…"
              : step.state === "succeeded"
                ? " — done"
                : ` — ${step.state}`}
          </h2>
          <LogStream lines={step.lines} />
        </div>
      )}

      {artifacts && artifacts.reports.length === 0 && artifacts.galleries.length === 0 && (
        <p className="panel-intro">No QA artifacts yet — run a step above.</p>
      )}

      {artifacts?.reports.map((r) => (
        <QaReportView key={r.relPath} path={r.relPath} title={r.title} />
      ))}

      {artifacts?.galleries.map((g) => (
        <div className="group" key={g.title}>
          <h2>{g.title}</h2>
          <div className="diff-images">
            {g.images.map((img) => (
              <figure key={img}>
                <figcaption>{img.split("/").pop()}</figcaption>
                <ArtifactImage relPath={img} alt={img} />
              </figure>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
