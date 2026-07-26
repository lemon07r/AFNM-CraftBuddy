/**
 * CraftBuddy - Native MCTS input dumper
 *
 * Serialises production-shaped `runMcts` payloads from the checked-in replay
 * snapshots so the Rust engine can be profiled and compared for behavioural
 * neutrality outside of a browser/WASM host.
 *
 * The payload is produced by the same `buildNativeMctsInput` bridge the mod
 * uses at runtime, so a profile taken from it exercises the real action space,
 * effect trees, harmony subsystems and item actions rather than a synthetic
 * fixture.
 *
 * Usage:
 *   bun run scripts/optimizer/dump-native-mcts-inputs.ts [options]
 *
 * Options:
 *   --out <path>          Output JSON path (default: tmp/native-mcts-inputs.json)
 *   --iterations <n>      MCTS iterations per input (default: 250)
 *   --rollout-depth <n>   Rollout depth (default: 16)
 *   --max-nodes <n>       Node ceiling (default: 5000)
 *   --fixture <name>      Only dump one fixture (filename without .snapshot.json)
 */

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { buildNativeMctsInput } from '../../src/optimizer/nativeMcts';
import {
  getReplaySearchInput,
  loadOptimizerReplaySnapshot,
} from '../../src/__tests__/__fixtures__/replaySnapshots';

interface Options {
  out: string;
  iterations: number;
  rolloutDepth: number;
  maxNodes: number;
  fixture?: string;
}

const REPO_ROOT = path.resolve(__dirname, '../..');
const SNAPSHOT_DIR = path.join(
  REPO_ROOT,
  'src/__tests__/__fixtures__/replay-snapshots',
);

function parseArgs(argv: string[]): Options {
  const options: Options = {
    out: path.join(REPO_ROOT, 'tmp/native-mcts-inputs.json'),
    iterations: 250,
    rolloutDepth: 16,
    maxNodes: 5000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case '--out':
        options.out = path.resolve(REPO_ROOT, next);
        index += 1;
        break;
      case '--iterations':
        options.iterations = Number(next);
        index += 1;
        break;
      case '--rollout-depth':
        options.rolloutDepth = Number(next);
        index += 1;
        break;
      case '--max-nodes':
        options.maxNodes = Number(next);
        index += 1;
        break;
      case '--fixture':
        options.fixture = next;
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const files = readdirSync(SNAPSHOT_DIR)
    .filter((file) => file.endsWith('.snapshot.json'))
    .filter(
      (file) =>
        !options.fixture ||
        file === `${options.fixture}.snapshot.json` ||
        file === options.fixture,
    )
    .sort();

  if (files.length === 0) {
    throw new Error(`No replay snapshots matched in ${SNAPSHOT_DIR}`);
  }

  const inputs = files.map((file) => {
    const snapshot = loadOptimizerReplaySnapshot(file);
    const replay = getReplaySearchInput(snapshot);
    const input = buildNativeMctsInput({
      state: replay.state,
      config: replay.config,
      targetCompletion: replay.targetCompletion,
      targetPerfection: replay.targetPerfection,
      currentConditionType: replay.currentCondition,
      forecastedConditionTypes: replay.forecastConditions,
      goalPriorityBias: replay.searchConfig.goalPriorityBias,
      search: {
        iterations: options.iterations,
        rolloutDepth: options.rolloutDepth,
        maxNodes: options.maxNodes,
      },
    });

    return {
      fixture: file.replace(/\.snapshot\.json$/, ''),
      skillCount: input.skills.length,
      input,
    };
  });

  mkdirSync(path.dirname(options.out), { recursive: true });
  writeFileSync(
    options.out,
    `${JSON.stringify({ version: 1, inputs }, null, 2)}\n`,
    'utf8',
  );

  const totalSkills = inputs.reduce((sum, entry) => sum + entry.skillCount, 0);
  console.log(
    `Wrote ${inputs.length} native MCTS inputs (${totalSkills} skills total) to ${path.relative(REPO_ROOT, options.out)}`,
  );
  for (const entry of inputs) {
    console.log(`  ${entry.fixture}: ${entry.skillCount} skills`);
  }
}

main();
