// Packaged-build smoke test: launch the built Electron app and assert it boots to
// the shell and reaches a usable view (the Prerequisites/setup view or the project
// gate). Requires `electron-vite build` to have produced out/ first.
//
// Run: pnpm --filter @aurelius/gui build && pnpm --filter @aurelius/gui smoke
// In headless CI (Linux), wrap with `xvfb-run`.
import { _electron as electron } from "playwright";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";

const mainPath = fileURLToPath(new URL("../../out/main/index.js", import.meta.url));

// Editor-hosted shells export ELECTRON_RUN_AS_NODE=1, which turns the Electron
// binary into plain Node (no `app` API) — never let the launched app inherit it.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => k !== "ELECTRON_RUN_AS_NODE"),
);

const app = await electron.launch({ args: [mainPath], env });
try {
  const win = await app.firstWindow();
  await win.waitForLoadState("domcontentloaded");

  // The shell always renders the "Aurelius" brand; content is either the default
  // Prerequisites view (when a project is found) or the "Open a Aurelius project" gate.
  await win.waitForSelector(".brand", { timeout: 30_000 });
  const brand = ((await win.textContent(".brand")) ?? "").trim();
  assert.equal(brand, "Aurelius", "app shell (brand) did not render");

  const body = (await win.textContent("body")) ?? "";
  assert.ok(
    /Prerequisites|Aurelius project/.test(body),
    "expected the setup view (Prerequisites) or the project gate",
  );

  console.log("smoke: GUI launched and reached the setup view");
} finally {
  await app.close();
}
