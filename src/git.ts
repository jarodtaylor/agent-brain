/**
 * agent-brain — thin git subprocess helper.
 *
 * One place for the `git -C <cwd> …` spawn + pipe + stringify boilerplate.
 * Callers keep their own interpretation of the result (null-on-any-failure,
 * empty-HEAD-vs-real-error, etc.) — this only removes the plumbing. No git
 * library; Bun's spawnSync, targeted with `-C` so the process cwd is never
 * used implicitly (KTD2).
 */
export interface GitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function runGit(cwd: string, ...args: string[]): GitResult {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}
