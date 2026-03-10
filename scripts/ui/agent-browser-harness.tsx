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

resetSettings();

(window as any).craftBuddyDebug = {
  exportOptimizerReplaySnapshot: async () => {},
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
} as any;

const harnessParams = new URLSearchParams(window.location.search);
const harnessState = harnessParams.get('state') || 'default';
const harnessCompactMode = harnessParams.get('compact');

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
        <div style={{ width: 560 }}>
          <RecommendationPanel
            result={
              harnessState === 'loading' || harnessState === 'loading-auto'
                ? null
                : fixtureResult
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
            version="4.1.1"
          />
        </div>
      </div>
    </CraftBuddyThemeProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<Harness />);
