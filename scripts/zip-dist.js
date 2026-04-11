const { zip } = require('zip-a-folder');
const package = require('../package.json');
const path = require('path');
const fs = require('fs');

async function zipDist() {
  const distPath = path.resolve(__dirname, `../dist/${package.name}`);
  const buildsDir = path.resolve(__dirname, '../builds');
  // Use just the mod name without version for easier updates
  const zipPath = path.resolve(buildsDir, `${package.name}.zip`);
  const packageJsonPath = path.resolve(__dirname, '../package.json');
  const distPackageJsonPath = path.resolve(distPath, 'package.json');

  try {
    // Create builds directory if it doesn't exist
    if (!fs.existsSync(buildsDir)) {
      fs.mkdirSync(buildsDir, { recursive: true });
    }

    // Copy package.json to dist folder (required by game to identify mod)
    fs.copyFileSync(packageJsonPath, distPackageJsonPath);
    console.log('Copied package.json to dist folder');

    // Copy translations folder if it exists (game auto-loads from translations/)
    const translationsDir = path.resolve(__dirname, '../translations');
    const distTranslationsDir = path.resolve(distPath, 'translations');
    if (fs.existsSync(translationsDir)) {
      if (!fs.existsSync(distTranslationsDir)) {
        fs.mkdirSync(distTranslationsDir, { recursive: true });
      }
      const translationFiles = fs.readdirSync(translationsDir).filter(
        (f) => f.endsWith('.json'),
      );
      for (const file of translationFiles) {
        fs.copyFileSync(
          path.resolve(translationsDir, file),
          path.resolve(distTranslationsDir, file),
        );
      }
      if (translationFiles.length > 0) {
        console.log(
          `Copied ${translationFiles.length} translation file(s) to dist folder`,
        );
      }
    }

    await zip(distPath, zipPath);
    console.log(`Successfully zipped ${package.name} to ${zipPath}`);
  } catch (err) {
    console.error('Error zipping dist folder:', err);
  }
}

zipDist();
