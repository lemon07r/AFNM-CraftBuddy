/**
 * Unit tests for CraftingState class
 */

import { CraftingState, BuffType } from '../optimizer/state';

describe('CraftingState', () => {
  describe('constructor', () => {
    it('should create state with default values', () => {
      const state = new CraftingState();
      
      expect(state.qi).toBe(0);
      expect(state.stability).toBe(0);
      expect(state.maxStability).toBe(60);
      expect(state.completion).toBe(0);
      expect(state.perfection).toBe(0);
      expect(state.controlBuffTurns).toBe(0);
      expect(state.intensityBuffTurns).toBe(0);
      expect(state.toxicity).toBe(0);
      expect(state.cooldowns.size).toBe(0);
    });

    it('should create state with provided values', () => {
      const state = new CraftingState({
        qi: 100,
        stability: 50,
        initialMaxStability: 60,
        completion: 30,
        perfection: 20,
        controlBuffTurns: 2,
        intensityBuffTurns: 0,
        toxicity: 10,
        maxToxicity: 100,
      });
      
      expect(state.qi).toBe(100);
      expect(state.stability).toBe(50);
      expect(state.completion).toBe(30);
      expect(state.perfection).toBe(20);
      expect(state.controlBuffTurns).toBe(2);
      expect(state.toxicity).toBe(10);
    });
  });

  describe('copy', () => {
    it('should create an independent copy', () => {
      const original = new CraftingState({
        qi: 100,
        stability: 50,
        completion: 30,
      });
      
      const copy = original.copy();
      
      expect(copy.qi).toBe(100);
      expect(copy.stability).toBe(50);
      expect(copy.completion).toBe(30);
      
      // Verify independence - modifying copy shouldn't affect original
      const modified = copy.copy({ qi: 50 });
      expect(modified.qi).toBe(50);
      expect(original.qi).toBe(100);
    });

    it('should apply overrides correctly', () => {
      const original = new CraftingState({
        qi: 100,
        stability: 50,
      });
      
      const modified = original.copy({
        qi: 80,
        completion: 25,
      });
      
      expect(modified.qi).toBe(80);
      expect(modified.stability).toBe(50); // Unchanged
      expect(modified.completion).toBe(25);
    });

    it('should clone tracked buff entries passed to constructor', () => {
      const sourceBuff = { name: 'focus', stacks: 2 };
      const state = new CraftingState({
        buffs: new Map([['focus', sourceBuff]]),
      });

      sourceBuff.stacks = 99;

      expect(state.getBuffStacks('focus')).toBe(2);
      expect(state.getBuff('focus')).not.toBe(sourceBuff);
    });

    it('should keep internal tracked buff entries immutable', () => {
      const state = new CraftingState({
        buffs: new Map([['focus', { name: 'focus', stacks: 2 }]]),
      });

      const tracked = state.getBuff('focus') as any;
      expect(tracked).toBeDefined();
      expect(Object.isFrozen(tracked)).toBe(true);

      try {
        tracked.stacks = 10;
      } catch (_) {
        // Assignment may throw in strict mode for frozen objects.
      }

      expect(state.getBuffStacks('focus')).toBe(2);
    });
  });

  describe('getControl', () => {
    it('should return base control when no buff active', () => {
      const state = new CraftingState({ controlBuffTurns: 0 });
      expect(state.getControl(16)).toBe(16);
    });

    it('should apply buff multiplier when buff is active', () => {
      const state = new CraftingState({
        controlBuffTurns: 2,
        controlBuffMultiplier: 1.4,
      });
      // 16 * 1.4 = 22.4, floored to 22
      expect(state.getControl(16)).toBe(22);
    });

    it('should use custom buff multiplier', () => {
      const state = new CraftingState({
        controlBuffTurns: 1,
        controlBuffMultiplier: 1.5,
      });
      // 16 * 1.5 = 24
      expect(state.getControl(16)).toBe(24);
    });
  });

  describe('getIntensity', () => {
    it('should return base intensity when no buff active', () => {
      const state = new CraftingState({ intensityBuffTurns: 0 });
      expect(state.getIntensity(12)).toBe(12);
    });

    it('should apply buff multiplier when buff is active', () => {
      const state = new CraftingState({
        intensityBuffTurns: 2,
        intensityBuffMultiplier: 1.4,
      });
      // 12 * 1.4 = 16.8, floored to 16
      expect(state.getIntensity(12)).toBe(16);
    });
  });

  describe('getScore', () => {
    it('should return min of completion and perfection when no targets', () => {
      const state = new CraftingState({
        completion: 50,
        perfection: 30,
      });
      expect(state.getScore()).toBe(30);
    });

    it('should score based on progress toward targets', () => {
      const state = new CraftingState({
        completion: 50,
        perfection: 30,
      });
      // Score = min(50, 100) + min(30, 100) = 50 + 30 = 80
      expect(state.getScore(100, 100)).toBe(80);
    });

    it('should cap progress at target values', () => {
      const state = new CraftingState({
        completion: 150,
        perfection: 80,
      });
      // Score = min(150, 100) + min(80, 100) = 100 + 80 = 180
      expect(state.getScore(100, 100)).toBe(180);
    });
  });

  describe('targetsMet', () => {
    it('should return true when both targets are met', () => {
      const state = new CraftingState({
        completion: 100,
        perfection: 100,
      });
      expect(state.targetsMet(100, 100)).toBe(true);
    });

    it('should return true when targets are exceeded', () => {
      const state = new CraftingState({
        completion: 120,
        perfection: 110,
      });
      expect(state.targetsMet(100, 100)).toBe(true);
    });

    it('should return false when completion not met', () => {
      const state = new CraftingState({
        completion: 90,
        perfection: 100,
      });
      expect(state.targetsMet(100, 100)).toBe(false);
    });

    it('should return false when perfection not met', () => {
      const state = new CraftingState({
        completion: 100,
        perfection: 90,
      });
      expect(state.targetsMet(100, 100)).toBe(false);
    });
  });

  describe('buff checks', () => {
    it('should detect active control buff', () => {
      const state = new CraftingState({ controlBuffTurns: 2 });
      expect(state.hasControlBuff()).toBe(true);
    });

    it('should detect no control buff', () => {
      const state = new CraftingState({ controlBuffTurns: 0 });
      expect(state.hasControlBuff()).toBe(false);
    });

    it('should detect active intensity buff', () => {
      const state = new CraftingState({ intensityBuffTurns: 1 });
      expect(state.hasIntensityBuff()).toBe(true);
    });

    it('should detect no intensity buff', () => {
      const state = new CraftingState({ intensityBuffTurns: 0 });
      expect(state.hasIntensityBuff()).toBe(false);
    });
  });

  describe('cooldown tracking', () => {
    it('should detect skill on cooldown', () => {
      const cooldowns = new Map<string, number>();
      cooldowns.set('stabilize', 2);
      const state = new CraftingState({ cooldowns });
      
      expect(state.isOnCooldown('stabilize')).toBe(true);
      expect(state.getCooldown('stabilize')).toBe(2);
    });

    it('should detect skill not on cooldown', () => {
      const state = new CraftingState();
      
      expect(state.isOnCooldown('stabilize')).toBe(false);
      expect(state.getCooldown('stabilize')).toBe(0);
    });

    it('should detect skill with zero cooldown as not on cooldown', () => {
      const cooldowns = new Map<string, number>();
      cooldowns.set('stabilize', 0);
      const state = new CraftingState({ cooldowns });
      
      expect(state.isOnCooldown('stabilize')).toBe(false);
    });
  });

  describe('toxicity tracking', () => {
    it('should detect dangerous toxicity levels', () => {
      const state = new CraftingState({
        toxicity: 85,
        maxToxicity: 100,
      });
      expect(state.hasDangerousToxicity()).toBe(true);
    });

    it('should not flag safe toxicity levels', () => {
      const state = new CraftingState({
        toxicity: 50,
        maxToxicity: 100,
      });
      expect(state.hasDangerousToxicity()).toBe(false);
    });

    it('should handle zero max toxicity (non-alchemy)', () => {
      const state = new CraftingState({
        toxicity: 0,
        maxToxicity: 0,
      });
      expect(state.hasDangerousToxicity()).toBe(false);
    });
  });

  describe('getCacheKey', () => {
    it('should generate consistent cache keys', () => {
      const state = new CraftingState({
        qi: 100,
        stability: 50,
        initialMaxStability: 60,
        controlBuffTurns: 2,
        intensityBuffTurns: 0,
        toxicity: 10,
      });
      
      const key1 = state.getCacheKey();
      const key2 = state.getCacheKey();
      
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different states', () => {
      const state1 = new CraftingState({ qi: 100, stability: 50 });
      const state2 = new CraftingState({ qi: 90, stability: 50 });
      
      expect(state1.getCacheKey()).not.toBe(state2.getCacheKey());
    });

    it('should include stabilityPenalty in cache key', () => {
      // Cache key uses stabilityPenalty (not maxStability directly)
      // maxStability is derived from initialMaxStability - stabilityPenalty
      const state1 = new CraftingState({ qi: 100, stability: 50, initialMaxStability: 60, stabilityPenalty: 0 });
      const state2 = new CraftingState({ qi: 100, stability: 50, initialMaxStability: 60, stabilityPenalty: 5 });

      expect(state1.getCacheKey()).not.toBe(state2.getCacheKey());
    });

    it('should include initialMaxStability in cache key', () => {
      const state1 = new CraftingState({
        qi: 100,
        stability: 50,
        initialMaxStability: 60,
        stabilityPenalty: 5,
      });
      const state2 = new CraftingState({
        qi: 100,
        stability: 50,
        initialMaxStability: 80,
        stabilityPenalty: 5,
      });

      expect(state1.getCacheKey()).not.toBe(state2.getCacheKey());
    });

    it('should include harmony and harmonyData in cache key', () => {
      const base = new CraftingState({
        qi: 100,
        stability: 50,
        harmony: 10,
        harmonyData: {
          forgeWorks: { heat: 4 },
          recommendedTechniqueTypes: ['fusion'],
        },
      });
      const changedHarmony = new CraftingState({
        qi: 100,
        stability: 50,
        harmony: 20,
        harmonyData: {
          forgeWorks: { heat: 4 },
          recommendedTechniqueTypes: ['fusion'],
        },
      });
      const changedData = new CraftingState({
        qi: 100,
        stability: 50,
        harmony: 10,
        harmonyData: {
          forgeWorks: { heat: 5 },
          recommendedTechniqueTypes: ['fusion'],
        },
      });

      expect(base.getCacheKey()).not.toBe(changedHarmony.getCacheKey());
      expect(base.getCacheKey()).not.toBe(changedData.getCacheKey());
    });

    it('should include cooldowns in cache key', () => {
      const cooldowns1 = new Map<string, number>();
      cooldowns1.set('stabilize', 2);
      const state1 = new CraftingState({ qi: 100, cooldowns: cooldowns1 });
      
      const cooldowns2 = new Map<string, number>();
      cooldowns2.set('stabilize', 1);
      const state2 = new CraftingState({ qi: 100, cooldowns: cooldowns2 });
      
      expect(state1.getCacheKey()).not.toBe(state2.getCacheKey());
    });
  });
});
