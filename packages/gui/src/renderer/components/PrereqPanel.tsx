import { useEffect } from "react";
import { activeManifest, getScreen, getStep } from "../../shared/product";
import type { PrereqGroup, PrereqReport } from "../../shared/types/prerequisites";
import { usePrerequisites } from "../hooks/usePrerequisites";
import { useStep } from "../hooks/useStep";
import { LogStream } from "./LogStream";
import { PrereqItemRow } from "./PrereqItemRow";

const GROUP_TITLES: Record<PrereqGroup, string> = {
  "required-software": "Required software",
  "required-accounts": "Required accounts",
  "optional-software": "Optional software",
  "system-requirements": "System requirements",
  unknown: "Other",
};

const PLAYWRIGHT = getStep(getScreen(activeManifest, "prereq"), "playwright");

const GROUP_ORDER: PrereqGroup[] = [
  "required-software",
  "required-accounts",
  "optional-software",
  "system-requirements",
  "unknown",
];

function ReadyBanner({ report }: { report: PrereqReport }) {
  const s = report.summary;
  return (
    <div className={`banner ${report.ready ? "banner-ok" : "banner-warn"}`}>
      <strong>
        Ready to use {activeManifest.displayName}: {report.ready ? "YES" : "NO"}
      </strong>
      <span className="summary">
        Required {s.requiredPassed}/{s.requiredTotal} · Optional {s.optionalInstalled}/
        {s.optionalTotal} · System {s.systemPassed}/{s.systemTotal}
      </span>
    </div>
  );
}

export function PrereqPanel() {
  const { report, error, running, lines, run } = usePrerequisites();
  const installer = useStep();

  useEffect(() => {
    run();
  }, [run]);

  useEffect(() => {
    // Re-check once the installer finishes so the Playwright row updates.
    if (installer.active && !installer.busy) run();
  }, [installer.active, installer.busy, run]);

  return (
    <section className="panel">
      <header className="panel-header">
        <h1>Prerequisites</h1>
        <button type="button" onClick={run} disabled={running}>
          {running ? "Checking…" : "Re-check"}
        </button>
      </header>

      <p className="panel-intro">
        Verifies the tools {activeManifest.displayName} needs (Git, Node 22.12+, pnpm 9+, Claude
        Code, plus optional GitHub CLI, jq and the Playwright browsers) by running the repo&rsquo;s{" "}
        <code>check-prerequisites.sh</code> and showing the result here.
      </p>

      {error && <div className="banner banner-error">Could not run the check: {error}</div>}

      {report && <ReadyBanner report={report} />}

      {running && !report && <LogStream lines={lines} />}

      {report &&
        GROUP_ORDER.map((group) => {
          const items = report.items.filter((i) => i.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="group">
              <h2>{GROUP_TITLES[group]}</h2>
              <ul className="prereq-list">
                {items.map((item, idx) => (
                  <PrereqItemRow key={`${group}-${idx}`} item={item} />
                ))}
              </ul>
            </div>
          );
        })}

      {report && (
        <div className="group">
          <h2>Playwright browsers</h2>
          <p className="panel-intro">
            Cross-browser and visual-QA scripts need the Playwright browser engines. This runs{" "}
            <code>scripts/setup-playwright.sh</code>.
          </p>
          <div className="button-row">
            <button
              type="button"
              disabled={installer.busy || running}
              onClick={() => installer.run("prereq", PLAYWRIGHT.id, PLAYWRIGHT.label)}
            >
              {installer.busy ? "Installing…" : PLAYWRIGHT.cta}
            </button>
          </div>
          {installer.error && <div className="banner banner-error">{installer.error}</div>}
          {installer.active && <LogStream lines={installer.lines} />}
        </div>
      )}

      {report && (
        <details className="raw">
          <summary>Raw output</summary>
          <pre className="log-stream">{report.raw}</pre>
        </details>
      )}
    </section>
  );
}
