/**
 * Unit tests for game type helpers.
 */

import { evalExpression, ScalingVariables } from '../optimizer/gameTypes';

const testVariables: ScalingVariables = {
  control: 10,
  intensity: 12,
  critchance: 25,
  critmultiplier: 150,
  pool: 80,
  maxpool: 100,
  toxicity: 20,
  maxtoxicity: 100,
  resistance: 0,
  itemEffectiveness: 0,
  pillsPerRound: 1,
  poolCostPercentage: 100,
  stabilityCostPercentage: 100,
  successChanceBonus: 0,
  stacks: 0,
};

describe('evalExpression', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('should evaluate valid arithmetic expressions', () => {
    const result = evalExpression('pool / maxpool', testVariables);
    expect(result).toBeCloseTo(0.8);
  });

  it('should reject blocked control-flow keywords', () => {
    const result = evalExpression('while(true){}', testVariables);
    expect(result).toBe(0);
  });

  it('should reject assignment expressions', () => {
    const result = evalExpression('pool = 1', testVariables);
    expect(result).toBe(0);
  });

  it('should reject overlong expressions', () => {
    const longExpression = '1'.repeat(1025);
    const result = evalExpression(longExpression, testVariables);
    expect(result).toBe(0);
  });
});
