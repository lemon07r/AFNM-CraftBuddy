#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ROOT, descriptionBody, workshopDescriptionError } = require('./utils');

function consistencyErrors(version, changelog, workshopDescription) {
  const errors = [];
  const topHeading = /^##\s+(.+)$/m.exec(changelog)?.[1];
  const changelogVersion =
    /^\[?v?(\d+\.\d+\.\d+(?:-[\w.-]+)?)(?:\])?(?=\s|$)/.exec(
      topHeading ?? '',
    )?.[1];
  if (!changelogVersion) {
    errors.push(
      'CHANGELOG.md: first ## heading must start with a release version.',
    );
  } else if (changelogVersion !== version) {
    errors.push(
      `Version mismatch: package.json is ${version}, but top CHANGELOG.md release is ${changelogVersion}.`,
    );
  }
  const descriptionError = workshopDescriptionError(
    descriptionBody(workshopDescription),
  );
  if (descriptionError)
    errors.push(`docs/WORKSHOP_DESCRIPTION.md: ${descriptionError}`);
  return errors;
}

function main() {
  const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
  const errors = consistencyErrors(
    JSON.parse(read('package.json')).version,
    read('CHANGELOG.md'),
    read('docs/WORKSHOP_DESCRIPTION.md'),
  );
  if (errors.length) {
    console.error('Documentation consistency checks failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(
      'OK: package/changelog versions agree; Workshop body is within 8000 characters.',
    );
  }
}

if (require.main === module) main();
module.exports = { consistencyErrors };
