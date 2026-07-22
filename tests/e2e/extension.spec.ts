import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test.describe.configure({ mode: 'serial' });

const extensionPath = path.resolve('.output/chrome-mv3');
let context: BrowserContext | undefined;
let userDataDir: string;
let extensionId: string;

async function extensionPage(pagePath: string): Promise<Page> {
  const page = await context!.newPage();
  await page.goto(`chrome-extension://${extensionId}/${pagePath}`);
  return page;
}

test.beforeAll(async () => {
  userDataDir = await mkdtemp(path.join(os.tmpdir(), 'translatly-e2e-'));
  context = await chromium.launchPersistentContext(userDataDir, {
    // Chromium extensions are not available in Playwright's headless shell.
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
    ],
  });

  const serviceWorker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 10_000 }));
  extensionId = new URL(serviceWorker.url()).hostname;
});

test.afterAll(async () => {
  await context?.close();
  await rm(userDataDir, { recursive: true, force: true });
});

test('opens the private desk, completes onboarding, and changes preferences', async () => {
  const page = await extensionPage('translator.html');

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A private desk for every word.' })).toBeVisible();
  await page.getByRole('button', { name: 'Open the desk' }).click();
  await expect(page.getByRole('heading', { name: 'Find the right words.' })).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Your default pair' })).toBeVisible();
  await page.locator('.appearance-form label').filter({ hasText: 'Language' }).locator('select').selectOption('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('heading', { name: 'Encuentra las palabras.' })).toBeVisible();

  await page.locator('.appearance-form label').filter({ hasText: 'Tema' }).locator('select').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.close();
});

test('renders the popup quick-translation surface with persisted preferences', async () => {
  const page = await extensionPage('popup.html');

  await expect(page.getByRole('heading', { name: 'Translatly' })).toBeVisible();
  await expect(page.getByLabel('Texto para traducir')).toBeVisible();
  await expect(page.locator('.pickers label').nth(0).locator('select')).toHaveValue('en');
  await expect(page.locator('.pickers label').nth(1).locator('select')).toHaveValue('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.close();
});
