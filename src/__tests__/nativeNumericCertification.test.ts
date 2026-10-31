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

// Exercise the actual browser extraction seam without a live ModAPI provider.
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

const fields = [
  'successChance',
  'stabilityCost',
  'cooldown',
  'poolCost',
  'currentCooldown',
  'minStability',
  'dropletCost',
  'toxicityCost',
] as const;
const invalid = ['0.5', false, {}, [], null, NaN, Infinity, -Infinity];
const state = () => new CraftingState({ qi: 100, stability: 10 });
const payload = {
  name: 'Probe',
  type: 'fusion',
  poolCost: 0,
  stabilityCost: 10,
  cooldown: 0,
  currentCooldown: 0,
  successChance: 1,
  effects: [{ kind: 'completion', amount: { value: 100 } }],
};
const extracted = (field: string, value: unknown) =>
  convertGameTechniques([
    { ...payload, [field]: value },
  ] as unknown as CraftingTechnique[])[0];
const configFor = (skill: ReturnType<typeof extracted>) =>
  retargetConfig(skill, {
    maxCompletion: 100,
    maxPerfection: 0,
    targetPerfection: 0,
  });
const settings = { timeBudgetMs: 10000, maxNodes: 1000 };

test.each(['buffCost', 'buffRequirement', 'maxStacks'] as const)(
  'related nested numeric field %s already rejects malformed values',
  (field) => {
    const native = (value: unknown) =>
      field === 'maxStacks'
        ? {
            effects: [
              { kind: 'createBuff', buff: { name: 'Focus', maxStacks: value } },
            ],
          }
        : { [field]: { buff: { name: 'Focus' }, amount: value } };
    for (const value of invalid)
      expect(unsupportedNativeTechnique(native(value))).toBeDefined();
    expect(unsupportedNativeTechnique(native(0))).toBeUndefined();
  },
);

describe.each(fields)('native numeric field %s', (field) => {
  test.each(invalid.map((value, index) => ({ value, index })))(
    'rejects malformed value case $index before certification',
    ({ value }) => {
      const skill = retargetSkill({ nativeTechnique: { [field]: value } });
      expect(unsupportedNativeTechnique(skill.nativeTechnique)).toBe(
        `Unsupported native availability field: ${field}`,
      );
      expect(
        applySkillOutcomes(state(), skill, configFor(skill)),
      ).toMatchObject({ outcomes: [], unresolvedProbability: 1 });
    },
  );
  test('preserves omitted/undefined fields and finite zero/decimal values', () => {
    expect(unsupportedNativeTechnique({})).toBeUndefined();
    for (const value of [undefined, 0, 0.5, 10])
      expect(unsupportedNativeTechnique({ [field]: value })).toBeUndefined();
  });
});

test.each(['successChance', 'stabilityCost', 'cooldown'])(
  'malformed extracted %s cannot yield an executable recommendation',
  (field) => {
    const skill = extracted(field, '0.5');
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
    expect(result.expectedFinalState).toBeUndefined();
    expect(result.blockedReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'unresolved',
          details: `Unsupported native availability field: ${field}`,
        }),
      ]),
    );
  },
);

test.each([NaN, Infinity, -Infinity])(
  'nonfinite chance remains blocked through JSON replay and worker transport: %s',
  (value) => {
    const config = configFor(extracted('successChance', value));
    const replay = reviveConfigSnapshot(
      JSON.parse(JSON.stringify(buildConfigSnapshot(config))),
    );
    expect(applySkillOutcomes(state(), replay.skills[0], replay)).toMatchObject(
      { outcomes: [], unresolvedProbability: 1 },
    );
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
      reviveSearchInput(
        JSON.parse(JSON.stringify(serializeSearchInput(input))),
      ),
    );
    expect(result.recommendation).toBeNull();
  },
);

test.each([0, 0.5, 1])(
  'valid extracted successChance %s retains its probability',
  (value) => {
    const skill = extracted('successChance', value);
    const result = applySkillOutcomes(
      state(),
      skill,
      configFor(skill),
      [],
      100,
      'neutral',
    );
    expect(result.unresolvedProbability).toBe(0);
    expect(
      result.outcomes
        .filter((o) => o.state.completion >= 100)
        .reduce((sum, o) => sum + o.probability, 0),
    ).toBeCloseTo(value, 12);
  },
);

test('a malformed unused alternative does not poison a valid safe action', () => {
  const bad = extracted('successChance', '0.5');
  const good = { ...extracted('successChance', 1), key: 'good', name: 'Good' };
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
  expect(result.recommendation?.projectedSuccessChance).toBe(1);
});
