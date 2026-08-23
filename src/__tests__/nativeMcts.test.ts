import { BuffType, CraftingState } from '../optimizer/state';
import { OptimizerConfig, SkillDefinition } from '../optimizer/skills';
import { __testing as nativeMctsTesting } from '../optimizer/nativeMcts';

function createSkill(
  overrides: Partial<SkillDefinition> = {},
): SkillDefinition {
  return {
    name: 'Simple Fusion',
    key: 'simple_fusion',
    qiCost: 0,
    stabilityCost: 10,
    baseCompletionGain: 1,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1,
    type: 'fusion',
    scalesWithIntensity: true,
    ...overrides,
  };
}

function createConfig(
  overrides: Partial<OptimizerConfig> = {},
): OptimizerConfig {
  return {
    maxQi: 120,
    maxStability: 60,
    baseIntensity: 12,
    baseControl: 16,
    minStability: 0,
    defaultBuffMultiplier: 1.4,
    skills: [createSkill()],
    ...overrides,
  };
}

describe('native MCTS bridge', () => {
  it('serializes condition effects into compact Rust input', () => {
    const input = nativeMctsTesting.buildNativeMctsInput({
      state: new CraftingState({ qi: 100, stability: 60 }),
      config: createConfig({
        conditionEffectsData: {
          neutral: [],
          positive: [
            { kind: 'control', multiplier: 0.5 },
            { kind: 'pool', multiplier: 0.75 },
            { kind: 'chance', bonus: 0.1 },
          ],
          negative: [],
          veryPositive: [],
          veryNegative: [],
        },
      }),
      targetCompletion: 100,
      targetPerfection: 80,
      currentConditionType: 'positive',
      forecastedConditionTypes: ['neutral'],
    });

    expect(input.condition_effects.positive).toMatchObject({
      control_multiplier: 1.5,
      pool_cost_multiplier: 0.75,
      success_chance_bonus: 0.1,
    });
  });

  it('serializes harmony subsystem state with snake_case fields for Rust', () => {
    const input = nativeMctsTesting.buildNativeMctsInput({
      state: new CraftingState({
        qi: 100,
        stability: 60,
        harmony: 20,
        harmonyData: {
          alchemicalArts: {
            charges: ['fusion', 'refine'],
            lastCombo: ['fusion', 'refine', 'support'],
          },
          recommendedTechniqueTypes: ['support'],
          additionalData: {
            alchemicalReactionModifiers: {
              poolCostPercentage: 75,
              successChanceBonus: 0.25,
            },
          },
        },
      }),
      config: createConfig({
        isSublimeCraft: true,
        craftingType: 'alchemical',
      }),
      targetCompletion: 100,
      targetPerfection: 80,
    });

    expect(input.state.harmony_data.alchemical_arts).toEqual({
      charges: ['fusion', 'refine'],
      last_combo: ['fusion', 'refine', 'support'],
    });
    expect(input.state.harmony_data.alchemical_reaction_modifiers).toEqual({
      pool_cost_percentage: 75,
      success_chance_bonus: 0.25,
    });
  });

  it('sends item actions so both engines search the same action space', () => {
    // The bridge used to drop `actionKind === 'item'`, which left the Rust
    // engine planning without pills or reagents: the fast path was also the
    // less accurate one.
    const pill = createSkill({
      name: 'Qi Restoring Pill',
      key: 'qi_restoring_pill',
      qiCost: 0,
      stabilityCost: 0,
      baseCompletionGain: 0,
      type: 'support',
      scalesWithIntensity: false,
      actionKind: 'item',
      consumesTurn: false,
      itemName: 'Qi Restoring Pill',
      toxicityCost: 9,
      effects: [{ kind: 'pool', amount: { value: 40 } }],
    });
    const reagent = createSkill({
      name: 'Spirit Reagent',
      key: 'spirit_reagent',
      qiCost: 0,
      stabilityCost: 0,
      baseCompletionGain: 0,
      type: 'support',
      scalesWithIntensity: false,
      actionKind: 'item',
      consumesTurn: false,
      itemName: 'Spirit Reagent',
      reagentOnlyAtStepZero: true,
    });

    const input = nativeMctsTesting.buildNativeMctsInput({
      state: new CraftingState({
        qi: 100,
        stability: 60,
        items: new Map([
          ['qi_restoring_pill', 2],
          ['spirit_reagent', 1],
        ]),
        consumedPillsThisTurn: 1,
      }),
      config: createConfig({
        skills: [createSkill(), pill, reagent],
        pillsPerRound: 3,
      }),
      targetCompletion: 100,
      targetPerfection: 80,
    });

    expect(input.skills.map((skill) => skill.key)).toEqual([
      'simple_fusion',
      'qi_restoring_pill',
      'spirit_reagent',
    ]);
    // Cooldowns are positional, so the indices must line up with `skills`.
    expect(input.state.cooldowns).toHaveLength(3);

    const nativePill = input.skills[1];
    expect(nativePill?.action_kind).toBe('item');
    expect(nativePill?.consumes_turn).toBe(false);
    expect(nativePill?.item_name).toBe('Qi Restoring Pill');
    expect(nativePill?.effects).toEqual([
      { kind: 'pool', amount: { value: 40 } },
    ]);
    expect(input.skills[2]?.reagent_only_at_step_zero).toBe(true);

    expect(input.state.items).toEqual([
      { key: 'qi_restoring_pill', count: 2 },
      { key: 'spirit_reagent', count: 1 },
    ]);
    expect(input.state.consumed_pills_this_turn).toBe(1);
    expect(input.config.pills_per_round).toBe(3);
  });

  it('sends generic active buffs with their definitions', () => {
    const soulflame = {
      name: 'Soulflame',
      canStack: true,
      maxStacks: 5,
      effects: [
        {
          kind: 'perfection' as const,
          amount: { value: 4, scaling: 'stacks' },
        },
        { kind: 'addStack' as const, stacks: { value: -1 } },
      ],
    };

    const input = nativeMctsTesting.buildNativeMctsInput({
      state: new CraftingState({
        qi: 100,
        stability: 60,
        buffs: new Map([
          [
            'soulflame',
            { name: 'Soulflame', stacks: 3, definition: soulflame },
          ],
        ]),
      }),
      config: createConfig(),
      targetCompletion: 100,
      targetPerfection: 80,
    });

    expect(input.state.buffs).toEqual([
      {
        key: 'soulflame',
        name: 'Soulflame',
        stacks: 3,
        definition: soulflame,
      },
    ]);
  });

  it('serializes mastery and gating metadata for effect-driven techniques', () => {
    const gated = createSkill({
      name: 'False Fusion',
      key: 'false_fusion',
      baseCompletionGain: 0,
      scalesWithIntensity: false,
      buffRequirement: { buffName: 'false_fusion_ready', amount: 1 },
      buffCost: {
        buffName: 'false_fusion_ready',
        amount: 1,
        consumeAll: false,
      },
      masteryEntries: [{ kind: 'control', percentage: 25 }],
      mastery: {
        controlBonus: 0,
        intensityBonus: 0,
        poolCostReduction: 0.25,
        stabilityCostReduction: 0,
        successChanceBonus: 0,
        critChanceBonus: 0,
        critMultiplierBonus: 0,
      },
      isDisciplinedTouch: false,
    });

    const input = nativeMctsTesting.buildNativeMctsInput({
      state: new CraftingState({ qi: 100, stability: 60 }),
      config: createConfig({ skills: [gated] }),
      targetCompletion: 100,
      targetPerfection: 80,
    });

    const native = input.skills[0];
    expect(native?.buff_requirement).toEqual({
      buff_name: 'false_fusion_ready',
      amount: 1,
    });
    expect(native?.buff_cost).toEqual({
      buff_name: 'false_fusion_ready',
      amount: 1,
      consume_all: false,
    });
    expect(native?.mastery_entries).toEqual([
      { kind: 'control', percentage: 25 },
    ]);
    expect(native?.mastery?.poolCostReduction).toBe(0.25);
    expect(native?.is_disciplined_touch).toBe(false);
  });

  it('never sends an explicit null into the Rust payload', () => {
    // Real 0.7.5 technique data spells "no value" as an explicit `null`, and 188
    // of the game's 226 crafting skills carry `mastery: null`. serde treats a
    // present `null` as a value rather than a missing field, so a single one of
    // these rejected the entire MctsInput and silently cost the search its
    // native prior. The invariant is therefore "no null survives the bridge".
    const gameShaped = createSkill({
      ...({
        effects: [
          {
            kind: 'completion',
            magnitude: 12,
            // Nested nulls are just as fatal as top-level ones.
            equation: null,
            child: { kind: 'perfection', magnitude: null },
          },
        ],
        masteryEntries: null,
        mastery: null,
        grantedBuff: null,
        itemName: null,
      } as unknown as Partial<SkillDefinition>),
    });

    const input = nativeMctsTesting.buildNativeMctsInput({
      state: new CraftingState({ qi: 100, stability: 60 }),
      config: createConfig({ skills: [gameShaped] }),
      targetCompletion: 100,
      targetPerfection: 80,
    });

    const native = input.skills[0];
    expect(native?.mastery).toBeUndefined();
    expect(native?.mastery_entries).toBeUndefined();
    expect(native?.granted_buff).toBeUndefined();
    expect(native?.item_name).toBeUndefined();
    // Surviving keys keep their values; only the nullish ones are dropped.
    expect(native?.effects).toEqual([
      { kind: 'completion', magnitude: 12, child: { kind: 'perfection' } },
    ]);
    expect(JSON.stringify(input)).not.toContain('null');
  });

  it('omits internal_state entirely when a buff carries no state', () => {
    // `internal_state` is a plain map on the Rust side, not an Option, so a
    // present-but-undefined value fails `serde_wasm_bindgen` deserialization
    // of the whole MctsInput and silently costs the search its native prior.
    // (`Option` fields tolerate an explicit undefined; non-Option fields with
    // only `#[serde(default)]` do not.)
    const input = nativeMctsTesting.buildNativeMctsInput({
      state: new CraftingState({
        qi: 100,
        stability: 60,
        buffs: new Map([
          [
            'soulflame',
            {
              name: 'Soulflame',
              stacks: 3,
              definition: {
                name: 'Soulflame',
                canStack: true,
                effects: [],
              },
            },
          ],
        ]),
      }),
      config: createConfig(),
      targetCompletion: 100,
      targetPerfection: 80,
    });

    const buff = input.state.buffs[0];
    expect(buff).toBeTruthy();
    expect(Object.prototype.hasOwnProperty.call(buff, 'internal_state')).toBe(
      false,
    );

    // And the stateful case keeps the key with a real map.
    const withState = nativeMctsTesting.buildNativeMctsInput({
      state: new CraftingState({
        qi: 100,
        stability: 60,
        buffs: new Map([
          [
            'true_bifang_flame',
            {
              name: 'True Bifang Flame',
              stacks: 1,
              internalState: { blaze: 25 },
            },
          ],
        ]),
      }),
      config: createConfig(),
      targetCompletion: 100,
      targetPerfection: 80,
    });
    expect(withState.state.buffs[0]?.internal_state).toEqual({ blaze: 25 });
  });

  it('serializes the ambition band settings onto the wire', () => {
    const ambitious = nativeMctsTesting.buildNativeMctsInput({
      state: new CraftingState({ qi: 100, stability: 60 }),
      config: createConfig(),
      targetCompletion: 100,
      targetPerfection: 80,
      perfectionBandGoal: 4,
      completionBandCeiling: 2,
    });

    expect(ambitious.config.perfection_band_goal).toBe(4);
    expect(ambitious.config.completion_band_ceiling).toBe(2);

    // Omitted means auto, and auto is 0 on the wire so old engines and new
    // payloads agree on the pre-ambition behaviour.
    const auto = nativeMctsTesting.buildNativeMctsInput({
      state: new CraftingState({ qi: 100, stability: 60 }),
      config: createConfig(),
      targetCompletion: 100,
      targetPerfection: 80,
    });

    expect(auto.config.perfection_band_goal).toBe(0);
    expect(auto.config.completion_band_ceiling).toBe(0);
  });

  it('honors low explicit MCTS budgets for short searches', () => {
    const input = nativeMctsTesting.buildNativeMctsInput({
      state: new CraftingState({ qi: 100, stability: 60 }),
      config: createConfig(),
      targetCompletion: 100,
      targetPerfection: 80,
      search: {
        iterations: 48,
        maxNodes: 240,
        timeBudgetMs: 150,
      },
    });

    expect(input.search.iterations).toBe(48);
    expect(input.search.max_nodes).toBe(240);
    expect(nativeMctsTesting.deriveMctsIterations({ timeBudgetMs: 150 })).toBe(
      64,
    );
  });
});
