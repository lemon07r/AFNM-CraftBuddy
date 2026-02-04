const { zip } = require('zip-a-folder');
const package = require('../package.json');
const path = require('path');
const fs = require('fs');

async function zipDist() {
  const distPath = path.resolve(__dirname, `../dist/${package.name}`);
  const buildsDir = path.resolve(__dirname, '../builds');
  const zipPath = path.resolve(buildsDir, `${package.name}-${package.version}.zip`);

  try {
    // Create builds directory if it doesn't exist
    if (!fs.existsSync(buildsDir)) {
      fs.mkdirSync(buildsDir, { recursive: true });
    }

    await zip(distPath, zipPath);
    console.log(`Successfully zipped ${package.name} to ${zipPath}`);
  } catch (err) {
    console.error('Error zipping dist folder:', err);
  }
}

zipDist();
