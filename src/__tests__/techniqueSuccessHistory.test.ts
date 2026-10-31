import { extractTechniqueFailureStreaks } from '../modContent/techniqueSuccessHistory';

const skills = [{ name: 'Fusion', key: 'fusion' }];
describe('runtime PRD history extraction', () => {
  it('counts failures since the latest recorded success', () => {
    expect(
      extractTechniqueFailureStreaks(
        {
          Fusion: {
            attempts: [
              { success: false },
              { success: true },
              { success: false },
              { success: false },
            ],
          },
        },
        skills,
      ),
    ).toEqual({ prd_failures_fusion: 2 });
  });
  it('knows the streak is zero immediately after a success', () => {
    expect(
      extractTechniqueFailureStreaks(
        { Fusion: { attempts: [{ success: true }] } },
        skills,
      ),
    ).toEqual({ prd_failures_fusion: 0 });
  });
  it.each([
    undefined,
    {},
    { Fusion: { attempts: [] } },
    { Fusion: { attempts: [{ success: false }, { success: false }] } },
    { Fusion: { attempts: [{ success: true }, {}] } },
  ])(
    'does not invent the hidden cross-craft streak from incomplete data: %j',
    (tracking) => {
      expect(extractTechniqueFailureStreaks(tracking, skills)).toEqual({});
    },
  );
});
