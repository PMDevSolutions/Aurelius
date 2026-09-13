import { useState } from "react";
import { activeManifest, getScreen, getStep } from "../../shared/product";
import { bridge } from "../api/bridge";
import { usePipeline } from "../hooks/usePipeline";
import { LogStream } from "./LogStream";

const PIPELINE = getScreen(activeManifest, "pipeline");
const FIGMA = getStep(PIPELINE, "figma");
const DOC = PIPELINE.extras?.docs?.figma ?? "docs/figma-to-react/README.md";
const LINKS = PIPELINE.extras?.links ?? [];

/** figma.com/file|design|proto/<key>/… with an optional ?node-id=. */
const FIGMA_URL =
  /^https?:\/\/(www\.)?figma\.com\/(file|design|proto|board)\/[A-Za-z0-9]+(\/|$|\?)/i;

export function PipelinePanel() {
  const [figmaUrl, setFigmaUrl] = useState("");
  const { result, error, running, lines, run, cancel, reset } = usePipeline();

  const urlValid = FIGMA_URL.test(figmaUrl.trim());
  const canLaunch = urlValid && !running;

  const openDoc = (): void => {
    void bridge().openPath(DOC);
  };
  const openHelp = (relPath: string): void => {
    void bridge().openPath(relPath);
  };

  if (running) {
    return (
      <section className="panel">
        <header className="panel-header">
          <h1>Building…</h1>
          <button type="button" onClick={cancel}>
            Cancel
          </button>
        </header>
        <p className="panel-intro">
          Running <code>/build-from-figma</code> in a headless Claude Code session: intake, token
          lock, TDD, build, visual diff, E2E, quality gate, report. This takes a while.
        </p>
        <LogStream lines={lines} />
      </section>
    );
  }

  if (result) {
    return (
      <section className="panel">
        <header className="panel-header">
          <h1>{PIPELINE.title}</h1>
          <button type="button" onClick={reset}>
            New build
          </button>
        </header>
        {result.ok ? (
          <>
            <div className="banner banner-ok">
              <strong>Pipeline finished</strong>
              <span className="summary">
                Report: <code>build-report.md</code> in the project
              </span>
            </div>
            <div className="next-steps">
              <h2>Next steps</h2>
              <ol>
                <li>
                  Read the build report and the log below for anything the pipeline escalated.
                </li>
                <li>
                  Start the dev server in a terminal (<code>pnpm dev</code>) and verify it on the{" "}
                  <strong>Visual QA</strong> tab.
                </li>
              </ol>
            </div>
          </>
        ) : (
          <>
            <div className="banner banner-error">
              <strong>Pipeline failed</strong>
              <span>{result.error}</span>
            </div>
            <p className="panel-intro">
              Troubleshooting:{" "}
              <button
                type="button"
                className="link-btn"
                onClick={() => openHelp("docs/onboarding/troubleshooting.md")}
              >
                Troubleshooting FAQ
              </button>
              {" · "}
              <button type="button" className="link-btn" onClick={openDoc}>
                Figma pipeline guide
              </button>
            </p>
          </>
        )}
        <details className="raw" open={!result.ok}>
          <summary>Pipeline log</summary>
          <LogStream lines={lines} />
        </details>
      </section>
    );
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <h1>{PIPELINE.title}</h1>
      </header>
      <p className="panel-intro">
        Turn a Figma design into a working, tested app. This launches the same{" "}
        <code>/build-from-figma</code> command a terminal user would type, in a headless Claude Code
        session, and streams its progress here.
      </p>

      {error && <div className="banner banner-error">Could not start: {error}</div>}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (canLaunch) run({ kind: "figma", figmaUrl: figmaUrl.trim() });
        }}
      >
        <label className="field">
          <span>Figma file URL (Dev Mode)</span>
          <input
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            placeholder="https://www.figma.com/design/<key>/<name>?node-id=1-2"
            spellCheck={false}
          />
          {figmaUrl.trim() !== "" && !urlValid && (
            <span className="field-error">Enter a figma.com file, design, or proto URL.</span>
          )}
        </label>

        <p className="hint-note">
          Needs <strong>Figma Dev Mode</strong> (Professional plan or higher) and Claude Code with
          the Figma MCP server configured — see the pipeline guide.
        </p>

        <p className="panel-intro">
          <button type="button" className="link-btn" onClick={openDoc}>
            Figma pipeline guide →
          </button>
          {LINKS.map((l) => (
            <span key={l.url}>
              {" · "}
              <button
                type="button"
                className="link-btn"
                onClick={() => void bridge().openExternal(l.url)}
              >
                {l.label}
              </button>
            </span>
          ))}
        </p>

        <div className="form-actions">
          <button type="submit" disabled={!canLaunch}>
            {FIGMA.cta}
          </button>
        </div>
      </form>
    </section>
  );
}
