import React from 'react';
import ReactDOM from 'react-dom/client';
import { version } from '../../package.json';
import { RecommendationPanel } from '../../src/ui/RecommendationPanel';
import { CraftBuddyThemeProvider } from '../../src/ui/ThemeProvider';
import {
  loadSettings,
  saveSettings,
  resetSettings,
  DEFAULT_AUTO_CRAFT_POLICY,
  type AutoCraftPolicy,
  type CraftBuddySettings,
} from '../../src/settings';
import { type AutoCraftUiState } from '../../src/settings/autoCraft';
import {
  computeOverlayLayout,
  isRectInOverlayHudCluster,
  unionOverlayRects,
  type OverlayRectLike,
} from '../../src/utils/overlayLayout';
import {
  BuffType,
  type HarmonyType,
  type OutcomeProjection,
  type SearchResult,
  type SkillDefinition,
} from '../../src/optimizer';
import { SettingsBody } from '../../src/ui/SettingsPanel';

resetSettings();

Object.assign(window, {
  craftBuddyDebug: {
    exportOptimizerReplaySnapshot: async () => ({
      copied: true,
      downloaded: false,
    }),
  },
});

// Standalone placeholder icons: no installed game files or external network.
function techniqueIcon(color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#1a1714"/><path d="M14 47V34l10-8 8-16 8 16 10 8v13Z" fill="${color}" stroke="#e3c27a" stroke-width="2"/><path d="M20 47h24M24 39h16M28 31h8" stroke="#e8d4a0" stroke-width="2"/></svg>`)}`;
}

function skill(
  name: string,
  type: SkillDefinition['type'],
  qiCost: number,
  stabilityCost: number,
): SkillDefinition {
  return {
    name,
    key: name.toLowerCase().replaceAll(' ', '_'),
    type,
    qiCost,
    stabilityCost,
    baseCompletionGain: 0,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 0,
    icon: techniqueIcon(
      type === 'refine' ? '#029ab5' : type === 'fusion' ? '#018f01' : '#cc8800',
    ),
  };
}

/**
 * Outcome projection fixtures.
 *
 * These mirror the shape `src/optimizer/search` publishes on `SearchResult`; the
 * harness never derives band numbers itself, exactly like the panel.
 */
const perfectionBoundProjection: OutcomeProjection = {
  tier: 'perfect',
  optimisticTier: 'sublime',
  targetTier: 'sublime',
  completion: {
    value: 260,
    bands: 2,
    requiredBands: 2,
    nextThreshold: 390,
    pointsToNextBand: 130,
    bonusChance: 0.24,
  },
  perfection: {
    value: 118,
    bands: 1,
    requiredBands: 2,
    nextThreshold: 230,
    pointsToNextBand: 112,
    bonusChance: 0.42,
  },
  bindingBar: 'perfection',
  willAutoFinish: false,
};

const autoFinishProjection: OutcomeProjection = {
  tier: 'sublime',
  optimisticTier: 'sublime',
  targetTier: 'sublime',
  completion: {
    value: 452,
    bands: 3,
    requiredBands: 2,
    nextThreshold: 620,
    pointsToNextBand: 168,
    bonusChance: 0.11,
  },
  perfection: {
    value: 318,
    bands: 2,
    requiredBands: 2,
    nextThreshold: 390,
    pointsToNextBand: 72,
    bonusChance: 0.35,
  },
  bindingBar: 'none',
  willAutoFinish: true,
};

