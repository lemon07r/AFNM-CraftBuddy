#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ROOT, listMarkdownFiles, rel } = require('./utils');

const LINK_RE = /\[[^\]]*\]\((<[^>]+>|[^)]+)\)/g;
const CODE_RE = /(?<!`)`([^`\r\n]+)`(?!`)/g;
const REPO_PATH_RE = /^(?:docs|src|scripts|crates|\.agents)\//;

function normalizeTarget(raw) {
  let target = raw.trim().replace(/\s+["'][^"']*["']$/, '');
  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1);
  }
  if (!target || target.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(target)) {
    return null;
  }
  target = target.split('#')[0];
  try {
    target = decodeURIComponent(target);
  } catch {
    // Report the raw target if malformed escaping also makes the path invalid.
  }
  target = target.replace(/:\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/, '');
  if (!target || /[*<{]|X\.Y\.Z/.test(target)) return null;
  return target;
}

function resolveExists(fromFile, target, repoRelative = false) {
  const base =
    repoRelative || target.startsWith('/')
      ? path.join(ROOT, target)
      : path.resolve(path.dirname(fromFile), target);
  return [base, `${base}.md`, path.join(base, 'index.md')].some((candidate) =>
    fs.existsSync(candidate),
  );
}

function findBrokenLinks(file, text) {
  const broken = [];
  for (const match of text.matchAll(LINK_RE)) {
    const target = normalizeTarget(match[1]);
    if (target && !resolveExists(file, target)) broken.push(target);
  }
  for (const match of text.matchAll(CODE_RE)) {
    if (!REPO_PATH_RE.test(match[1])) continue;
    const target = normalizeTarget(match[1]);
    if (target && !resolveExists(file, target, true)) broken.push(target);
  }
  return [...new Set(broken)];
}

function main() {
  const files = listMarkdownFiles();
  const broken = files.flatMap((file) =>
    findBrokenLinks(file, fs.readFileSync(file, 'utf8')).map(
      (target) => `${rel(file)} -> ${target}`,
    ),
  );
  if (broken.length) {
    console.error(
      `Found ${broken.length} broken Markdown links/path references:`,
    );
    for (const item of broken) console.error(`- ${item}`);
    process.exitCode = 1;
  } else {
    console.log(
      `OK: ${files.length} tracked Markdown files (including skills), no broken local links/path references.`,
    );
  }
}

if (require.main === module) main();
module.exports = { normalizeTarget, findBrokenLinks };
