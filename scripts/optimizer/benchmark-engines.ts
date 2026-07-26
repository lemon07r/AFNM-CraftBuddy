/**
 * CraftBuddy Optimizer Benchmark Harness
 *
 * Compares optimizer configurations over existing replay snapshots and
 * produces JSON + Markdown output for before/after tuning comparisons.
 *
 * Usage:
 *   bun run scripts/optimizer/benchmark-engines.ts [options]
 *
 * Options:
 *   --fixtures <path>   Path to replay-snapshots directory (default: auto-resolved)
 *   --json <path>       Output JSON report path (default: tmp/engine-benchmark.json)
 *   --markdown <path>   Output Markdown report path (default: tmp/engine-benchmark.md)
 *   --configs <ids>     Comma-separated config IDs to run (default: all)
 *   --fixture <name>    Run only a single fixture (by filename, without .snapshot.json)
 *   --verbose           Print per-fixture results to console as they run
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import path from 'node:path';
import { lookaheadSearch } from '../../src/optimizer/search';
import { getReplaySearchInput } from '../../src/__tests__/__fixtures__/replaySnapshots';
import type { OptimizerReplaySnapshot } from '../../src/modContent/replaySnapshot';

// ── Types ────────────────────────────────────────────────────────────────────

interface BenchmarkConfig {
  id: string;
  label: string;
  lookaheadDepth: number;
  searchConfig: {
    timeBudgetMs: number;
    maxNodes: number;
    beamWidth: number;
    goalPriorityBias?: number;
    useMonteCarloTreeSearch?: boolean;
    mctsIterations?: number;
    mctsRolloutDepth?: number;
    mctsMaxNodes?: number;
  };
}

interface FixtureContract {
  fixture: string;
  mustRecommendOneOf?: string[];
  mustNotRecommend?: string[];
  preferredTypes?: string[];
  forbiddenTypes?: string[];
  /**
   * Relative-ordering clauses between two candidates.
   *
   * These are *materiality aware*. The ordering of two candidates that the
   * optimizer did not recommend is informational, not a correctness property:
   * the panel surfaces the recommendation, and the ranking of runners-up shifts
   * with whatever search depth the wall-clock budget happens to complete on a
   * given machine. A clause therefore only fails when the inversion actually
   * matters:
   *
   * - always, if `after` is the recommendation (a real, player-visible defect);
   * - otherwise, only when the score gap exceeds `toleranceRatio`.
   *
   * Use `mustNotRecommend` for the invariant that a candidate is never chosen.
   */
  mustRankBefore?: Array<{
    before: string;
    after: string;
    /** Fractional score gap tolerated between two non-recommended candidates. */
    toleranceRatio?: number;
  }>;
  minDepthReached?: number;
  notes: string;
}

interface BenchmarkRunResult {
  fixture: string;
  config: string;
  configLabel: string;
  lookaheadDepth: number;
  recommendationKey: string | null;
  recommendationName: string | null;
  recommendationType: string | null;
  recommendationActionKind: string | null;
  topScore: number;
  scoreMargin: number;
  rankedKeys: string[];
  rankedScores: number[];
  topNKeys: string[];
  depthReached: number;
  nodesExplored: number;
  cacheHits: number;
  timeTakenMs: number;
  mcts?: {
    backend: string;
    iterations: number;
    nodes: number;
    rolloutDepth: number;
    bestSkillKey?: string;
    policyCount: number;
  };
  earlyExit?: {
    reason: string;
    depth: number;
    stablePasses: number;
    scoreMargin: number;
  };
  requiresProbabilisticSurvival: boolean;
  projectedSuccessChance?: number;
  optimalRotation: string[];
  contractPass: boolean | null;
  contractFailReasons: string[];
}

interface BenchmarkReport {
  generatedAt: string;
  totalFixtures: number;
  totalConfigs: number;
  totalRuns: number;
  passedContracts: number;
  failedContracts: number;
  skippedContracts: number;
  results: BenchmarkRunResult[];
}

// ── Benchmark configs ─────────────────────────────────────────────────────────

