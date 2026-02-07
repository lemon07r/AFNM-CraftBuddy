#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ROOT, listMarkdownFiles, rel } = require('./utils');

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

function normalizeTarget(raw) {
  let target = raw.trim();
  if (!target) return null;
  if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
  if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:')) return null;
  if (target.startsWith('#')) return null;
  const hash = target.indexOf('#');
  if (hash >= 0) target = target.slice(0, hash);
  if (!target) return null;
  try {
    target = decodeURIComponent(target);
  } catch (_) {
    // Keep raw target when URI decoding fails.
  }
  return target;
}

function resolveExists(fromFile, target) {
  const base = target.startsWith('/') ? path.join(ROOT, target) : path.resolve(path.dirname(fromFile), target);
  const candidates = [base, `${base}.md`, path.join(base, 'index.md')];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

const mdFiles = listMarkdownFiles();
const broken = [];

for (const file of mdFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(LINK_RE)) {
    const normalized = normalizeTarget(match[1]);
    if (!normalized) continue;
    if (!resolveExists(file, normalized)) {
      broken.push({ file: rel(file), target: normalized });
    }
  }
}

if (broken.length > 0) {
  console.error(`Found ${broken.length} broken Markdown links:`);
  for (const item of broken) {
    console.error(`- ${item.file} -> ${item.target}`);
  }
  process.exit(1);
}

console.log(`OK: ${mdFiles.length} Markdown files scanned, no broken local links.`);
