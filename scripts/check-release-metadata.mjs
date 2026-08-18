import { readFile } from 'node:fs/promises';

const releaseTag = process.argv[2] ?? process.env.RELEASE_TAG;
if (!releaseTag) throw new Error('A release tag is required');

const expectedVersion = releaseTag.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(expectedVersion)) {
  throw new Error(`Release tag must contain a semantic version: ${releaseTag}`);
}

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
if (packageJson.version !== expectedVersion) {
  throw new Error(`package.json version ${packageJson.version} does not match ${releaseTag}`);
}

for (const manifestPath of ['.output/chrome-mv3/manifest.json', '.output/firefox-mv2/manifest.json']) {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.version !== expectedVersion) {
      throw new Error(`${manifestPath} version ${manifest.version} does not match ${releaseTag}`);
    }
  } catch (error) {
    if (error?.code === 'ENOENT') continue;
    throw error;
  }
}

console.log(`Release metadata is consistent for ${releaseTag}`);
