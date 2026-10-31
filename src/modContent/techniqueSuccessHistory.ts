import type { SkillDefinition } from '../optimizer';

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/**
 * 0.7.18 keeps PRD failure streaks outside the craft. A recorded probabilistic
 * success is the only visible proof that the hidden global streak reset.
 */
export function extractTechniqueFailureStreaks(
  actionTracking: unknown,
  skills: readonly Pick<SkillDefinition, 'key' | 'name'>[],
): Record<string, number> {
  const tracking = record(actionTracking);
  const variables: Record<string, number> = {};
  for (const skill of skills) {
    const attempts = record(tracking?.[skill.name])?.attempts;
    if (!Array.isArray(attempts)) continue;
    let failures = 0;
    for (let index = attempts.length - 1; index >= 0; index--) {
      const attempt = record(attempts[index]);
      if (attempt?.success === true) {
        variables[`prd_failures_${skill.key}`] = failures;
        break;
      }
      if (attempt?.success !== false) break;
      failures++;
    }
  }
  return variables;
}
