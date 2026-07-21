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
  try {
    const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  } catch (err) {
    // git binary missing / not spawnable — synthesize a failed GitResult so
    // callers see a non-zero exit + clear stderr instead of an escaping throw.
    return { exitCode: 127, stdout: "", stderr: `git could not be executed: ${(err as Error).message}` };
  }
}
