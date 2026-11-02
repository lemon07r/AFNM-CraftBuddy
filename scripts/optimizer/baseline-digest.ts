/**
 * Fixed-work recommendation digest for refactor and performance checks.
 *
 * Runs every replay fixture with an effectively unlimited clock and a fixed
 * node budget, so the frontier depends only on code, not machine speed.
 *
 *   bun scripts/optimizer/baseline-digest.ts --out tmp/digest.json
 *   bun scripts/optimizer/baseline-digest.ts --compare tmp/digest.json
 *
 * `--compare` exits non-zero when any recommendation, ranking, score, safety
 * flag or rotation differs. Timing and nodes/sec are reported, never compared.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { findBestSkill } from '../../src/optimizer';
import {
  getReplaySearchInput,
  loadOptimizerReplaySnapshot,
} from '../../src/__tests__/__fixtures__/replaySnapshots';

const NODE_BUDGETS = [1500, 6000];
const FIXTURE_DIR = path.join(
  __dirname,
  '../../src/__tests__/__fixtures__/replay-snapshots',
);

interface DigestEntry {
  recommendation: string | null;
  ranked: Array<{
    key: string;
    score: number;
    unsafe: boolean;
    probabilistic: boolean;
    endsCraft: boolean;
  }>;
  rotation: string[];
  depth: number;
  nodes: number;
  timeMs: number;
}

const round = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : value;

function run(): Record<string, DigestEntry> {
  const fixtures = readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith('.snapshot.json'))
    .sort();
  const digest: Record<string, DigestEntry> = {};
  for (const file of fixtures) {
    const input = getReplaySearchInput(loadOptimizerReplaySnapshot(file));
    for (const maxNodes of NODE_BUDGETS) {
      const started = performance.now();
      const result = findBestSkill(
        input.state,
        input.config,
        input.targetCompletion,
        input.targetPerfection,
        false,
        48,
        input.currentCondition,
        input.forecastConditions,
        {
          ...input.searchConfig,
          timeBudgetMs: 1e9,
          maxNodes,
          useMonteCarloTreeSearch: false,
        } as Parameters<typeof findBestSkill>[8],
      );
      const timeMs = performance.now() - started;
      const ranked = [
        ...(result.recommendation ? [result.recommendation] : []),
        ...result.alternativeSkills,
      ];
      digest[`${file.replace('.snapshot.json', '')}@${maxNodes}`] = {
        recommendation: result.recommendation?.skill.key ?? null,
        ranked: ranked.map((rec) => ({
          key: rec.skill.key,
          score: round(rec.score),
          unsafe: rec.yieldsToSafeAlternative === true,
          probabilistic: rec.requiresProbabilisticSurvival === true,
          endsCraft: rec.endsCraft === true,
        })),
        rotation: result.optimalRotation ?? [],
        depth: result.searchMetrics?.depthReached ?? 0,
        nodes: result.searchMetrics?.nodesExplored ?? 0,
        timeMs: Math.round(timeMs),
      };
    }
  }
  return digest;
}

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const compareIndex = args.indexOf('--compare');
const digest = run();

let totalNodes = 0;
let totalMs = 0;
for (const entry of Object.values(digest)) {
  totalNodes += entry.nodes;
  totalMs += entry.timeMs;
}
console.log(
  `fixtures×budgets: ${Object.keys(digest).length}, nodes: ${totalNodes}, ` +
    `time: ${totalMs} ms, nodes/ms: ${(totalNodes / Math.max(1, totalMs)).toFixed(2)}`,
);

if (outIndex >= 0) {
  const outPath = args[outIndex + 1];
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(digest, null, 2));
  console.log(`wrote ${outPath}`);
}

if (compareIndex >= 0) {
  const baseline = JSON.parse(
    readFileSync(args[compareIndex + 1], 'utf8'),
  ) as Record<string, DigestEntry>;
  let differences = 0;
  let baselineMs = 0;
  for (const [key, expected] of Object.entries(baseline)) {
    baselineMs += expected.timeMs;
    const actual = digest[key];
    const strip = (entry: DigestEntry | undefined) =>
      entry && {
        recommendation: entry.recommendation,
        ranked: entry.ranked,
        rotation: entry.rotation,
        depth: entry.depth,
        nodes: entry.nodes,
      };
    if (JSON.stringify(strip(actual)) !== JSON.stringify(strip(expected))) {
      differences++;
      console.log(`DIFF ${key}`);
      console.log(`  expected: ${JSON.stringify(strip(expected))}`);
      console.log(`  actual:   ${JSON.stringify(strip(actual))}`);
    }
  }
  console.log(
    `${differences} differing entries; time ${totalMs} ms vs baseline ${baselineMs} ms`,
  );
  process.exit(differences > 0 ? 1 : 0);
}
