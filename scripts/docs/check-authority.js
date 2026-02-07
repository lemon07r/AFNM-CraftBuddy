#!/usr/bin/env node
const fs = require('fs');
const { listMarkdownFiles, rel, parseFrontmatter } = require('./utils');

function validateRule(relative, frontmatter, expected) {
  if (!frontmatter) return `${relative}: missing frontmatter`;
  const errors = [];
  if (frontmatter.status !== expected.status) {
    errors.push(`${relative}: expected status '${expected.status}', got '${frontmatter.status}'`);
  }
  if (frontmatter.authoritative !== expected.authoritative) {
    errors.push(
      `${relative}: expected authoritative '${expected.authoritative}', got '${frontmatter.authoritative}'`
    );
  }
  return errors;
}

const errors = [];

for (const file of listMarkdownFiles()) {
  const relative = rel(file);
  const text = fs.readFileSync(file, 'utf8');
  const frontmatter = parseFrontmatter(text);

  if (relative.startsWith('docs/project/')) {
    const result = validateRule(relative, frontmatter, { status: 'active', authoritative: true });
    if (typeof result === 'string') errors.push(result);
    else errors.push(...result);
  } else if (relative.startsWith('docs/dev-requests/')) {
    const result = validateRule(relative, frontmatter, { status: 'active', authoritative: true });
    if (typeof result === 'string') errors.push(result);
    else errors.push(...result);
  } else if (relative.startsWith('docs/history/')) {
    const result = validateRule(relative, frontmatter, { status: 'historical', authoritative: false });
    if (typeof result === 'string') errors.push(result);
    else errors.push(...result);
  } else if (
    relative === 'docs/README.md' ||
    relative === 'docs/index.md' ||
    relative === 'docs/DOC_INVENTORY.md'
  ) {
    const result = validateRule(relative, frontmatter, { status: 'active', authoritative: true });
    if (typeof result === 'string') errors.push(result);
    else errors.push(...result);
  }
}

if (errors.length > 0) {
  console.error(`Authority checks failed (${errors.length} issue(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('OK: authority class checks passed.');
