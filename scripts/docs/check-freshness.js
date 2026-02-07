#!/usr/bin/env node
const fs = require('fs');
const { listMarkdownFiles, rel, parseFrontmatter, isMaintainedDoc } = require('./utils');

const REQUIRED_FIELDS = [
  'title',
  'status',
  'authoritative',
  'owner',
  'last_verified',
  'source_of_truth',
  'review_cycle_days',
  'related_files',
];

function parseDate(value) {
  if (typeof value !== 'string') return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

const today = new Date();
const errors = [];

for (const file of listMarkdownFiles()) {
  const relative = rel(file);
  if (!isMaintainedDoc(relative)) continue;

  const text = fs.readFileSync(file, 'utf8');
  const frontmatter = parseFrontmatter(text);
  if (!frontmatter) {
    errors.push(`${relative}: missing frontmatter`);
    continue;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in frontmatter)) {
      errors.push(`${relative}: missing required field '${field}'`);
    }
  }

  const reviewCycle = Number(frontmatter.review_cycle_days);
  if (!Number.isFinite(reviewCycle) || reviewCycle <= 0) {
    errors.push(`${relative}: invalid review_cycle_days '${frontmatter.review_cycle_days}'`);
    continue;
  }

  const lastVerifiedDate = parseDate(frontmatter.last_verified);
  if (!lastVerifiedDate) {
    errors.push(`${relative}: invalid last_verified '${frontmatter.last_verified}' (expected YYYY-MM-DD)`);
    continue;
  }

  const ageDays = Math.floor((today.getTime() - lastVerifiedDate.getTime()) / (1000 * 60 * 60 * 24));
  if (ageDays > reviewCycle) {
    errors.push(
      `${relative}: stale (age ${ageDays} days > review_cycle_days ${reviewCycle})`
    );
  }
}

if (errors.length > 0) {
  console.error(`Freshness/metadata checks failed (${errors.length} issue(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('OK: maintained documentation metadata/freshness checks passed.');
