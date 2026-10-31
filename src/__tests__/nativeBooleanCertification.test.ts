import type { CraftingTechnique } from 'afnm-types';
import { convertGameTechniques } from '../modContent/craftStateExtraction';
import {
  buildConfigSnapshot,
  reviveConfigSnapshot,
} from '../modContent/replaySnapshot';
import { unsupportedNativeTechnique } from '../optimizer/nativeAvailability';
import { CraftingState } from '../optimizer/state';
import { applySkillOutcomes } from '../optimizer/skills';
import { findBestSkill } from '../optimizer/search';
import {
  runSearchBackendInput,
  serializeSearchInput,
  reviveSearchInput,
} from '../optimizer/searchBackend';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
beforeAll(() =>
  Object.defineProperty(globalThis, 'window', {
    value: {},
    configurable: true,
  }),
);
afterAll(() => {
  if (previousWindow)
    Object.defineProperty(globalThis, 'window', previousWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});
const flags = [
  'noMaxStabilityLoss',
  'noQiCost',
  'firstActionOnly',
  'disableAtMaxStacks',
] as const;
const badValues = [
  1,
  0,
  'true',
  'false',
  {},
  [],
  null,
  NaN,
  Infinity,
  -Infinity,
];
const state = () =>
  new CraftingState({ qi: 100, stability: 60, initialMaxStability: 60 });
const extracted = (
  value: unknown,
  name = 'Probe',
  flag: (typeof flags)[number] = 'noMaxStabilityLoss',
) =>
  convertGameTechniques([
    {
      name,
      type: 'support',
      poolCost: 0,
      stabilityCost: 0,
      cooldown: 0,
      currentCooldown: 0,
      successChance: 1,
      [flag]: value,
      effects: [{ kind: 'completion', amount: { value: 10 } }],
    },
  ] as unknown as CraftingTechnique[])[0];
const configFor = (skill: ReturnType<typeof extracted>) =>
  retargetConfig(skill, {
    maxCompletion: 100,
    maxPerfection: 0,
    targetPerfection: 0,
  });
const settings = { maxNodes: 1000, timeBudgetMs: 10000 };

test.each(flags)(
  'mechanics flag %s rejects non-booleans before transition certification',
  (flag) => {
    for (const value of badValues) {
      const skill = retargetSkill({ nativeTechnique: { [flag]: value } });
      expect(unsupportedNativeTechnique(skill.nativeTechnique)).toBe(
        `Unsupported native availability field: ${flag}`,
      );
      expect(
        applySkillOutcomes(state(), skill, configFor(skill)),
      ).toMatchObject({ outcomes: [], unresolvedProbability: 1 });
    }
  },
);
test.each(flags)(
  'mechanics flag %s accepts actual booleans and omission',
  (flag) => {
    for (const value of [undefined, false, true])
      expect(unsupportedNativeTechnique({ [flag]: value })).toBeUndefined();
    expect(unsupportedNativeTechnique({})).toBeUndefined();
  },
);
test.each([1, 'true', null, NaN])(
  'malformed extracted noMaxStabilityLoss=%s pauses rather than certifying decay',
  (value) => {
    const skill = extracted(value);
    expect(skill.preventsMaxStabilityDecay).not.toBe(true);
    expect(applySkillOutcomes(state(), skill, configFor(skill))).toMatchObject({
      outcomes: [],
      unresolvedProbability: 1,
    });
    const result = findBestSkill(
      state(),
      configFor(skill),
      100,
      0,
      false,
      2,
      'neutral',
      [],
      settings,
    );
    expect(result.recommendation).toBeNull();
    expect(result.blockedReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'unresolved',
          details: 'Unsupported native availability field: noMaxStabilityLoss',
        }),
      ]),
    );
  },
);
test.each([false, true])(
  'valid noMaxStabilityLoss=%s preserves actual max-stability behavior',
  (value) => {
    const skill = extracted(value);
    const result = applySkillOutcomes(state(), skill, configFor(skill));
    expect(result.unresolvedProbability).toBe(0);
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].state.maxStability).toBe(value ? 60 : 59);
    expect(result.outcomes[0].state.stability).toBe(value ? 60 : 59);
  },
);
test.each(
  flags.flatMap((flag) =>
    [NaN, Infinity, -Infinity].map((value) => ({ flag, value })),
  ),
)('JSON replay/worker cannot launder $flag=$value', ({ flag, value }) => {
  const config = configFor(extracted(value, 'Probe', flag));
  const replay = reviveConfigSnapshot(
    JSON.parse(JSON.stringify(buildConfigSnapshot(config))),
  );
  expect(
    (replay.skills[0].nativeTechnique as Record<string, unknown>)[flag],
  ).toBeNull();
  expect(applySkillOutcomes(state(), replay.skills[0], replay)).toMatchObject({
    outcomes: [],
    unresolvedProbability: 1,
  });
  const input = {
    state: state(),
    config,
    targetCompletion: 100,
    targetPerfection: 0,
    lookaheadDepth: 2,
    currentCondition: 'neutral' as const,
    forecast: [],
    searchConfig: settings,
  };
  const result = runSearchBackendInput(
    reviveSearchInput(JSON.parse(JSON.stringify(serializeSearchInput(input)))),
  );
  expect(result.recommendation).toBeNull();
  expect(
    result.blockedReasons?.some(
      (reason) =>
        reason.reason === 'unresolved' &&
        reason.details === `Unsupported native availability field: ${flag}`,
    ),
  ).toBe(true);
});
test.each(
  flags.flatMap((flag) => [false, true].map((value) => ({ flag, value }))),
)('JSON worker transport preserves valid $flag=$value', ({ flag, value }) => {
  const config = configFor(extracted(value, 'Probe', flag));
  const input = {
    state: state(),
    config,
    targetCompletion: 100,
    targetPerfection: 0,
    lookaheadDepth: 2,
    currentCondition: 'neutral' as const,
    forecast: [],
    searchConfig: settings,
  };
  const revived = reviveSearchInput(
    JSON.parse(JSON.stringify(serializeSearchInput(input))),
  );
  expect(
    (revived.config.skills[0].nativeTechnique as Record<string, unknown>)[flag],
  ).toBe(value);
  const result = runSearchBackendInput(revived);
  expect(result.recommendation).not.toBeNull();
  expect(result.recommendation?.planning?.transitionUnresolvedProbability).toBe(
    0,
  );
});
test('invalid unused flag does not block a valid alternative', () => {
  const bad = extracted('true');
  const good = extracted(true, 'Good');
  const result = findBestSkill(
    state(),
    { ...configFor(good), skills: [bad, good] },
    100,
    0,
    false,
    2,
    'neutral',
    [],
    settings,
  );
  expect(result.recommendation?.skill.key).toBe('good');
  expect(result.recommendation?.planning?.transitionUnresolvedProbability).toBe(
    0,
  );
});