const BENCHMARK_CONFIGS: BenchmarkConfig[] = [
  {
    id: 'legacy_instant',
    label: 'Legacy Instant (32d, 1s, 400k)',
    lookaheadDepth: 32,
    searchConfig: {
      timeBudgetMs: 1000,
      maxNodes: 400000,
      beamWidth: 5,
      useMonteCarloTreeSearch: false,
    },
  },
  {
    id: 'legacy_fast',
    label: 'Legacy Fast (48d, 2s, 1M)',
    lookaheadDepth: 48,
    searchConfig: {
      timeBudgetMs: 2000,
      maxNodes: 1000000,
      beamWidth: 5,
      useMonteCarloTreeSearch: false,
    },
  },
  {
    id: 'same_budget_legacy_2s',
    label: 'Same Budget Legacy (48d, 2s, 1M)',
    lookaheadDepth: 48,
    searchConfig: {
      timeBudgetMs: 2000,
      maxNodes: 1000000,
      beamWidth: 5,
      useMonteCarloTreeSearch: false,
    },
  },
  {
    id: 'same_budget_mcts_2s',
    label: 'Same Budget MCTS (48d, 2s, 1M)',
    lookaheadDepth: 48,
    searchConfig: {
      timeBudgetMs: 2000,
      maxNodes: 1000000,
      beamWidth: 5,
      useMonteCarloTreeSearch: true,
      mctsIterations: 250,
      mctsRolloutDepth: 12,
      mctsMaxNodes: 5000,
    },
  },
  {
    id: 'legacy_balanced',
    label: 'Legacy Balanced (64d, 4.5s, 2M)',
    lookaheadDepth: 64,
    searchConfig: {
      timeBudgetMs: 4500,
      maxNodes: 2000000,
      beamWidth: 5,
      useMonteCarloTreeSearch: false,
    },
  },
  {
    id: 'experimental_fast',
    label: 'Experimental Fast (32d, 1.5s, 500k)',
    lookaheadDepth: 32,
    searchConfig: {
      timeBudgetMs: 1500,
      maxNodes: 500000,
      beamWidth: 5,
      useMonteCarloTreeSearch: true,
      mctsIterations: 250,
      mctsRolloutDepth: 8,
      mctsMaxNodes: 5000,
    },
  },
  {
    id: 'experimental_balanced',
    label: 'Experimental Balanced (48d, 2.25s, 800k)',
    lookaheadDepth: 48,
    searchConfig: {
      timeBudgetMs: 2250,
      maxNodes: 800000,
      beamWidth: 5,
      useMonteCarloTreeSearch: true,
      mctsIterations: 250,
      mctsRolloutDepth: 12,
      mctsMaxNodes: 5000,
    },
  },
];

// ── Quality contracts ─────────────────────────────────────────────────────────
// Flexible per-fixture contracts. mustRecommendOneOf is preferred over a single
// exact key when multiple choices are valid for a given situation.

