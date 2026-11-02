import {
  applySkill,
  calculateActionSurvivabilityFloor,
} from '../optimizer/skills';
import { mechanics0719Scenarios } from './fixtures/mechanics0719';

describe('AFNM 0.7.19 audited mechanics', () => {
  it.each([
    ['overdraft', 0],
    ['overdraft-rescue', 3],
    ['temporary-excess', 58],
  ])('keeps stability intermediates until cleanup: %s', (name, expected) => {
    const { state, skill, config } = mechanics0719Scenarios().find(
      (scenario) => scenario.name === `0719-${name}`,
    )!;
    expect(applySkill(state, skill, config)!.stability).toBe(expected);
    expect(
      calculateActionSurvivabilityFloor(state, skill, config)!.stability,
    ).toBe(expected);
  });
});
