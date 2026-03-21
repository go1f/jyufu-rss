import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildFeeds } from "./build-feeds.mjs";
import { repoRoot } from "./lib/paths.mjs";

const execFileAsync = promisify(execFile);

async function runGit(args) {
  return execFileAsync("git", args, { cwd: repoRoot });
}

async function getCurrentBranch() {
  const { stdout } = await runGit(["branch", "--show-current"]);
  return stdout.trim();
}

async function hasRemote() {
  const { stdout } = await runGit(["remote"]);
  return stdout.trim().length > 0;
}

async function hasGeneratedChanges() {
  const { stdout } = await runGit(["status", "--porcelain", "--", "site/data", "site/feeds"]);
  return stdout.trim().length > 0;
}

export async function publishFeeds() {
  await buildFeeds();

  if (!(await hasGeneratedChanges())) {
    console.log("No generated changes to commit.");
    return;
  }

  await runGit(["add", "site/data", "site/feeds"]);
  await runGit(["commit", "-m", "chore: update feeds"]);

  if (process.env.SKIP_PUSH === "1") {
    console.log("Push skipped because SKIP_PUSH=1.");
    return;
  }

  if (!(await hasRemote())) {
    console.log("No git remote configured. Commit created locally, push skipped.");
    return;
  }

  const branch = await getCurrentBranch();
  await runGit(["push", "origin", branch]);
  console.log(`Pushed generated feeds to origin/${branch}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await publishFeeds();
}
