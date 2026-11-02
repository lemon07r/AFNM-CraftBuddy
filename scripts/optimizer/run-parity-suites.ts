/**
 * CraftBuddy - Focused mechanics parity suite runner.
 *
 * Runtime parity work spans several Jest suites, and
 * a single divergence usually shows up in more than one of them. Running them
 * one at a time is slow and easy to
 * get wrong, so this script:
 *
 * - runs the parity-relevant suites, in parallel where that is safe;
 * - applies a per-process timeout so a hung suite fails fast instead of eating
 *   the whole budget;
 * - extracts per-test failures and the reported transition count;
 * - prints one summary table plus the failure detail.
 *
 * Usage:
 *   bun run scripts/optimizer/run-parity-suites.ts            # default set
 *   bun run scripts/optimizer/run-parity-suites.ts --serial
 *   bun run scripts/optimizer/run-parity-suites.ts --timeout 240
 *   bun run scripts/optimizer/run-parity-suites.ts --filter transition
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../..');

interface SuiteSpec {
  /** Stable identifier, also used by `--filter`. */
  readonly id: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  /** Suites sharing a group run serially to avoid CPU contention. */
  readonly group: string;
  readonly timeoutSeconds: number;
}

interface SuiteResult {
  readonly id: string;
  readonly ok: boolean;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly passed: number;
  readonly failed: number;
  readonly failures: readonly string[];
  readonly tail: string;
}

const JEST_SUITES: readonly string[] = [
  'src/__tests__/transitionCorpus.test.ts',
  'src/__tests__/skills.test.ts',
  'src/__tests__/gameAccuracy.test.ts',
  'src/__tests__/harmony.test.ts',
  'src/__tests__/outcome.test.ts',
];

function buildSuites(timeoutSeconds: number): SuiteSpec[] {
  return [
    ...JEST_SUITES.map((file) => ({
      id: `jest:${file.replace(/^src\/__tests__\//, '').replace(/\.test\.ts$/, '')}`,
      command: 'bunx',
      args: ['jest', file, '--silent', '--runInBand'],
      cwd: REPO_ROOT,
      group: 'jest',
      timeoutSeconds,
    })),
  ];
}

interface RunOutput {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly durationMs: number;
}

function runProcess(spec: SuiteSpec): Promise<RunOutput> {
  return new Promise((resolvePromise) => {
    const started = Date.now();
    const child = spawn(spec.command, [...spec.args], {
      cwd: spec.cwd ?? REPO_ROOT,
      env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, spec.timeoutSeconds * 1000);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      stderr += `\n${String(error)}`;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({
        code,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - started,
      });
    });
  });
}

/** Jest writes its summary to stderr. */
function parseJest(output: RunOutput): {
  passed: number;
  failed: number;
  failures: string[];
} {
  const combined = `${output.stdout}\n${output.stderr}`;
  const failures: string[] = [];
  for (const line of combined.split('\n')) {
    const match = /^\s*(?:✕|●)\s+(.*?)\s*$/.exec(line);
    if (match && match[1] && !match[1].startsWith('Console')) {
      failures.push(match[1]);
    }
  }
  const summary =
    /Tests:\s+(?:(\d+) failed,\s+)?(?:(\d+) skipped,\s+)?(?:(\d+) todo,\s+)?(\d+) passed/.exec(
      combined,
    );
  return {
    passed: summary ? Number(summary[4] ?? 0) : 0,
    failed: summary ? Number(summary[1] ?? 0) : failures.length,
    failures: Array.from(new Set(failures)),
  };
}

async function runSuite(spec: SuiteSpec): Promise<SuiteResult> {
  const output = await runProcess(spec);
  const parsed = parseJest(output);
  const tailSource = `${output.stdout}\n${output.stderr}`.trim().split('\n');
  return {
    id: spec.id,
    ok: !output.timedOut && output.code === 0,
    durationMs: output.durationMs,
    timedOut: output.timedOut,
    passed: parsed.passed,
    failed: parsed.failed,
    failures: parsed.failures,
    tail: tailSource.slice(-40).join('\n'),
  };
}

/** Run suites concurrently, but never two members of the same group. */
async function runGrouped(
  suites: readonly SuiteSpec[],
  serial: boolean,
): Promise<SuiteResult[]> {
  if (serial) {
    const results: SuiteResult[] = [];
    for (const suite of suites) {
      results.push(await runSuite(suite));
    }
    return results;
  }

  const groups = new Map<string, SuiteSpec[]>();
  for (const suite of suites) {
    const bucket = groups.get(suite.group) ?? [];
    bucket.push(suite);
    groups.set(suite.group, bucket);
  }

  const perGroup = await Promise.all(
    Array.from(groups.values()).map(async (bucket) => {
      const results: SuiteResult[] = [];
      for (const suite of bucket) {
        results.push(await runSuite(suite));
      }
      return results;
    }),
  );
  return perGroup.flat();
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const serial = argv.includes('--serial');
  const timeoutIndex = argv.indexOf('--timeout');
  const timeoutSeconds =
    timeoutIndex >= 0 ? Number(argv[timeoutIndex + 1]) || 120 : 120;
  const filterIndex = argv.indexOf('--filter');
  const filter = filterIndex >= 0 ? argv[filterIndex + 1] : undefined;

  let suites = buildSuites(timeoutSeconds);
  if (filter) suites = suites.filter((suite) => suite.id.includes(filter));

  if (suites.length === 0) {
    console.error('No suites matched the given options.');
    process.exit(2);
  }

  console.log(
    `Running ${suites.length} parity suite(s) ${serial ? 'serially' : 'grouped in parallel'}, ` +
      `${timeoutSeconds}s per process.\n`,
  );

  const started = Date.now();
  const results = await runGrouped(suites, serial);
  const totalMs = Date.now() - started;

  const width = Math.max(...results.map((result) => result.id.length));
  console.log('Suite'.padEnd(width) + '  status   time     tests');
  for (const result of results.sort((a, b) => a.id.localeCompare(b.id))) {
    const status = result.timedOut ? 'TIMEOUT' : result.ok ? 'pass' : 'FAIL';
    const tests =
      result.passed + result.failed > 0
        ? `${result.passed} passed, ${result.failed} failed`
        : 'n/a';
    console.log(
      `${result.id.padEnd(width)}  ${status.padEnd(8)} ${formatDuration(result.durationMs).padEnd(8)} ${tests}`,
    );
  }

  const failing = results.filter((result) => !result.ok);
  for (const result of failing) {
    console.log(`\n--- ${result.id} ---`);
    if (result.failures.length > 0) {
      console.log('Failing tests:');
      for (const failure of result.failures) console.log(`  - ${failure}`);
    }
    console.log(result.tail);
  }

  console.log(
    `\nTotal wall clock: ${formatDuration(totalMs)}; ${results.length - failing.length}/${results.length} suites green.`,
  );
  process.exit(failing.length === 0 ? 0 : 1);
}

void main();
