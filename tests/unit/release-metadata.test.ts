import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')) as {
  version: string;
};

function runReleaseCheck(tag: string) {
  return spawnSync(
    process.execPath,
    ['scripts/check-release-metadata.mjs', tag],
    { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

describe('release metadata validation', () => {
  it('accepts a full semver release tag matching the package version', () => {
    const result = runReleaseCheck(`v${packageJson.version}`);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `Release metadata is consistent for v${packageJson.version}`,
    );
  });

  it('rejects a shortened major-minor tag', () => {
    const [major, minor] = packageJson.version.split('.');
    const result = runReleaseCheck(`v${major}.${minor}`);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Release tag must contain a semantic version');
  });
});
