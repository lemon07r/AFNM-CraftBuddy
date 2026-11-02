const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const WORKSHOP_DESCRIPTION_LIMIT = 8000;

function listMarkdownFiles() {
  return execFileSync('git', ['ls-files', '-z', '--', '*.md'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .map((file) => path.join(ROOT, file))
    .filter((file) => fs.existsSync(file))
    .sort();
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function descriptionBody(text) {
  return text
    .trim()
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
    .trim();
}

function workshopDescriptionError(body) {
  return body.length > WORKSHOP_DESCRIPTION_LIMIT
    ? `Workshop description body is ${body.length} characters; maximum is ${WORKSHOP_DESCRIPTION_LIMIT}. Shorten it before uploading.`
    : undefined;
}

module.exports = {
  ROOT,
  listMarkdownFiles,
  rel,
  descriptionBody,
  workshopDescriptionError,
};
