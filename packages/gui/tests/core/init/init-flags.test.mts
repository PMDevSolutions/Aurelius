import { test } from "node:test";
import assert from "node:assert/strict";
import { toInitFlags } from "../../../src/core/init/init-flags";
import type { InitInput } from "../../../src/shared/types/init";

const base: InitInput = {
  name: "my-site",
  title: "",
  apiKey: "",
  accountId: "",
  siteMode: "skip",
  siteId: "",
  git: true,
};

test("maps a minimal skip-mode input to CLI flags", () => {
  const f = toInitFlags(base);
  assert.equal(f.name, "my-site");
  assert.equal(f.title, undefined); // empty → undefined (resolver derives)
  assert.equal(f.apiKey, undefined);
  assert.equal(f.accountId, undefined);
  assert.equal(f.siteId, undefined); // skip mode → neither site flag
  assert.equal(f.createSite, false);
  assert.equal(f.noGit, false); // git:true → noGit:false
});

test("connect mode passes the site id and never sets createSite", () => {
  const f = toInitFlags({ ...base, siteMode: "connect", siteId: "  abc-123  " });
  assert.equal(f.siteId, "abc-123"); // trimmed
  assert.equal(f.createSite, false);
});

test("create mode sets createSite and suppresses siteId (the flags are exclusive)", () => {
  const f = toInitFlags({
    ...base,
    siteMode: "create",
    siteId: "stale-value-from-a-previous-toggle",
    apiKey: " key ",
    accountId: " acct ",
  });
  assert.equal(f.createSite, true);
  assert.equal(f.siteId, undefined); // never both — the resolver rejects the pair
  assert.equal(f.apiKey, "key");
  assert.equal(f.accountId, "acct");
});

test("git:false → noGit:true; title passes through trimmed", () => {
  const f = toInitFlags({ ...base, git: false, title: "My Site" });
  assert.equal(f.noGit, true);
  assert.equal(f.title, "My Site");
});