type HarnessResult = SearchResult & {
  status?: 'live' | 'blocked' | 'autoResolved';
};
const fixtureResult: HarnessResult = {
  recommendation: {
    skill: skill('Forceful Stabilize', 'stabilize', 88, 0),
    expectedGains: { completion: 0, perfection: 0, stability: 27 },
    immediateGains: { completion: 0, perfection: 0, stability: 27 },
    effectiveCosts: { qi: 88, stability: 0 },
    score: 100,
    reasoning: 'Restore stability for more actions',
    followUpSkill: {
      name: 'Simple Refine',
      type: 'refine',
      expectedGains: { completion: 0, perfection: 9, stability: 0 },
      immediateGains: { completion: 0, perfection: 10, stability: 0 },
      effectiveCosts: { qi: 18, stability: 10 },
    },
  },
  alternativeSkills: [
    {
      skill: skill('Simple Refine', 'refine', 18, 10),
      expectedGains: { completion: 0, perfection: 9, stability: 0 },
      immediateGains: { completion: 0, perfection: 10, stability: 0 },
      effectiveCosts: { qi: 18, stability: 10 },
      score: 65,
      qualityRating: 35,
      reasoning: 'Immediate perfection, but runway is thin',
    },
    {
      skill: skill('Simple Fusion', 'fusion', 0, 10),
      expectedGains: { completion: 9, perfection: 0, stability: 0 },
      immediateGains: { completion: 10, perfection: 0, stability: 0 },
      effectiveCosts: { qi: 0, stability: 10 },
      score: 60,
      qualityRating: 0,
      reasoning: 'Build completion first',
    },
  ],
  status: 'live',
  isTerminal: false,
  targetsMet: false,
  optimalRotation: [
    'Forceful Stabilize',
    'Simple Refine',
    'Simple Refine',
    'Simple Fusion',
  ],
  expectedFinalState: {
    completion: 452,
    perfection: 318,
    stability: 0,
    maxStability: 51,
    qi: 0,
    turnsRemaining: 4,
  },
  outcomeProjection: perfectionBoundProjection,
};

/**
 * A gated-technique setup turn: weak gains now, the gated technique unlocked next.
 *
 * 0.7.6 renamed this technique to "Strive for Completion" while keeping the
 * internal key `false_fusion`, so the fixture carries both to prove the panel
 * shows the player-facing label rather than titlecasing the key.
 */
const setupFixtureResult: HarnessResult = {
  ...fixtureResult,
  recommendation: {
    ...fixtureResult.recommendation!,
    immediateGains: { completion: 34, perfection: 0, stability: 0 },
    expectedGains: { completion: 31, perfection: 0, stability: 0 },
    reasoning: 'Push completion to the gate instead of banking perfection',
    setupFor: {
      techniqueKey: 'false_fusion',
      techniqueName: 'Strive for Completion',
      reason:
        'Reaching 100% completion unlocks Strive for Completion, which converts the overflow into perfection next turn.',
    },
  },
};

/** The craft has already met every band, so the game resolves it by itself. */
const autoFinishFixtureResult: HarnessResult = {
  ...fixtureResult,
  outcomeProjection: autoFinishProjection,
  status: 'autoResolved',
  recommendation: null,
  isTerminal: true,
  targetsMet: true,
};

const failedAutoFinishFixtureResult: HarnessResult = {
  ...autoFinishFixtureResult,
  outcomeProjection: {
    ...autoFinishProjection,
    tier: 'failed',
    optimisticTier: 'failed',
    completion: {
      ...autoFinishProjection.completion,
      value: 0,
      bands: 0,
      nextThreshold: 100,
      pointsToNextBand: 100,
      bonusChance: 0,
    },
    bindingBar: 'completion',
  },
};

/**
 * Pre-0.7.5 replay snapshot: no `outcomeProjection` at all. The panel must fall
 * back to the legacy layout rather than inventing thresholds.
 */
const legacyFixtureResult: HarnessResult = {
  ...fixtureResult,
  outcomeProjection: undefined,
};

