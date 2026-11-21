// Trusted-default-branch publishing only. Never evaluates supplied text or branch code.
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export const APPS = {
  worker: { id: "5864822", slug: "robmkr-agent-worker" },
  reviewer: { id: "5864865", slug: "robmkr-agent-reviewer" },
};
const fail = (message) => {
  throw new Error(message);
};
export function input(raw) {
  const i = { ...raw };
  if (!["auth-check", "create-pr", "review"].includes(i.action))
    fail("Invalid action.");
  const text = (key, max) => {
    if (
      typeof i[key] !== "string" ||
      !i[key].trim() ||
      i[key].length > max ||
      i[key].includes("\0")
    )
      fail(`Invalid ${key}.`);
  };
  const number = (key) => {
    if (!/^[1-9]\d{0,8}$/.test(String(i[key] ?? ""))) fail(`Invalid ${key}.`);
  };
  if (i.action !== "auth-check" && !/^[a-f0-9]{40}$/.test(i.sha ?? ""))
    fail("Expected full lowercase commit SHA.");
  if (i.action === "create-pr") {
    text("branch", 200);
    text("title", 200);
    text("body", 20000);
    number("issue");
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(i.branch) ||
      i.branch.includes("..") ||
      i.branch.includes("//") ||
      i.branch
        .split("/")
        .some(
          (p) =>
            !p || p.startsWith(".") || p.endsWith(".") || p.endsWith(".lock"),
        ) ||
      /[\r\n]/.test(i.title)
    )
      fail("Invalid branch/title.");
  }
  if (i.action === "review") {
    number("pr");
    text("body", 20000);
    if (!["APPROVE", "REQUEST_CHANGES", "COMMENT"].includes(i.verdict))
      fail("Invalid verdict.");
  }
  return i;
}
export function github(token, fetcher = fetch) {
  return async (method, path, body) => {
    const response = await fetcher(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok)
      fail(
        `GitHub request failed (${response.status}); inspect permissions privately.`,
      );
    return response.status === 204 ? null : response.json();
  };
}
export async function pages(api, path) {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const data = await api(
      "GET",
      `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
    );
    all.push(...data);
    if (data.length < 100) return all;
  }
  fail("Too many results; narrow the operation manually.");
}
export async function preflight(env, api) {
  if (
    env.GH_EVENT_NAME !== "workflow_dispatch" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GH_REPOSITORY ?? "")
  )
    fail("Manual repository dispatch required.");
  const repo = await api("GET", `/repos/${env.GH_REPOSITORY}`);
  if (env.GH_REF !== `refs/heads/${repo.default_branch}`)
    fail("Run only from the trusted default branch.");
  const head = await api(
    "GET",
    `/repos/${env.GH_REPOSITORY}/git/ref/heads/${encodeURIComponent(repo.default_branch)}`,
  );
  if (head.object.sha !== env.GH_SHA)
    fail("Default branch advanced; dispatch the latest workflow again.");
  for (const actor of new Set([env.GH_ACTOR, env.GH_TRIGGERING_ACTOR])) {
    if (!/^[A-Za-z0-9-]{1,39}$/.test(actor ?? "")) fail("Invalid actor.");
    const access = await api(
      "GET",
      `/repos/${env.GH_REPOSITORY}/collaborators/${actor}/permission`,
    );
    if (!["admin", "maintain"].includes(access.role_name ?? access.permission))
      fail("Only repository maintainers may dispatch or rerun.");
  }
  return repo;
}
export async function identity(role, env, api) {
  const app = APPS[role];
  const prefix = role.toUpperCase();
  if (
    env[`${prefix}_APP_ID`] !== app.id ||
    env[`${prefix}_SLUG`] !== app.slug ||
    !/^\d+$/.test(env[`${prefix}_INSTALLATION`] ?? "")
  )
    fail("Unexpected App identity.");
  const result = await api("GET", "/installation/repositories?per_page=100");
  if (
    result.total_count !== 1 ||
    result.repositories[0]?.full_name !== env.GH_REPOSITORY
  )
    fail("App token must be scoped to exactly this repository.");
  return `${app.slug} app=${app.id} installation=${env[`${prefix}_INSTALLATION`]} repository=${env.GH_REPOSITORY}`;
}
async function pull(api, base, number, sha, defaultBranch) {
  const p = await api("GET", `${base}/pulls/${number}`);
  if (
    p.state !== "open" ||
    p.draft ||
    p.head.repo?.full_name !== p.base.repo?.full_name ||
    p.head.repo?.full_name !== base.slice(7) ||
    p.head.sha !== sha ||
    p.base.ref !== defaultBranch ||
    p.head.ref === defaultBranch
  )
    fail(
      "PR must be open, ready, same-repository and match expected head/default base.",
    );
  return p;
}
export async function publish(i, env, repo, api) {
  const base = `/repos/${env.GH_REPOSITORY}`;
  if (i.action === "create-pr") {
    if (i.branch === repo.default_branch)
      fail("Default branch cannot be a PR head.");
    const branch = await api(
      "GET",
      `${base}/git/ref/heads/${encodeURIComponent(i.branch)}`,
    );
    if (branch.object.sha !== i.sha)
      fail("Branch no longer matches expected SHA.");
    const issue = await api("GET", `${base}/issues/${i.issue}`);
    if (issue.pull_request || issue.state !== "open")
      fail("An open development issue is required.");
    const existing = await pages(
      api,
      `${base}/pulls?state=open&base=${encodeURIComponent(repo.default_branch)}&head=${encodeURIComponent(repo.owner.login + ":" + i.branch)}`,
    );
    if (existing.length) {
      await pull(api, base, existing[0].number, i.sha, repo.default_branch);
      return `Existing PR #${existing[0].number}`;
    }
    const again = await api(
      "GET",
      `${base}/git/ref/heads/${encodeURIComponent(i.branch)}`,
    );
    if (again.object.sha !== i.sha) fail("Branch advanced before publishing.");
    const result = await api("POST", `${base}/pulls`, {
      head: i.branch,
      base: repo.default_branch,
      title: i.title,
      body: `${i.body}\n\nCloses #${i.issue}.`,
    });
    if (result.head?.sha !== i.sha)
      fail(
        "Created PR head changed during creation; inspect it manually, no expected-head success is claimed.",
      );
    return `Created PR #${result.number}`;
  }
  await pull(api, base, i.pr, i.sha, repo.default_branch);
  if (i.verdict === "APPROVE") {
    const files = await pages(api, `${base}/pulls/${i.pr}/files`);
    if (
      files.some((f) =>
        [f.filename, f.previous_filename].some(
          (name) =>
            /^\.github\/(workflows|bridge)\//.test(name ?? "") ||
            /^deploy\//.test(name ?? "") ||
            /^(Dockerfile|compose\.ya?ml|eas\.json)$/.test(name ?? ""),
        ),
      )
    )
      fail(
        "Workflow/bridge/deployment changes require human review, not bot approval.",
      );
    const runs = await api(
      "GET",
      `${base}/actions/workflows/ci.yml/runs?head_sha=${i.sha}&per_page=100`,
    );
    if (runs.total_count > 100) fail("Too many CI runs; inspect manually.");
    const relevant = runs.workflow_runs.filter(
      (r) =>
        r.head_sha === i.sha &&
        ["push", "pull_request"].includes(r.event) &&
        r.head_repository?.full_name === env.GH_REPOSITORY,
    );
    if (
      !relevant.length ||
      relevant.some(
        (r) => r.status !== "completed" || r.conclusion !== "success",
      )
    )
      fail(
        "Latest existing CI run for the exact head must succeed before approval.",
      );
  }
  const marker = `<!-- session-agent-bridge:${i.sha}:${i.verdict}:${createHash("sha256").update(i.body).digest("hex")} -->`;
  const reviews = await pages(api, `${base}/pulls/${i.pr}/reviews`);
  if (
    reviews.some(
      (r) =>
        r.user?.login === `${APPS.reviewer.slug}[bot]` &&
        r.commit_id === i.sha &&
        r.state ===
          {
            APPROVE: "APPROVED",
            REQUEST_CHANGES: "CHANGES_REQUESTED",
            COMMENT: "COMMENTED",
          }[i.verdict] &&
        r.body?.endsWith(marker),
    )
  )
    return "Matching review already published";
  await pull(api, base, i.pr, i.sha, repo.default_branch);
  await api("POST", `${base}/pulls/${i.pr}/reviews`, {
    commit_id: i.sha,
    event: i.verdict,
    body: `${i.body}\n\n${marker}`,
  });
  return `Published ${i.verdict} for PR #${i.pr} at ${i.sha}`;
}
export async function main(mode, env = process.env) {
  const i = input(JSON.parse(env.BRIDGE_INPUTS ?? "{}"));
  const repo = await preflight(env, github(env.GH_TOKEN));
  if (mode === "preflight") return;
  if (mode !== "run") fail("Invalid mode.");
  for (const role of i.action === "auth-check"
    ? ["worker", "reviewer"]
    : [i.action === "create-pr" ? "worker" : "reviewer"]) {
    const api = github(env[`${role.toUpperCase()}_TOKEN`]);
    console.log(await identity(role, env, api));
    if (i.action !== "auth-check")
      console.log(await publish(i, env, repo, api));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv[2]).catch((error) => {
    console.error(
      error instanceof SyntaxError ? "Invalid dispatch JSON." : error.message,
    );
    process.exitCode = 1;
  });
