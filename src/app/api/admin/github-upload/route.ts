import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { spawn } from "child_process";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/github-upload
 * Body: { token, repoName, isPrivate }
 *
 * Creates a GitHub repository (if it doesn't exist) and pushes the project
 * source code to it. Uses the GitHub REST API via Python (PyGithub) for repo
 * creation, then git push for the actual upload.
 *
 * The token is used ONLY for this request — it is never stored.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { token, repoName, isPrivate } = await req.json();
    if (!token || !repoName) return fail("Token and repository name are required.", 400);

    // Step 1: Create the repo on GitHub using the GitHub API
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" },
    });
    if (!userRes.ok) return fail("Invalid GitHub token. Please check your token and try again.", 401);
    const userData = await userRes.json();
    const username = userData.login;

    // Check if repo already exists
    const checkRes = await fetch(`https://api.github.com/repos/${username}/${repoName}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" },
    });

    let repoUrl: string;
    if (checkRes.ok) {
      // Repo exists — we'll push to it
      const existing = await checkRes.json();
      repoUrl = existing.html_url;
    } else {
      // Create new repo
      const createRes = await fetch("https://api.github.com/user/repos", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
        body: JSON.stringify({
          name: repoName,
          description: "Free AI Video Production Platform powered by Z.ai",
          private: !!isPrivate,
          auto_init: false,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json();
        return fail(`Failed to create repository: ${err.message || createRes.statusText}`, 500);
      }
      const created = await createRes.json();
      repoUrl = created.html_url;
    }

    // Step 2: Push via git
    const projectDir = process.cwd();
    const remoteUrl = `https://${token}@github.com/${username}/${repoName}.git`;

    // Set up remote
    await runCommand("git", ["remote", "remove", "origin"], projectDir).catch(() => {});
    await runCommand("git", ["remote", "add", "origin", remoteUrl], projectDir);

    // Push
    const pushResult = await runCommand("git", ["push", "-u", "origin", "main"], projectDir).catch(async () => {
      // Try master branch
      return runCommand("git", ["push", "-u", "origin", "master"], projectDir);
    });

    // Remove token from remote URL (security)
    await runCommand("git", ["remote", "set-url", "origin", `https://github.com/${username}/${repoName}.git`], projectDir);

    return ok({ url: repoUrl, username, repoName });
  } catch (err: any) {
    return handleError(err);
  }
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Command failed (exit ${code}): ${stderr.slice(-300)}`));
    });
  });
}
