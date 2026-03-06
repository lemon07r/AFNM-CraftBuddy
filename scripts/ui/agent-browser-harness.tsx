import React from 'react';
import ReactDOM from 'react-dom/client';
import { RecommendationPanel } from '../../src/ui/RecommendationPanel';
import { CraftBuddyThemeProvider } from '../../src/ui/ThemeProvider';
import {
  loadSettings,
  resetSettings,
  type CraftBuddySettings,
} from '../../src/settings';

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
    expectedGains: { completion: 0, perfection: 0, stability: 40 },
    immediateGains: { completion: 0, perfection: 0, stability: 40 },
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

function Harness() {
  const [settings, setSettings] = React.useState<CraftBuddySettings>(() =>
    loadSettings(),
  );

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
        <div style={{ width: 530 }}>
          <RecommendationPanel
            result={fixtureResult}
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
            version="3.5.24"
          />
        </div>
      </div>
    </CraftBuddyThemeProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<Harness />);
