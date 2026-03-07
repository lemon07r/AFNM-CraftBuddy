import { gunzipSync } from 'node:zlib';

interface SkyfallBowHeatRegressionFixture {
  targets: {
    completion: number;
    perfection: number;
    stability: number;
  };
  conditions: {
    current: string;
    forecast: string[];
  };
  state: Record<string, unknown>;
  config: Record<string, unknown>;
}

// Reduced replay payload from the 2026-03-07 Skyfall Bow forge report.
// Stored compressed so the regression stays readable without checking in
// the full raw snapshot blob.
const SKYFALL_BOW_HEAT_REGRESSION_GZIP_BASE64 = [
  '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',
].join('');

export function loadSkyfallBowHeatRegressionFixture(): SkyfallBowHeatRegressionFixture {
  return JSON.parse(
    gunzipSync(
      Buffer.from(SKYFALL_BOW_HEAT_REGRESSION_GZIP_BASE64, 'base64'),
    ).toString('utf8'),
  ) as SkyfallBowHeatRegressionFixture;
}
