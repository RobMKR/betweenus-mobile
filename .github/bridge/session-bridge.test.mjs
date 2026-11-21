import { test } from "node:test";
import assert from "node:assert/strict";
import {
  input,
  preflight,
  identity,
  publish,
  github,
} from "./session-bridge.mjs";
const sha = "a".repeat(40),
  repository = "RobMKR/betweenus-api";
const repo = { default_branch: "main", owner: { login: "RobMKR" } };
const env = {
  GH_REPOSITORY: repository,
  GH_REF: "refs/heads/main",
  GH_SHA: sha,
  GH_EVENT_NAME: "workflow_dispatch",
  GH_ACTOR: "RobMKR",
  GH_TRIGGERING_ACTOR: "RobMKR",
};
const create = {
  action: "create-pr",
  branch: "feat/issue-2",
  sha,
  issue: "2",
  title: "Change",
  body: "Actual session work",
};
const review = {
  action: "review",
  pr: "3",
  sha,
  verdict: "APPROVE",
  body: "Independent review of exact head, no findings; CI checked.",
};
function fixture(change = {}) {
  const calls = [];
  const pr = {
    state: "open",
    draft: false,
    number: 3,
    head: { repo: { full_name: repository }, ref: "feat/issue-2", sha },
    base: { repo: { full_name: repository }, ref: "main" },
  };
  const data = {
    pr,
    head: sha,
    issue: { state: "open" },
    existing: [],
    files: [],
    reviews: [],
    runs: [
      {
        id: 1,
        head_sha: sha,
        event: "pull_request",
        head_repository: { full_name: repository },
        status: "completed",
        conclusion: "success",
      },
    ],
    ...change,
  };
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === "POST") return { ...data.pr, number: 3 };
    if (path.endsWith("/permission"))
      return { permission: data.permission ?? "admin" };
    if (path.includes("/git/ref/heads/")) return { object: { sha: data.head } };
    if (path.endsWith("/issues/2")) return data.issue;
    if (path.includes("/pulls?")) return data.existing;
    if (path.includes("/files?")) return data.files;
    if (path.includes("/reviews?")) return data.reviews;
    if (path.includes("/actions/workflows/"))
      return { workflow_runs: data.runs };
    if (path.endsWith("/pulls/3")) return data.pr;
    if (path.includes("/installation/repositories"))
      return { total_count: 1, repositories: [{ full_name: repository }] };
    if (path === `/repos/${repository}`) return repo;
    throw Error("Unexpected mock path " + path);
  };
  return { api, calls, data };
}
test("input rejects partial SHA, ref tricks, empty review and invalid verdict", () => {
  assert.equal(input(create).sha, sha);
  for (const patch of [
    { sha: "abc" },
    { branch: "../main" },
    { branch: "a//b" },
    { branch: "a.lock" },
    { branch: "a\nmain" },
    { title: "a\nb" },
    { issue: "2;echo secret" },
  ])
    assert.throws(() => input({ ...create, ...patch }));
  for (const patch of [{ body: "" }, { verdict: "MERGE" }, { pr: "-1" }])
    assert.throws(() => input({ ...review, ...patch }));
});
test("only latest default workflow and maintainers including rerun actor pass", async () => {
  await preflight(env, fixture().api);
  await preflight(env, async (m, p, b) =>
    p.endsWith("/permission")
      ? { permission: "write", role_name: "maintain" }
      : fixture().api(m, p, b),
  );
  for (const patch of [
    { GH_REF: "refs/heads/evil" },
    { GH_EVENT_NAME: "pull_request" },
    { GH_SHA: "b".repeat(40) },
    { GH_TRIGGERING_ACTOR: "" },
  ])
    await assert.rejects(preflight({ ...env, ...patch }, fixture().api));
  await assert.rejects(preflight(env, fixture({ permission: "write" }).api));
  const f = fixture();
  const api = async (m, p, b) =>
    p.includes("/collaborators/Other/")
      ? { permission: "read" }
      : f.api(m, p, b);
  await assert.rejects(
    preflight({ ...env, GH_TRIGGERING_ACTOR: "Other" }, api),
  );
});
test("App identity and exact single-repository scope are checked", async () => {
  const good = {
    ...env,
    WORKER_APP_ID: "5864822",
    WORKER_SLUG: "robmkr-agent-worker",
    WORKER_INSTALLATION: "123",
  };
  await identity("worker", good, fixture().api);
  await assert.rejects(
    identity("worker", { ...good, WORKER_SLUG: "imposter" }, fixture().api),
  );
  await assert.rejects(
    identity("worker", good, async () => ({
      total_count: 2,
      repositories: [{ full_name: repository }],
    })),
  );
});
test("worker publishes JSON text and reuses matching open PR without duplicate", async () => {
  const f = fixture();
  await publish(create, env, repo, f.api);
  assert.equal(
    f.calls.find((c) => c.method === "POST").body.body,
    create.body + "\n\nCloses #2.",
  );
  const old = fixture({ existing: [{ number: 3 }] });
  await publish(create, env, repo, old.api);
  assert.equal(old.calls.filter((c) => c.method === "POST").length, 0);
});
test("worker blocks default, stale heads, nonissues and closed issues before writes", async () => {
  for (const [i, data] of [
    [{ ...create, branch: "main" }, {}],
    [create, { head: "b".repeat(40) }],
    [create, { issue: { state: "open", pull_request: {} } }],
    [create, { issue: { state: "closed" } }],
  ]) {
    const f = fixture(data);
    await assert.rejects(publish(i, env, repo, f.api));
    assert.equal(f.calls.filter((c) => c.method === "POST").length, 0);
  }
});
test("review rejects fork/draft/stale/default-base mismatch before posting", async () => {
  for (const patch of [
    { head: { repo: { full_name: "fork/repo" }, sha } },
    { head: { repo: { full_name: repository }, sha: "b".repeat(40) } },
    { draft: true },
    { base: { repo: { full_name: repository }, ref: "other" } },
  ]) {
    const f = fixture();
    f.data.pr = { ...f.data.pr, ...patch };
    await assert.rejects(publish(review, env, repo, f.api));
    assert.equal(f.calls.filter((c) => c.method === "POST").length, 0);
  }
});
test("approval requires nonempty exact-head successful CI and all observed attempts", async () => {
  for (const runs of [
    [],
    [{ head_sha: "b".repeat(40) }],
    fixture().data.runs.map((r) => ({ ...r, conclusion: "failure" })),
    [
      ...fixture().data.runs,
      {
        ...fixture().data.runs[0],
        id: 2,
        status: "in_progress",
        conclusion: null,
      },
    ],
  ]) {
    const f = fixture({ runs });
    await assert.rejects(publish(review, env, repo, f.api));
    assert.equal(f.calls.filter((c) => c.method === "POST").length, 0);
  }
});
test("renamed protected workflow/bridge/deploy files also forbid bot approval", async () => {
  for (const files of [
    [{ filename: ".github/workflows/new.yml" }],
    [{ filename: "notes.txt", previous_filename: ".github/workflows/old.yml" }],
    [{ filename: "notes.txt", previous_filename: ".github/bridge/script.mjs" }],
    [{ filename: "deploy/script.sh" }],
    [{ filename: "Dockerfile" }],
    [{ filename: "notes.txt", previous_filename: "compose.yaml" }],
    [{ filename: "eas.json" }],
  ])
    await assert.rejects(publish(review, env, repo, fixture({ files }).api));
});
test("real supplied review binds commit and duplicates are skipped; dismissed is not approval", async () => {
  const f = fixture();
  await publish(review, env, repo, f.api);
  const posted = f.calls.find((c) => c.method === "POST").body;
  assert.equal(posted.commit_id, sha);
  assert.equal(posted.event, "APPROVE");
  assert.ok(posted.body.startsWith(review.body));
  const r = {
    user: { login: "robmkr-agent-reviewer[bot]" },
    commit_id: sha,
    state: "APPROVED",
    body: posted.body,
  };
  const again = fixture({ reviews: [r] });
  await publish(review, env, repo, again.api);
  assert.equal(again.calls.filter((c) => c.method === "POST").length, 0);
  const dismissed = fixture({ reviews: [{ ...r, state: "DISMISSED" }] });
  await publish(review, env, repo, dismissed.api);
  assert.equal(dismissed.calls.filter((c) => c.method === "POST").length, 1);
});
test("comment/change requests do not fabricate a successful CI requirement", async () => {
  for (const verdict of ["COMMENT", "REQUEST_CHANGES"]) {
    const f = fixture({ runs: [] });
    await publish({ ...review, verdict }, env, repo, f.api);
    assert.equal(f.calls.find((c) => c.method === "POST").body.event, verdict);
  }
});
test("head is checked again immediately before posting", async () => {
  const f = fixture();
  let reads = 0;
  const api = async (m, p, b) => {
    if (p.endsWith("/pulls/3") && ++reads === 2)
      return { ...f.data.pr, head: { ...f.data.pr.head, sha: "b".repeat(40) } };
    return f.api(m, p, b);
  };
  await assert.rejects(publish(review, env, repo, api));
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 0);
});
test("HTTP failures never echo token or response content", async () => {
  const api = github("PRIVATE_TOKEN", async () => ({ ok: false, status: 403 }));
  await assert.rejects(
    api("GET", "/test"),
    (e) => !e.message.includes("PRIVATE_TOKEN") && e.message.includes("403"),
  );
});

test("create endpoint head race fails rather than claiming expected-head success", async () => {
  const f = fixture();
  const api = async (m, p, b) =>
    m === "POST"
      ? { number: 3, head: { sha: "b".repeat(40) } }
      : f.api(m, p, b);
  await assert.rejects(
    publish(create, env, repo, api),
    /Created PR head changed/,
  );
});
