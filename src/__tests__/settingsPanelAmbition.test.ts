/**
 * Settings panel exposure of the two ambition band settings.
 *
 * The Jest environment is `node` with no DOM renderer, so the value formatter
 * is covered directly and the panel wiring is asserted against the source.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { AMBITION_BAND_MAX } from '../settings';
import { bandThreshold } from '../optimizer';
import { ambitionBandPercent, formatAmbitionBands } from '../ui/ambitionBands';

const PANEL_SOURCE = readFileSync(
  join(__dirname, '..', 'ui', 'SettingsPanel.tsx'),
  'utf8',
);

describe('ambition band formatting', () => {
  it('renders 0 as Auto', () => {
    expect(formatAmbitionBands(0)).toBe('Auto');
  });

  it('follows the 1.3x compounding band ladder', () => {
    expect([1, 2, 3, 4, 5].map(ambitionBandPercent)).toEqual([
      100, 230, 399, 618, 902,
    ]);
  });

  it('reuses the optimizer band ladder instead of its own arithmetic', () => {
    for (let bands = 0; bands <= AMBITION_BAND_MAX; bands += 1) {
      expect(ambitionBandPercent(bands)).toBe(bandThreshold(100, bands));
    }
  });

  it('shows the band count with its approximate target percentage', () => {
    expect(formatAmbitionBands(1)).toBe('1 (~100%)');
    expect(formatAmbitionBands(3)).toBe('3 (~399%)');
    expect(formatAmbitionBands(AMBITION_BAND_MAX)).toBe(
      `8 (~${bandThreshold(100, AMBITION_BAND_MAX)}%)`,
    );
  });
});

describe('settings panel ambition controls', () => {
  it('renders both ambition sliders with their help tooltips', () => {
    expect(PANEL_SOURCE).toContain('label="Perfection Band Goal"');
    expect(PANEL_SOURCE).toContain('label="Completion Band Ceiling"');
    expect(PANEL_SOURCE).toContain('tooltip={PERFECTION_BAND_GOAL_HELP}');
    expect(PANEL_SOURCE).toContain('tooltip={COMPLETION_BAND_CEILING_HELP}');
    expect(PANEL_SOURCE).toContain(
      'draftValue={draftSettings.perfectionBandGoal}',
    );
    expect(PANEL_SOURCE).toContain(
      'draftValue={draftSettings.completionBandCeiling}',
    );
  });

  it('commits both ambition sliders as search-affecting settings', () => {
    expect(PANEL_SOURCE).toContain("handleSliderCommit('perfectionBandGoal'");
    expect(PANEL_SOURCE).toContain(
      "handleSliderCommit('completionBandCeiling'",
    );
    const searchSettings = PANEL_SOURCE.slice(
      PANEL_SOURCE.indexOf('const SEARCH_SETTINGS: SearchSettingKey[] = ['),
      PANEL_SOURCE.indexOf('const handleOvercraftAmbitionChange'),
    );
    expect(searchSettings).toContain("'perfectionBandGoal'");
    expect(searchSettings).toContain("'completionBandCeiling'");
  });
});
