const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { ROOT, listMarkdownFiles, descriptionBody } = require('./utils');
const { normalizeTarget, findBrokenLinks } = require('./check-links');
const { consistencyErrors } = require('./check-consistency');

test('tracked Markdown enumeration includes local skills, not dependency trees', () => {
  const files = listMarkdownFiles();
  assert(
    files.includes(
      path.join(ROOT, '.agents/skills/craftbuddy-optimizer/SKILL.md'),
    ),
  );
  assert(!files.some((file) => file.includes('/node_modules/')));
});

test('inline local links resolve relative to the document; code paths to the repo', () => {
  const file = path.join(ROOT, 'docs/DEVELOPMENT.md');
  assert.deepEqual(
    findBrokenLinks(
      file,
      '[design](OPTIMIZER_DESIGN.md#search) [root](/README.md "readme") ' +
        '`src/settings/index.ts:181-189,230-240` ' +
        '`scripts/docs/check-links.js` `src/__tests__/fixtures/transition_corpus.json` ' +
        '`.agents/skills/craftbuddy-optimizer/SKILL.md`',
    ),
    [],
  );
});

test('broken inline and backticked paths report their targets', () => {
  assert.deepEqual(
    findBrokenLinks(
      path.join(ROOT, 'README.md'),
      '[missing](docs/no-such-document.md) `src/no-such-file.ts:42`',
    ),
    ['docs/no-such-document.md', 'src/no-such-file.ts'],
  );
});

test('globs, placeholder paths, external links and anchors are ignored', () => {
  for (const value of [
    'docs/*.md',
    'src/<module>.ts',
    'scripts/{name}.js',
    'docs/vX.Y.Z.md',
    'https://example.com/path',
    'mailto:example@example.com',
    '#section',
  ]) {
    assert.equal(normalizeTarget(value), null, value);
  }
});

test('angle-wrapped/encoded paths and line suffixes normalize', () => {
  assert.equal(
    normalizeTarget('<docs/DEVELOPMENT.md#setup>'),
    'docs/DEVELOPMENT.md',
  );
  assert.equal(normalizeTarget('docs/a%20b.md:12'), 'docs/a b.md');
  assert.equal(normalizeTarget('src/a.ts:12-15,30-40'), 'src/a.ts');
  assert.equal(normalizeTarget('CHANGELOG.md:10-20'), 'CHANGELOG.md');
  assert.equal(normalizeTarget('https://example.com:8080/x'), null);
});

test('only intended repo prefixes are checked in code spans, not fenced commands', () => {
  assert.deepEqual(
    findBrokenLinks(
      path.join(ROOT, 'README.md'),
      '`something/nonexistent`\n```bash\nsrc/not-a-code-span\n```',
    ),
    [],
  );
});

test('description frontmatter is excluded, including CRLF and delimiter at EOF', () => {
  assert.equal(descriptionBody('---\ntitle: ignored\n---\n\nbody\n'), 'body');
  assert.equal(descriptionBody('---\r\ntitle: ignored\r\n---\r\nbody'), 'body');
  assert.equal(descriptionBody('---\ntitle: ignored\n---'), '');
  assert.equal(
    descriptionBody('--- not frontmatter\nbody'),
    '--- not frontmatter\nbody',
  );
});

test('package version must equal the first changelog release, not a later match', () => {
  assert.deepEqual(
    consistencyErrors('6.9.0', '# Changelog\n\n## 6.9.0 — AFNM', 'body'),
    [],
  );
  assert.match(
    consistencyErrors('6.9.0', '## 7.0.0\n\n## 6.9.0', 'body')[0],
    /Version mismatch.*6\.9\.0.*7\.0\.0/,
  );
  assert.match(
    consistencyErrors('6.9.0', '## Unreleased\n\n## 6.9.0', 'body')[0],
    /first ## heading/,
  );
  assert.match(
    consistencyErrors('6.9.0', '# Changelog', 'body')[0],
    /first ## heading/,
  );
});

test('bracketed semver and prerelease changelog headings are accepted', () => {
  assert.deepEqual(
    consistencyErrors('7.0.0-rc.1', '## [v7.0.0-rc.1] — date', 'body'),
    [],
  );
});

test('Workshop limit is inclusive and applies only to the body', () => {
  const frontmatter = `---\ntitle: ${'x'.repeat(8100)}\n---\n`;
  assert.deepEqual(
    consistencyErrors('6.9.0', '## 6.9.0', frontmatter + 'x'.repeat(8000)),
    [],
  );
  assert.match(
    consistencyErrors('6.9.0', '## 6.9.0', 'x'.repeat(8001))[0],
    /8001 characters; maximum is 8000/,
  );
});

test('uploader refuses oversized inline/file descriptions before any build or upload', (t) => {
  const scratchRoot = path.join(ROOT, 'tmp');
  fs.mkdirSync(scratchRoot, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(scratchRoot, 'docs-upload-test-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const description = 'x'.repeat(8001);
  const file = path.join(scratch, 'description.md');
  fs.writeFileSync(file, `---\ntitle: excluded\n---\n${description}`);
  for (const args of [
    ['--description', description],
    ['--description-file', file],
  ]) {
    const result = spawnSync(
      'bun',
      [
        'run',
        'workshop:upload',
        '--',
        '--change-note',
        'test only; must never upload',
        '--skip-build',
        '--skip-uploader-prepare',
        '--zip',
        path.join(scratch, 'nonexistent.zip'),
        ...args,
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /8001 characters; maximum is 8000/);
    assert(!result.stdout.includes('== '), 'must reject before subprocesses');
  }
});
