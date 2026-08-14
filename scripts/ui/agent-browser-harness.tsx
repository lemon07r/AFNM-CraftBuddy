import React from 'react';
import ReactDOM from 'react-dom/client';
import { RecommendationPanel } from '../../src/ui/RecommendationPanel';
import { CraftBuddyThemeProvider } from '../../src/ui/ThemeProvider';
import {
  loadSettings,
  resetSettings,
  DEFAULT_AUTO_CRAFT_POLICY,
  type CraftBuddySettings,
} from '../../src/settings';
import { type AutoCraftUiState } from '../../src/settings/autoCraft';
import {
  computeOverlayLayout,
  isRectInOverlayHudCluster,
  unionOverlayRects,
  type OverlayRectLike,
} from '../../src/utils/overlayLayout';
import { type HarmonyType } from '../../src/optimizer';

resetSettings();

(window as any).craftBuddyDebug = {
  exportOptimizerReplaySnapshot: async () => {},
};

/**
 * Outcome projection fixtures.
 *
 * These mirror the shape `src/optimizer/search` publishes on `SearchResult`; the
 * harness never derives band numbers itself, exactly like the panel.
 */
const perfectionBoundProjection = {
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

const autoFinishProjection = {
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

const fixtureResult = {
  recommendation: {
    skill: {
      name: 'Forceful Stabilize',
      type: 'support',
      qiCost: 88,
      stabilityCost: 0,
    },
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
      skill: {
        name: 'Simple Refine',
        type: 'refine',
        qiCost: 18,
        stabilityCost: 10,
      },
      expectedGains: { completion: 0, perfection: 9, stability: 0 },
      immediateGains: { completion: 0, perfection: 10, stability: 0 },
      effectiveCosts: { qi: 18, stability: 10 },
      score: 65,
      qualityRating: 35,
      reasoning: 'Immediate perfection, but runway is thin',
    },
    {
      skill: {
        name: 'Simple Fusion',
        type: 'fusion',
        qiCost: 0,
        stabilityCost: 10,
      },
      expectedGains: { completion: 9, perfection: 0, stability: 0 },
      immediateGains: { completion: 10, perfection: 0, stability: 0 },
      effectiveCosts: { qi: 0, stability: 10 },
      score: 60,
      qualityRating: 0,
      reasoning: 'Build completion first',
    },
  ],
  isTerminal: false,
  targetsMet: false,
  optimalRotation: [
    'Forceful Stabilize',
    'Simple Refine',
    'Simple Refine',
    'Simple Fusion',
  ],
  expectedFinalState: {
    completion: 47,
    perfection: 37,
    stability: 0,
    maxStability: 51,
    qi: 0,
    turnsRemaining: 4,
  },
  outcomeProjection: perfectionBoundProjection,
} as any;

/**
 * A gated-technique setup turn: weak gains now, the gated technique unlocked next.
 *
 * 0.7.6 renamed this technique to "Strive for Completion" while keeping the
 * internal key `false_fusion`, so the fixture carries both to prove the panel
 * shows the player-facing label rather than titlecasing the key.
 */
const setupFixtureResult = {
  ...fixtureResult,
  recommendation: {
    ...fixtureResult.recommendation,
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
} as any;

/** The craft has already met every band, so the game resolves it by itself. */
const autoFinishFixtureResult = {
  ...fixtureResult,
  outcomeProjection: autoFinishProjection,
} as any;

/**
 * Pre-0.7.5 replay snapshot: no `outcomeProjection` at all. The panel must fall
 * back to the legacy layout rather than inventing thresholds.
 */
const legacyFixtureResult = {
  ...fixtureResult,
  outcomeProjection: undefined,
} as any;

function buildFixtureResult(state: string): unknown {
  switch (state) {
    case 'outcome-setup':
      return setupFixtureResult;
    case 'outcome-autofinish':
      return autoFinishFixtureResult;
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
/** Selected harmony, so the harness can show any of the seven types. */
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

function buildAutoModeFixture(state: string): AutoCraftUiState {
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
        policy: 'techniquesAndFinish',
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
        policy: 'fullActionSpace',
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
      // `policyNotice` / `nativeAutoUseActive` are supplied by the runtime
      // workstream's controller; the panel reads them structurally, so the
      // harness can exercise the row before that branch merges.
      return {
        policy: 'techniquesAndFinish',
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
          'Full action space downgraded to techniques: your crafting auto-use loadout already consumes Spirit Dew and Clear Mind Pill.',
      } as AutoCraftUiState;
    case 'auto-error':
      return {
        policy: 'fullActionSpace',
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
        policy: 'techniquesAndFinish',
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
  const [settings, setSettings] = React.useState<CraftBuddySettings>(() => {
    const baseSettings = loadSettings();
    return {
      ...baseSettings,
      compactMode:
        harnessCompactMode === '1'
          ? true
          : harnessCompactMode === '0'
            ? false
            : baseSettings.compactMode,
    };
  });

  const panel = (
    <RecommendationPanel
      result={
        harnessState === 'loading' || harnessState === 'loading-auto'
          ? null
          : (buildFixtureResult(harnessState) as any)
      }
      currentCompletion={20}
      currentPerfection={10}
      targetCompletion={60}
      targetPerfection={60}
      maxCompletionCap={60}
      maxPerfectionCap={60}
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
      onSearchSettingsChange={setSettings}
      isCalculating={
        harnessState === 'loading' || harnessState === 'loading-auto'
      }
      onRecommendationAction={() => {}}
      autoMode={buildAutoModeFixture(harnessState)}
      onAutoModeArm={() => {}}
      onAutoModeStop={() => {}}
      onAutoModePolicyChange={() => {}}
      version="6.3.1"
    />
  );

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
              style={{
                position: 'absolute',
                top: layout.top,
                right: layout.right,
                width: layout.width,
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
        <div style={{ width: 560 }}>{panel}</div>
      </div>
    </CraftBuddyThemeProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<Harness />);
