#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_GAME_DIR =
  '/home/lamim/.local/share/Steam/steamapps/common/Ascend From Nine Mountains';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function getGameDir() {
  return process.env.AFNM_GAME_DIR || DEFAULT_GAME_DIR;
}

function getAppAsarPath(gameDir) {
  return path.join(gameDir, 'resources', 'app.asar');
}

function ensureExists(filePath, description) {
  if (!fs.existsSync(filePath)) {
    fail(`${description} not found: ${filePath}`);
  }
}

function getCacheFingerprint(asarPath) {
  const stat = fs.statSync(asarPath);
  return `${stat.size}-${Math.trunc(stat.mtimeMs)}`;
}

function getExtractDir(fingerprint) {
  return path.join(ROOT, 'tmp', 'installed-game-runtime', fingerprint);
}

function extractRuntime(asarPath, extractDir) {
  const marker = path.join(extractDir, 'dist-electron', 'main', 'index.js');
  if (fs.existsSync(marker)) {
    return extractDir;
  }

  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });

  const result = childProcess.spawnSync(
    'npx',
    ['-y', '@electron/asar', 'extract', asarPath, extractDir],
    {
      stdio: 'inherit',
      cwd: ROOT,
    },
  );

  if (result.status !== 0) {
    fail(`Failed to extract installed game runtime from ${asarPath}`);
  }

  return extractDir;
}

function readText(filePath) {
  ensureExists(filePath, 'Required extracted runtime file');
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function readDistElectronJsBundle(extractDir) {
  const distElectronDir = path.join(extractDir, 'dist-electron');
  const jsFiles = fs
    .readdirSync(distElectronDir)
    .filter((fileName) => fileName.endsWith('.js'))
    .sort();

  return jsFiles
    .map((fileName) => readText(path.join(distElectronDir, fileName)))
    .join('\n');
}

function extractSummary(extractDir, gameDir, asarPath) {
  const packageJsonPath = path.join(extractDir, 'package.json');
  const mainIndexPath = path.join(
    extractDir,
    'dist-electron',
    'main',
    'index.js',
  );
  const gameJsPath = path.join(extractDir, 'dist-electron', 'Game.js');

  const packageJson = readJson(packageJsonPath);
  const mainIndex = readText(mainIndexPath);
  const gameJs = readText(gameJsPath);
  const runtimeText = readDistElectronJsBundle(extractDir);

  const buildVersion = mainIndex.match(/const ce="([^"]+)"/)?.[1] ?? null;
  const forgeLowPenalty = /forgeWorks\.heat>=2&&[te]\.forgeWorks\.heat<=3/.test(
    runtimeText,
  );
  const forgeRecommendFusionThrough4 =
    /forgeWorks\.heat<=4\?[te]\.recommendedTechniqueTypes/.test(runtimeText);

  return {
    gameDir,
    appAsarPath: asarPath,
    extractedDir: extractDir,
    gameVersion: packageJson.version ?? null,
    buildVersion,
    runtimeBehavior: {
      writesRelativeSettingsJson: mainIndex.includes('k="./settings.json"'),
      supportsDisableSteamSentinel: mainIndex.includes('disable_steam'),
      restartsThroughSteamByDefault: mainIndex.includes(
        'Restarting app through Steam...',
      ),
    },
    forge: {
      lowControlPenaltyHeat: forgeLowPenalty ? [2, 3] : null,
      recommendsFusionThroughHeat: forgeRecommendFusionThrough4 ? 4 : null,
    },
    modApi: {
      hasRootStateSubscribe: runtimeText.includes(
        'subscribe:e=>{let t=window.gameStore',
      ),
      hasRootStateSnapshot: runtimeText.includes(
        'getGameStateSnapshot:()=>window.gameStore?.getState()??null',
      ),
      hasInjectUI: runtimeText.includes('injectUI:('),
      hasOnReduxActionHook: runtimeText.includes('onReduxAction:'),
      hasHarmonyConfigs: gameJs.includes('harmonyConfigs'),
      hasItemTypeToHarmonyType: gameJs.includes('itemTypeToHarmonyType'),
      hasRecipeConditionEffects: gameJs.includes('recipeConditionEffects'),
      hasCraftingTechniques: gameJs.includes('craftingTechniques'),
      hasGetVariablesFromCraftingEntity: gameJs.includes(
        'getVariablesFromCraftingEntity',
      ),
      hasEvaluateCraftingCondition: gameJs.includes(
        'evaluateCraftingCondition',
      ),
    },
    crafting: {
      hasRecipeBestCompletionTracking:
        runtimeText.includes('basicBestCompletion') &&
        runtimeText.includes('perfectBestCompletion') &&
        runtimeText.includes('sublimeBestCompletion'),
      instantCraftMaterialRefundCapPercent: runtimeText.includes(
        'Math.min((n-1)*20,80)',
      )
        ? 80
        : null,
      hasPoolCostFlatStat: runtimeText.includes('poolCostFlat'),
    },
  };
}

function printUsage() {
  console.log(`Usage:
  node scripts/installed-game-runtime.js summary
  node scripts/installed-game-runtime.js extract
  node scripts/installed-game-runtime.js path
  node scripts/installed-game-runtime.js grep <pattern>

Environment:
  AFNM_GAME_DIR=/absolute/path/to/Ascend From Nine Mountains`);
}

function main() {
  const command = process.argv[2] || 'summary';
  const pattern = process.argv[3];
  const gameDir = getGameDir();
  const asarPath = getAppAsarPath(gameDir);
  ensureExists(gameDir, 'Installed game directory');
  ensureExists(asarPath, 'Installed app.asar');

  const extractDir = extractRuntime(
    asarPath,
    getExtractDir(getCacheFingerprint(asarPath)),
  );

  switch (command) {
    case 'summary': {
      const summary = extractSummary(extractDir, gameDir, asarPath);
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    case 'extract':
    case 'path': {
      console.log(extractDir);
      return;
    }
    case 'grep': {
      if (!pattern) {
        fail('Missing grep pattern.');
      }
      const result = childProcess.spawnSync(
        'rg',
        ['-n', pattern, path.join(extractDir, 'dist-electron')],
        {
          cwd: ROOT,
          stdio: 'inherit',
        },
      );
      process.exit(result.status ?? 1);
    }
    case 'help':
    case '--help':
    case '-h': {
      printUsage();
      return;
    }
    default:
      fail(`Unknown command: ${command}`);
  }
}

main();
