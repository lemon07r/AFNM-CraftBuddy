const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(['.git', '.junie', 'node_modules', 'dist', 'builds', 'coverage', 'archive']);

function walk(dir, predicate, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walk(full, predicate, out);
      continue;
    }
    if (entry.isFile() && predicate(full)) out.push(full);
  }
  return out;
}

function listMarkdownFiles() {
  return walk(ROOT, (f) => f.endsWith('.md')).sort();
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function parseFrontmatter(markdownText) {
  if (!markdownText.startsWith('---\n')) return null;
  const end = markdownText.indexOf('\n---\n', 4);
  if (end === -1) return null;
  const raw = markdownText.slice(4, end);
  const fields = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (/^-?\d+$/.test(value)) value = Number(value);
    fields[key] = value;
  }
  return fields;
}

function isMaintainedDoc(relativePath) {
  return (
    relativePath.startsWith('docs/project/') ||
    relativePath.startsWith('docs/dev-requests/') ||
    relativePath.startsWith('docs/history/') ||
    relativePath === 'docs/README.md' ||
    relativePath === 'docs/index.md' ||
    relativePath === 'docs/DOC_INVENTORY.md'
  );
}

module.exports = {
  ROOT,
  listMarkdownFiles,
  rel,
  parseFrontmatter,
  isMaintainedDoc,
};