function buildFixtureResult(state: string): HarnessResult {
  switch (state) {
    case 'chance':
      return {
        ...fixtureResult,
        recommendation: {
          ...fixtureResult.recommendation!,
          skill: skill('Simple Refine', 'refine', 18, 10),
          immediateGains: { completion: 0, perfection: 10, stability: 0 },
          expectedGains: { completion: 0, perfection: 5, stability: 0 },
          effectiveCosts: { qi: 18, stability: 10 },
          projectedSuccessChance: 0.5,
          reasoning:
            'Expected gains account for the technique’s 50% success chance.',
        },
      };
    case 'outcome-setup':
      return setupFixtureResult;
    case 'outcome-autofinish':
    case 'auto-resolved':
      return autoFinishFixtureResult;
    case 'outcome-failed':
      return failedAutoFinishFixtureResult;
    case 'targets-met':
      return {
        ...fixtureResult,
        status: 'live',
        targetsMet: true,
        outcomeProjection: { ...autoFinishProjection, willAutoFinish: false },
      };
    case 'blocked':
    case 'blocked-empty':
      return {
        ...fixtureResult,
        status: 'blocked',
        recommendation: null,
        alternativeSkills: [],
        isTerminal: true,
        blockedReasons:
          state === 'blocked-empty'
            ? []
            : [
                {
                  skillName: 'False Fusion',
                  displayName: 'Strive for Completion',
                  reason: 'qi',
                  details: 'Needs 18 Qi; 6 available.',
                },
                {
                  skillName: 'Forceful Stabilize',
                  reason: 'cooldown',
                  details: 'Available in 2 turns.',
                },
              ],
      };
    case 'long-name':
      return {
        ...fixtureResult,
        recommendation: {
          ...fixtureResult.recommendation!,
          skill: {
            ...fixtureResult.recommendation!.skill,
            name: 'False Fusion',
            displayName:
              'Strive for Completion — Ninefold Heavenly Crucible Method',
          },
        },
      };
    case 'outcome-legacy':
      return legacyFixtureResult;
    default:
      return fixtureResult;
  }
}

const harnessParams = new URLSearchParams(window.location.search);
const harnessState = harnessParams.get('state') || 'default';
const harnessCompactMode = harnessParams.get('compact');
const harnessScene = harnessParams.get('scene') || 'default';

