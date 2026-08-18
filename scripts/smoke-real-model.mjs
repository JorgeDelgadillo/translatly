import { chromium, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve('.output/chrome-mv3');
const timeout = Number(process.env.REAL_MODEL_SMOKE_TIMEOUT_MS ?? 300_000);
const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'translatly-real-model-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-sandbox'],
});

try {
  const serviceWorker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 10_000 }));
  const extensionId = new URL(serviceWorker.url()).hostname;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/translator.html`);

  const onboarding = page.getByRole('dialog');
  if ((await onboarding.count()) > 0 && (await onboarding.isVisible())) {
    await page.getByRole('button', { name: 'Open the desk' }).click();
  }

  const input = page.getByLabel('Text to translate');
  await input.fill('Hello, how are you today?');
  await page.getByRole('button', { name: /^Translate/ }).click();

  const result = page.locator('.result-text');
  await expect(result).toBeVisible({ timeout });
  const output = (await result.textContent())?.trim() ?? '';
  if (!output) throw new Error('The real model smoke test returned an empty translation');

  console.log(`Real model smoke passed: ${JSON.stringify(output)}`);
} finally {
  await context.close();
  await rm(userDataDir, { recursive: true, force: true });
}
