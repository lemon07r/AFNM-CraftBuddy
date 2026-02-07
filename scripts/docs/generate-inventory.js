#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ROOT, listMarkdownFiles, rel, parseFrontmatter } = require('./utils');

function classify(relative) {
  if (relative.startsWith('docs/project/')) return 'project';
  if (relative.startsWith('docs/dev-requests/')) return 'dev-request';
  if (relative.startsWith('docs/history/')) return 'history';
  if (relative.startsWith('docs/reference/')) return 'reference';
  if (
    relative === 'docs/README.md' ||
    relative === 'docs/index.md' ||
    relative === 'docs/DOC_INVENTORY.md'
  ) {
    return 'project-meta';
  }
  return 'root-or-other';
}

function decision(relative) {
  const category = classify(relative);
  if (category === 'project' || category === 'dev-request' || category === 'project-meta') {
    return 'keep-authoritative';
  }
  if (category === 'history') return 'keep-historical';
  if (category === 'reference') return 'keep-reference';
  if (relative === 'AGENT.md') return 'deprecate';
  if (relative === 'AGENTS.md' || relative === 'README.md') return 'keep-authoritative-root';
  return 'review';
}

function collectRows() {
  const rows = [];
  for (const file of listMarkdownFiles()) {
    const relative = rel(file);
    const text = fs.readFileSync(file, 'utf8');
    const frontmatter = parseFrontmatter(text) || {};
    rows.push({
      path: relative,
      category: classify(relative),
      status: frontmatter.status || '-',
      authoritative: Object.prototype.hasOwnProperty.call(frontmatter, 'authoritative')
        ? String(frontmatter.authoritative)
        : '-',
      owner: frontmatter.owner || '-',
      decision: decision(relative),
    });
  }
  rows.sort((a, b) => a.path.localeCompare(b.path));
  return rows;
}

function markdownTable(headers, rows) {
  const lines = [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
  ];
  for (const row of rows) {
    lines.push(`| ${row.map((cell) => String(cell)).join(' | ')} |`);
  }
  return lines;
}

function referenceGroupKey(relative) {
  const parts = relative.split('/');
  if (parts.length <= 2) return 'docs/reference (top-level)';
  if (parts.length === 3) return `${parts[0]}/${parts[1]}/${parts[2]}`;
  return `${parts[0]}/${parts[1]}/${parts[2]}/${parts[3]}`;
}

const rows = collectRows();
const generatedOn = new Date().toISOString().slice(0, 10);

const counts = rows.reduce((acc, row) => {
  acc[row.category] = (acc[row.category] || 0) + 1;
  return acc;
}, {});

const authoritativeRows = rows.filter((r) => ['project', 'dev-request', 'project-meta'].includes(r.category));
const historyRows = rows.filter((r) => r.category === 'history');
const rootRows = rows.filter((r) => r.category === 'root-or-other');
const referenceRows = rows.filter((r) => r.category === 'reference');

const referenceGroups = new Map();
for (const row of referenceRows) {
  const key = referenceGroupKey(row.path);
  referenceGroups.set(key, (referenceGroups.get(key) || 0) + 1);
}
const referenceGroupRows = Array.from(referenceGroups.entries())
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([group, fileCount]) => [
    `\`${group}\``,
    fileCount,
  ]);

const content = [
  '---',
  'title: Documentation Inventory',
  'status: active',
  'authoritative: true',
  'owner: craftbuddy-maintainers',
  `last_verified: ${generatedOn}`,
  'source_of_truth: repository markdown file inventory',
  'review_cycle_days: 30',
  'related_files:',
  '  - docs/project/DOCS_GOVERNANCE.md',
  '---',
  '',
  '# Documentation Inventory',
  '',
  `Generated on: ${generatedOn}`,
  '',
  '## Summary',
  '',
  ...markdownTable(
    ['Category', 'Count'],
    [
      ['project', counts.project || 0],
      ['dev-request', counts['dev-request'] || 0],
      ['project-meta', counts['project-meta'] || 0],
      ['history', counts.history || 0],
      ['reference', counts.reference || 0],
      ['root-or-other', counts['root-or-other'] || 0],
      ['total', rows.length],
    ]
  ),
  '',
  '## Authoritative Docs',
  '',
  ...markdownTable(
    ['Path', 'Category', 'Status', 'Authoritative', 'Owner', 'Decision'],
    authoritativeRows.map((r) => [
      `\`${r.path}\``,
      r.category,
      r.status,
      r.authoritative,
      r.owner,
      r.decision,
    ])
  ),
  '',
  '## Historical Docs',
  '',
  ...markdownTable(
    ['Path', 'Status', 'Authoritative', 'Owner', 'Decision'],
    historyRows.map((r) => [
      `\`${r.path}\``,
      r.status,
      r.authoritative,
      r.owner,
      r.decision,
    ])
  ),
  '',
  '## Root/Other Markdown',
  '',
  ...markdownTable(
    ['Path', 'Status', 'Authoritative', 'Owner', 'Decision'],
    rootRows.map((r) => [
      `\`${r.path}\``,
      r.status,
      r.authoritative,
      r.owner,
      r.decision,
    ])
  ),
  '',
  '## Reference Corpus Summary',
  '',
  '_Reference files are summarized by subtree to keep this inventory compact._',
  '',
  ...markdownTable(['Reference Group', 'File Count'], referenceGroupRows),
  '',
].join('\n');

fs.writeFileSync(path.join(ROOT, 'docs/DOC_INVENTORY.md'), content, 'utf8');
console.log(`Wrote docs/DOC_INVENTORY.md with ${rows.length} markdown files indexed.`);