const FIXTURE_CONTRACTS: FixtureContract[] = [
  {
    fixture: 'user-report-resonance-regression',
    mustNotRecommend: ['explosive_fusion'],
    mustRankBefore: [
      {
        before: 'focused_refine',
        after: 'explosive_fusion',
        // Runner-up ordering only, tolerated up to a 5% score gap. See
        // docs/project/RUNTIME_EVIDENCE_075.md for the measurements: this
        // fixture carries no harmonyData at all, so nothing about it is
        // resonance-specific, and the inversion tracks the search depth the
        // wall-clock budget completes (passes at depth 4, inverts at depth 5,
        // reverts from depth 6 up) rather than any game mechanic. The real
        // defect users reported - explosive_fusion being *recommended* - is
        // covered by mustNotRecommend above and by the deterministic
        // fixed-node assertions in src/__tests__/search.test.ts.
        toleranceRatio: 0.05,
      },
    ],
    notes:
      'explosive_fusion must never be recommended. Runner-up ordering against focused_refine is depth-sensitive and only material beyond a 5% score gap.',
  },
  {
    fixture: 'user-report-alchemical-sequence',
    preferredTypes: ['refine'],
    notes: 'Alchemical next charge is refine; optimizer should not recommend off-combo types.',
  },
  {
    fixture: 'skyfall-bow-heat-regression',
    forbiddenTypes: ['fusion'],
    mustNotRecommend: ['explosive_fusion'],
    notes:
      'Heat=6 regression: optimizer should not return to fusion when forge heat is already in the sweet spot.',
  },
  {
    fixture: 'forge-heat-runway-step-2',
    preferredTypes: ['fusion'],
    mustNotRecommend: ['focus'],
    notes: 'Heat=2: prioritize heat recovery (fusion) over support setup.',
  },
  {
    fixture: 'forge-heat-runway-step-3',
    preferredTypes: ['fusion'],
    notes: 'Heat=1: do not walk forge heat to zero.',
  },
  {
    fixture: 'low-stability-step-before',
    preferredTypes: ['stabilize'],
    notes: 'Low stability: guaranteed stabilization should be preferred.',
  },
  {
    fixture: 'low-stability-regression',
    notes: 'Post-stabilize: invasive refine should remain lower-ranked alternative.',
  },
  {
    fixture: 'premature-finish-proc-floor',
    notes: 'Proc-dependent refine line should stay behind safe stabilization.',
  },
  {
    fixture: 'user-report-premature-finish-runway',
    notes: 'Optimizer should continue crafting instead of finishing early.',
    mustNotRecommend: ['__finish_craft__'],
  },
  {
    fixture: 'user-report-fairy-recovery',
    notes: 'Live continuation should rank above Finish Craft.',
    mustNotRecommend: ['__finish_craft__'],
  },
  {
    fixture: 'user-report-live-workshop-step-1',
    notes: 'Workshop live step 1: check recommendation quality.',
  },
  {
    fixture: 'user-report-live-workshop-step-2',
    notes: 'Workshop live step 2: check recommendation quality.',
  },
  {
    fixture: 'user-report-pattern-step-1',
    notes: 'Inscription pattern step 1: optimizer should not waste inscription blocks.',
  },
  {
    fixture: 'user-report-pattern-step-2',
    notes: 'Inscription pattern step 2.',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getContractForFixture(
  fixtureName: string,
): FixtureContract | undefined {
  return FIXTURE_CONTRACTS.find(
    (c) =>
      c.fixture === fixtureName ||
      c.fixture === fixtureName.replace('.snapshot.json', ''),
  );
}

function evaluateContract(
  result: BenchmarkRunResult,
  contract: FixtureContract | undefined,
): { pass: boolean | null; reasons: string[] } {
  if (!contract) {
    return { pass: null, reasons: [] };
  }

  const reasons: string[] = [];

  if (contract.mustRecommendOneOf && contract.mustRecommendOneOf.length > 0) {
    const key = result.recommendationKey;
    if (!key || !contract.mustRecommendOneOf.includes(key)) {
      reasons.push(
        `expected one of [${contract.mustRecommendOneOf.join(', ')}], got ${
          key ?? 'null'
        }`,
      );
    }
  }

  if (contract.mustNotRecommend && contract.mustNotRecommend.length > 0) {
    const key = result.recommendationKey;
    if (key && contract.mustNotRecommend.includes(key)) {
      reasons.push(`must NOT recommend ${key}, but did`);
    }
  }

  if (contract.preferredTypes && contract.preferredTypes.length > 0) {
    const type = result.recommendationType;
    if (!type || !contract.preferredTypes.includes(type)) {
      reasons.push(
        `expected type in [${contract.preferredTypes.join(', ')}], got ${type ?? 'null'}`,
      );
    }
  }

  if (contract.forbiddenTypes && contract.forbiddenTypes.length > 0) {
    const type = result.recommendationType;
    const actionKind = result.recommendationActionKind;
    const forbiddenMatch =
      (type && contract.forbiddenTypes.includes(type)) ||
      (actionKind && contract.forbiddenTypes.includes(actionKind));
    if (forbiddenMatch) {
      reasons.push(`type/actionKind ${type ?? actionKind} is forbidden`);
    }
  }

  if (contract.mustRankBefore && contract.mustRankBefore.length > 0) {
    for (const { before, after, toleranceRatio = 0 } of contract.mustRankBefore) {
      const beforeIndex = result.rankedKeys.indexOf(before);
      const afterIndex = result.rankedKeys.indexOf(after);
      if (beforeIndex < 0 || afterIndex < 0) {
        reasons.push(
          `rank contract ${before} before ${after} could not be evaluated (ranks: ${result.rankedKeys.join(
            ', ',
          )})`,
        );
        continue;
      }
      if (beforeIndex < afterIndex) {
        continue;
      }

      // An inversion that puts `after` at the top is always a real defect.
      const afterIsRecommendation = result.recommendationKey === after;
      const beforeScore = result.rankedScores[beforeIndex] ?? 0;
      const afterScore = result.rankedScores[afterIndex] ?? 0;
      const reference = Math.max(Math.abs(beforeScore), Math.abs(afterScore));
      const gapRatio = reference > 0 ? Math.abs(afterScore - beforeScore) / reference : 0;
      const immaterial = !afterIsRecommendation && gapRatio <= toleranceRatio;
      if (immaterial) {
        continue;
      }

      const detail = afterIsRecommendation
        ? `${after} was recommended`
        : `gap ${(gapRatio * 100).toFixed(2)}% exceeds the ${(
            toleranceRatio * 100
          ).toFixed(2)}% tolerance`;
      reasons.push(
        `expected ${before} to rank before ${after}, got positions ${beforeIndex}/${afterIndex} (${detail})`,
      );
    }
  }

  if (contract.minDepthReached !== undefined) {
    if (result.depthReached < contract.minDepthReached) {
      reasons.push(
        `required depth >= ${contract.minDepthReached}, reached ${result.depthReached}`,
      );
    }
  }

  return { pass: reasons.length === 0, reasons };
}

function formatMs(ms: number): string {
  return `${ms.toFixed(0)}ms`;
}

function truncate(str: string | null | undefined, max: number): string {
  if (!str) return '-';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// ── Main benchmark runner ─────────────────────────────────────────────────────

function runBenchmark(options: {
  fixturesDir: string;
  configIds?: string[];
  singleFixture?: string;
  verbose?: boolean;
}): BenchmarkReport {
  const { fixturesDir, configIds, singleFixture, verbose } = options;

  const allFiles = readdirSync(fixturesDir).filter((f) =>
    f.endsWith('.snapshot.json'),
  );
  const fixturesToRun = singleFixture
    ? allFiles.filter((f) => f.includes(singleFixture))
    : allFiles;
  const configsToRun = configIds
    ? BENCHMARK_CONFIGS.filter((c) => configIds.includes(c.id))
    : BENCHMARK_CONFIGS;

  if (configIds) {
    const knownConfigIds = new Set(BENCHMARK_CONFIGS.map((c) => c.id));
    const unknownConfigIds = configIds.filter((id) => !knownConfigIds.has(id));
    if (unknownConfigIds.length > 0) {
      console.error(`Unknown config ID(s): ${unknownConfigIds.join(', ')}`);
      console.error(
        `Known config IDs: ${BENCHMARK_CONFIGS.map((c) => c.id).join(', ')}`,
      );
      process.exit(1);
    }
  }

  if (configsToRun.length === 0) {
    console.error('No benchmark configs selected');
    process.exit(1);
  }

  if (fixturesToRun.length === 0) {
    console.error(`No fixtures found in ${fixturesDir} matching filter`);
    process.exit(1);
  }

  const results: BenchmarkRunResult[] = [];
  let passedContracts = 0;
  let failedContracts = 0;
  let skippedContracts = 0;

  for (const fixtureFile of fixturesToRun) {
    const fixtureName = fixtureFile.replace('.snapshot.json', '');
    const contract = getContractForFixture(fixtureName);

    let snapshot: OptimizerReplaySnapshot;
    try {
      const fixturePath = path.join(fixturesDir, fixtureFile);
      snapshot = JSON.parse(
        readFileSync(fixturePath, 'utf8'),
      ) as OptimizerReplaySnapshot;
    } catch (e) {
      console.error(`  [ERROR] Could not load ${fixtureFile}: ${e}`);
      failedContracts += configsToRun.length;
      for (const cfg of configsToRun) {
        results.push({
          fixture: fixtureName,
          config: cfg.id,
          configLabel: cfg.label,
          lookaheadDepth: cfg.lookaheadDepth,
          recommendationKey: null,
          recommendationName: null,
          recommendationType: null,
          recommendationActionKind: null,
          topScore: 0,
          scoreMargin: 0,
          rankedKeys: [],
          rankedScores: [],
          topNKeys: [],
          depthReached: 0,
          nodesExplored: 0,
          cacheHits: 0,
          timeTakenMs: 0,
          requiresProbabilisticSurvival: false,
          optimalRotation: [],
          contractPass: false,
          contractFailReasons: [`fixture load failed: ${String(e)}`],
        });
      }
      continue;
    }

    const input = getReplaySearchInput(snapshot);

    for (const cfg of configsToRun) {
      if (verbose) {
        process.stdout.write(`  ${fixtureName} / ${cfg.id}... `);
      }

      let runResult: BenchmarkRunResult;
      try {
        const searchConfig = {
          ...cfg.searchConfig,
          goalPriorityBias:
            cfg.searchConfig.goalPriorityBias ??
            input.searchConfig.goalPriorityBias ??
            0,
        };

        const result = lookaheadSearch(
          input.state,
          input.config,
          input.targetCompletion,
          input.targetPerfection,
          cfg.lookaheadDepth,
          input.currentCondition as string,
          input.forecastConditions as string[],
          searchConfig,
        );

        const recommendation = result.recommendation;
        const allRecs = recommendation
          ? [recommendation, ...result.alternativeSkills]
          : result.alternativeSkills;
        const topNKeys = allRecs.slice(0, 5).map((r) => r.skill.key);
        const rankedKeys = allRecs.map((r) => r.skill.key);
        const rankedScores = allRecs.map((r) => r.score);
        const scoreMargin =
          allRecs.length >= 2 ? allRecs[0].score - allRecs[1].score : 0;

        runResult = {
          fixture: fixtureName,
          config: cfg.id,
          configLabel: cfg.label,
          lookaheadDepth: cfg.lookaheadDepth,
          recommendationKey: recommendation?.skill.key ?? null,
          recommendationName: recommendation?.skill.name ?? null,
          recommendationType: recommendation?.skill.type ?? null,
          recommendationActionKind: recommendation?.skill.actionKind ?? null,
          topScore: recommendation?.score ?? 0,
          scoreMargin,
          rankedKeys,
          rankedScores,
          topNKeys,
          depthReached: result.searchMetrics?.depthReached ?? 0,
          nodesExplored: result.searchMetrics?.nodesExplored ?? 0,
          cacheHits: result.searchMetrics?.cacheHits ?? 0,
          timeTakenMs: result.searchMetrics?.timeTakenMs ?? 0,
          mcts: result.searchMetrics?.mcts,
          earlyExit: result.searchMetrics?.earlyExit,
          requiresProbabilisticSurvival:
            recommendation?.requiresProbabilisticSurvival ?? false,
          projectedSuccessChance: recommendation?.projectedSuccessChance,
          optimalRotation: result.optimalRotation ?? [],
          contractPass: null,
          contractFailReasons: [],
        };
      } catch (e) {
        console.error(`  [ERROR] ${fixtureName} / ${cfg.id}: ${e}`);
        runResult = {
          fixture: fixtureName,
          config: cfg.id,
          configLabel: cfg.label,
          lookaheadDepth: cfg.lookaheadDepth,
          recommendationKey: null,
          recommendationName: null,
          recommendationType: null,
          recommendationActionKind: null,
          topScore: 0,
          scoreMargin: 0,
          rankedKeys: [],
          rankedScores: [],
          topNKeys: [],
          depthReached: 0,
          nodesExplored: 0,
          cacheHits: 0,
          timeTakenMs: 0,
          requiresProbabilisticSurvival: false,
          optimalRotation: [],
          contractPass: false,
          contractFailReasons: [`exception: ${String(e)}`],
        };
        results.push(runResult);
        if (verbose) console.log('ERROR');
        failedContracts++;
        continue;
      }

      const { pass, reasons } = evaluateContract(runResult, contract);
      runResult.contractPass = pass;
      runResult.contractFailReasons = reasons;

      if (pass === true) passedContracts++;
      else if (pass === false) failedContracts++;
      else skippedContracts++;

      results.push(runResult);

      if (verbose) {
        const status =
          pass === null
            ? '(no contract)'
            : pass
              ? 'PASS'
              : `FAIL: ${reasons.join('; ')}`;
        console.log(
          `${runResult.recommendationKey ?? 'null'} d${runResult.depthReached} ${formatMs(runResult.timeTakenMs)} → ${status}`,
        );
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalFixtures: fixturesToRun.length,
    totalConfigs: configsToRun.length,
    totalRuns: results.length,
    passedContracts,
    failedContracts,
    skippedContracts,
    results,
  };
}

// ── Report formatters ─────────────────────────────────────────────────────────

function buildMarkdownReport(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push('# CraftBuddy Optimizer Benchmark Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| Fixtures | ${report.totalFixtures} |`);
  lines.push(`| Configs | ${report.totalConfigs} |`);
  lines.push(`| Total runs | ${report.totalRuns} |`);
  lines.push(`| Contracts passed | ${report.passedContracts} |`);
  lines.push(`| Contracts failed | ${report.failedContracts} |`);
  lines.push(`| No contract | ${report.skippedContracts} |`);
  lines.push('');

  // Group by fixture
  const fixtures = [...new Set(report.results.map((r) => r.fixture))];
  for (const fixture of fixtures) {
    const fixtureResults = report.results.filter((r) => r.fixture === fixture);
    const contract = getContractForFixture(fixture);

    lines.push(`## ${fixture}`);
    if (contract?.notes) {
      lines.push(`> ${contract.notes}`);
    }
    lines.push('');
    lines.push(
      '| Config | Recommendation | Type | Score Margin | Depth | Nodes | Time | Contract |',
    );
    lines.push(
      '|--------|----------------|------|-------------|-------|-------|------|----------|',
    );

    for (const r of fixtureResults) {
      const contractStatus =
        r.contractPass === null
          ? '-'
          : r.contractPass
            ? '✓'
            : `✗ ${r.contractFailReasons.join('; ')}`;
      lines.push(
        `| ${truncate(r.configLabel, 35)} | ${truncate(r.recommendationName, 28)} | ${r.recommendationType ?? '-'} | ${r.scoreMargin.toFixed(1)} | ${r.depthReached} | ${r.nodesExplored.toLocaleString()} | ${formatMs(r.timeTakenMs)} | ${contractStatus} |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── CLI entry point ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}
const hasFlag = (flag: string): boolean => args.includes(flag);

const defaultFixturesDir = path.join(
  __dirname,
  '../../src/__tests__/__fixtures__/replay-snapshots',
);
const fixturesDir = getArg('--fixtures') ?? defaultFixturesDir;
const jsonOutput = getArg('--json') ?? 'tmp/engine-benchmark.json';
const markdownOutput = getArg('--markdown') ?? 'tmp/engine-benchmark.md';
const configsArg = getArg('--configs');
const configIds = configsArg
  ? configsArg
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  : undefined;
const singleFixture = getArg('--fixture');
const verbose = hasFlag('--verbose') || hasFlag('-v');

if (!existsSync(fixturesDir)) {
  console.error(`Fixtures directory not found: ${fixturesDir}`);
  process.exit(1);
}

console.log(`CraftBuddy Optimizer Benchmark`);
console.log(`  Fixtures: ${fixturesDir}`);
console.log(`  Configs:  ${configIds?.join(', ') ?? 'all'}`);
if (singleFixture) console.log(`  Fixture filter: ${singleFixture}`);
console.log('');

const report = runBenchmark({ fixturesDir, configIds, singleFixture, verbose });

// Write outputs
const outDir = path.dirname(jsonOutput);
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}
writeFileSync(jsonOutput, JSON.stringify(report, null, 2), 'utf8');
const markdown = buildMarkdownReport(report);
writeFileSync(markdownOutput, markdown, 'utf8');

console.log(`\nResults:`);
console.log(`  Contracts passed: ${report.passedContracts}`);
console.log(`  Contracts failed: ${report.failedContracts}`);
console.log(`  No contract:      ${report.skippedContracts}`);
console.log(`\nOutput:`);
console.log(`  JSON:     ${jsonOutput}`);
console.log(`  Markdown: ${markdownOutput}`);

if (report.failedContracts > 0) {
  console.log('\nFailed contracts:');
  for (const r of report.results.filter((r) => r.contractPass === false)) {
    console.log(
      `  [${r.config}] ${r.fixture}: ${r.contractFailReasons.join('; ')}`,
    );
  }
  process.exit(1);
}