function parseHarnessViewport(value: string | null): {
  width: number;
  height: number;
} {
  const match = value?.match(/^(\d{3,4})x(\d{3,4})$/i);
  if (!match) {
    return { width: 975, height: 768 };
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

const harnessViewport = parseHarnessViewport(harnessParams.get('viewport'));
/** Selected harmony, so the harness can show any of the nine types. */
const harnessHarmony = (harnessParams.get('harmony') ||
  'resonance') as HarmonyType;

function buildGameHudRects(viewport: { width: number; height: number }): {
  progressRects: OverlayRectLike[];
  supplementalRects: OverlayRectLike[];
} {
  const topHudWidth = Math.min(340, Math.round(viewport.width * 0.35));
  const midHudWidth = Math.min(300, Math.round(viewport.width * 0.28));
  const bottomHudWidth = Math.min(520, Math.round(viewport.width * 0.51));

  const progressRects = [
    {
      top: 20,
      left: 20,
      right: 20 + topHudWidth,
      bottom: 286,
      width: topHudWidth,
      height: 266,
    },
  ];

  const supplementalRects = [
    {
      top: 288,
      left: 30,
      right: 30 + midHudWidth,
      bottom: 430,
      width: midHudWidth,
      height: 142,
    },
    {
      top: viewport.height - 170,
      left: 16,
      right: 16 + bottomHudWidth,
      bottom: viewport.height - 18,
      width: bottomHudWidth,
      height: 152,
    },
    {
      top: 18,
      left: viewport.width - 106,
      right: viewport.width - 30,
      bottom: 58,
      width: 76,
      height: 40,
    },
  ];

  return {
    progressRects,
    supplementalRects,
  };
}

function FakeHudBlock({
  left,
  top,
  width,
  height,
  children,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        borderRadius: 18,
        border: '1px solid rgba(235, 197, 129, 0.38)',
        background:
          'linear-gradient(180deg, rgba(17, 16, 23, 0.9), rgba(8, 8, 13, 0.88))',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.05), 0 16px 30px rgba(0,0,0,0.24)',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

const CRAFT_ENDING_POLICY: AutoCraftPolicy = 'allowCraftEnding';
const ITEM_POLICY: AutoCraftPolicy = 'includeItems';

type AutoModePhaseFixture = Omit<
  AutoCraftUiState,
  'effectivePolicy' | 'nativeAutoUseActive'
> & {
  effectivePolicy?: AutoCraftUiState['effectivePolicy'];
  nativeAutoUseActive?: boolean;
};

function buildAutoModeFixture(state: string): AutoCraftUiState {
  const fixture = buildAutoModePhaseFixture(state);
  return {
    ...fixture,
    effectivePolicy: fixture.effectivePolicy ?? fixture.policy,
    nativeAutoUseActive: fixture.nativeAutoUseActive ?? false,
  };
}

function buildAutoModePhaseFixture(state: string): AutoModePhaseFixture {
  switch (state) {
    case 'auto-ready':
      return {
        policy: 'techniquesOnly',
        armed: true,
        phase: 'ready',
        tone: 'active',
        statusTitle: 'Ready to act',
        statusDetail: 'Preparing to use Simple Fusion.',
        lastActionName: 'Forceful Stabilize',
        canArm: false,
        canStop: true,
        isRunning: true,
        stopRequested: false,
      };
    case 'auto-waiting':
      return {
        policy: CRAFT_ENDING_POLICY,
        armed: true,
        phase: 'waiting_for_state',
        tone: 'active',
        statusTitle: 'Waiting for game state',
        statusDetail:
          'Waiting for Simple Fusion to advance the craft before continuing.',
        lastActionName: 'Simple Fusion',
        canArm: false,
        canStop: true,
        isRunning: true,
        stopRequested: false,
      };
    case 'auto-stopping':
      return {
        policy: ITEM_POLICY,
        armed: true,
        phase: 'stop_requested',
        tone: 'warning',
        statusTitle: 'Stop requested',
        statusDetail: 'Auto mode will stop after the current action resolves.',
        lastActionName: 'Use Spirit Dew',
        canArm: false,
        canStop: true,
        isRunning: true,
        stopRequested: true,
      };
    case 'auto-native-autouse':
      return {
        policy: ITEM_POLICY,
        effectivePolicy: CRAFT_ENDING_POLICY,
        armed: true,
        phase: 'ready',
        tone: 'active',
        statusTitle: 'Ready to act',
        statusDetail: 'Preparing to use Simple Fusion.',
        lastActionName: 'Forceful Stabilize',
        canArm: false,
        canStop: true,
        isRunning: true,
        stopRequested: false,
        nativeAutoUseActive: true,
        policyNotice:
          'Your crafting auto-use loadout (2 slots) already applies items before each technique, so auto mode is using techniques only to avoid consuming them twice.',
      };
    case 'auto-error':
      return {
        policy: ITEM_POLICY,
        armed: false,
        phase: 'error',
        tone: 'error',
        statusTitle: 'Auto mode error',
        statusDetail:
          'Could not find a visible game control for Use Spirit Dew. Auto mode stopped before sending another input.',
        lastActionName: 'Use Spirit Dew',
        canArm: true,
        canStop: false,
        isRunning: false,
        stopRequested: false,
      };
    case 'loading-auto':
      return {
        policy: CRAFT_ENDING_POLICY,
        armed: true,
        phase: 'calculating',
        tone: 'active',
        statusTitle: 'Calculating next step',
        statusDetail:
          'Auto mode is waiting for CraftBuddy to finish calculating before acting.',
        lastActionName: 'Simple Fusion',
        canArm: false,
        canStop: true,
        isRunning: false,
        stopRequested: false,
      };
    default:
      return {
        policy: DEFAULT_AUTO_CRAFT_POLICY,
        armed: false,
        phase: 'off',
        tone: 'neutral',
        statusTitle: 'Auto mode off',
        statusDetail:
          'Enable auto mode to execute the optimizer recommendation each turn.',
        canArm: true,
        canStop: false,
        isRunning: false,
        stopRequested: false,
      };
  }
}

function Harness() {
  const [fixtureState, setFixtureState] = React.useState(harnessState);
  const [autoMode, setAutoMode] = React.useState(() =>
    buildAutoModeFixture(harnessState),
  );
  const [settings, setSettings] = React.useState<CraftBuddySettings>(() => {
    const baseSettings = loadSettings();
    return saveSettings({
      ...baseSettings,
      compactMode:
        harnessCompactMode === '1'
          ? true
          : harnessCompactMode === '0'
            ? false
            : baseSettings.compactMode,
    });
  });

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyM') {
        event.preventDefault();
        setSettings(saveSettings({ compactMode: !settings.compactMode }));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [settings.compactMode]);

  React.useEffect(() => {
    if (harnessState !== 'stale-settings') return;
    const timer = window.setTimeout(
      () => setSettings(saveSettings({ compactMode: true })),
      1500,
    );
    return () => window.clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    // A narrow, explicit browser-test seam; no production debug API involved.
    Object.assign(window, { craftBuddyHarness: { setFixtureState } });
  }, []);

  const panel = (
    <RecommendationPanel
      result={
        fixtureState === 'loading' || fixtureState === 'loading-auto'
          ? null
          : buildFixtureResult(fixtureState)
      }
      currentCompletion={260}
      currentPerfection={118}
      targetCompletion={230}
      targetPerfection={230}
      maxCompletionCap={620}
      maxPerfectionCap={620}
      currentStability={30}
      currentMaxStability={57}
      targetStability={60}
      currentCondition="neutral"
      nextConditions={['positive', 'veryPositive', 'neutral']}
      currentToxicity={0}
      maxToxicity={100}
      craftingType={harnessHarmony}
      settings={settings}
      onSettingsChange={setSettings}
      settingsStale={harnessState === 'stale-settings'}
      onRecalculate={() => {}}
      isCalculating={
        fixtureState === 'loading' || fixtureState === 'loading-auto'
      }
      onRecommendationAction={() => {}}
      autoMode={autoMode}
      onAutoModeArm={() => setAutoMode(buildAutoModeFixture('auto-ready'))}
      onAutoModeStop={() =>
        setAutoMode({
          ...buildAutoModeFixture('default'),
          phase: 'stopped',
          statusTitle: 'Stopped',
          statusDetail: 'Stopped from CraftBuddy panel.',
        })
      }
      onAutoModePolicyChange={(policy) =>
        setAutoMode((previous) => ({
          ...previous,
          policy,
          effectivePolicy:
            previous.nativeAutoUseActive && policy === 'includeItems'
              ? 'allowCraftEnding'
              : policy,
        }))
      }
      version={version}
    />
  );

  if (harnessScene === 'options') {
    return (
      <CraftBuddyThemeProvider>
        <div style={{ padding: 24, maxWidth: 560, background: '#2a2520' }}>
          <SettingsBody onSettingsChange={setSettings} version={version} />
        </div>
      </CraftBuddyThemeProvider>
    );
  }

  if (harnessScene === 'gamehud') {
    const { progressRects, supplementalRects } =
      buildGameHudRects(harnessViewport);
    const progressRect = unionOverlayRects(progressRects);
    const occupiedRect = unionOverlayRects([
      ...progressRects,
      ...supplementalRects.filter((rect) =>
        isRectInOverlayHudCluster({
          rect,
          progressRect,
          viewportWidth: harnessViewport.width,
        }),
      ),
    ]);
    const layout = computeOverlayLayout({
      viewportWidth: harnessViewport.width,
      viewportHeight: harnessViewport.height,
      occupiedRect,
      compact: settings.compactMode,
    });

    return (
      <CraftBuddyThemeProvider>
        <div
          style={{
            minHeight: '100vh',
            padding: '24px',
            background:
              'radial-gradient(circle at 20% 18%, rgba(233, 191, 117, 0.18), transparent 24%), linear-gradient(135deg, #221a18 0%, #3a2d22 35%, #121520 100%)',
            boxSizing: 'border-box',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div
            data-testid="gamehud-scene"
            style={{
              position: 'relative',
              width: harnessViewport.width,
              height: harnessViewport.height,
              borderRadius: 24,
              overflow: 'hidden',
              border: '1px solid rgba(255, 223, 160, 0.18)',
              background:
                'radial-gradient(circle at 56% 35%, rgba(255, 223, 160, 0.3), transparent 18%), radial-gradient(circle at 70% 20%, rgba(150, 206, 255, 0.16), transparent 20%), linear-gradient(180deg, rgba(60, 44, 30, 0.92) 0%, rgba(28, 20, 18, 0.96) 100%)',
              boxShadow: '0 20px 46px rgba(0, 0, 0, 0.3)',
            }}
          >
            <FakeHudBlock left={20} top={20} width={340} height={266}>
              <div
                style={{
                  padding: '18px 18px 14px',
                  color: '#f3e9d7',
                  fontSize: 18,
                  fontWeight: 700,
                }}
              >
                Craft Status
              </div>
              {['Completion', 'Perfection', 'Stability', 'Condition'].map(
                (label, index) => (
                  <div
                    key={label}
                    style={{
                      padding: '0 18px',
                      marginTop: index === 0 ? 0 : 12,
                    }}
                  >
                    <div
                      style={{
                        color: '#f0dcc1',
                        fontSize: 15,
                        marginBottom: 6,
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        height: 14,
                        borderRadius: 999,
                        background: 'rgba(255,255,255,0.12)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: ['78%', '54%', '91%', '36%'][index],
                          height: '100%',
                          background:
                            index === 2
                              ? 'linear-gradient(90deg, #e9c23d, #ffe77a)'
                              : 'linear-gradient(90deg, #8fd7ff, #d9f0ff)',
                        }}
                      />
                    </div>
                  </div>
                ),
              )}
            </FakeHudBlock>

            <FakeHudBlock left={30} top={288} width={270} height={142}>
              <div
                style={{
                  padding: '14px 16px 8px',
                  color: '#f3e9d7',
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                Buffs and Forecast
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  padding: '0 16px',
                }}
              >
                {['Heat', 'Tidal', 'Control', 'Good'].map((token) => (
                  <div
                    key={token}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 999,
                      fontSize: 12,
                      color: '#f7efe2',
                      background: 'rgba(117, 170, 228, 0.18)',
                      border: '1px solid rgba(117, 170, 228, 0.35)',
                    }}
                  >
                    {token}
                  </div>
                ))}
              </div>
            </FakeHudBlock>

            <FakeHudBlock
              left={16}
              top={harnessViewport.height - 170}
              width={Math.min(520, Math.round(harnessViewport.width * 0.51))}
              height={152}
            >
              <div
                style={{
                  padding: '14px 16px 10px',
                  color: '#f3e9d7',
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                Techniques
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 12,
                  padding: '0 16px 16px',
                }}
              >
                {new Array(8).fill(null).map((_, index) => (
                  <div
                    key={index}
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: '1px solid rgba(245, 203, 125, 0.45)',
                      background:
                        'linear-gradient(180deg, rgba(255, 204, 92, 0.2), rgba(117, 74, 15, 0.22))',
                    }}
                  />
                ))}
              </div>
            </FakeHudBlock>

            <div
              style={{
                position: 'absolute',
                top: 18,
                right: 30,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 76,
                height: 40,
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 700,
                color: '#f3ead7',
                background: 'rgba(19, 22, 31, 0.85)',
                border: '1px solid rgba(255, 215, 0, 0.22)',
                boxShadow: '0 10px 22px rgba(0, 0, 0, 0.22)',
              }}
            >
              Menu
            </div>

            <div
              id="craftbuddy-overlay"
              style={{
                position: 'absolute',
                top: layout.top,
                right: layout.right,
                width: layout.width,
                pointerEvents: 'none',
              }}
            >
              {panel}
            </div>

            <div
              data-testid="layout-metrics"
              style={{
                position: 'absolute',
                left: 24,
                bottom: 18,
                padding: '8px 12px',
                borderRadius: 999,
                fontSize: 12,
                color: '#ead8b2',
                background: 'rgba(8, 8, 12, 0.74)',
                border: '1px solid rgba(255, 215, 0, 0.18)',
              }}
            >
              {`scene ${harnessViewport.width}x${harnessViewport.height} | safe lane ${Math.round(layout.availableWidth)}px | panel ${Math.round(layout.width)}px`}
            </div>
          </div>
        </div>
      </CraftBuddyThemeProvider>
    );
  }

  return (
    <CraftBuddyThemeProvider>
      <div
        id="craftbuddy-overlay"
        style={{
          minHeight: '100vh',
          padding: '24px',
          background:
            'radial-gradient(circle at 20% 20%, rgba(213, 153, 64, 0.22), transparent 30%), linear-gradient(135deg, #271f1c 0%, #3d2f26 35%, #181827 100%)',
          boxSizing: 'border-box',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          data-testid="harness-lane"
          style={{
            width:
              Number(harnessParams.get('lane')) ||
              (settings.compactMode ? 320 : 560),
            maxWidth: '100%',
          }}
        >
          {panel}
        </div>
      </div>
    </CraftBuddyThemeProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<Harness />);
