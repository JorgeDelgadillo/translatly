import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test.describe.configure({ mode: 'serial' });

const extensionPath = path.resolve('.output/chrome-mv3');
let context: BrowserContext | undefined;
let userDataDir: string;
let extensionId: string;
let contentServer: Server;
let contentUrl: string;

async function extensionPage(pagePath: string): Promise<Page> {
  const page = await context!.newPage();
  await page.goto(`chrome-extension://${extensionId}/${pagePath}`);
  return page;
}

test.beforeAll(async () => {
  contentServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(
      '<!doctype html><html><body><p id="selection">A private sentence selected on a local page.</p></body></html>',
    );
  });
  await new Promise<void>((resolve) => contentServer.listen(0, '127.0.0.1', resolve));
  const address = contentServer.address();
  if (!address || typeof address === 'string') throw new Error('Could not start the content test server');
  contentUrl = `http://127.0.0.1:${address.port}`;

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
  await new Promise<void>((resolve, reject) => contentServer.close((error) => (error ? reject(error) : resolve())));
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
  await page.getByRole('button', { name: /Models|Modelos/ }).click();
  await expect(page.locator('#models-panel')).toBeVisible();
  await expect(page.locator('#settings-panel')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#models-panel')).toBeHidden();
  await page.close();
});

test('renders the popup quick-translation surface with persisted preferences', async () => {
  const page = await extensionPage('popup.html');

  await expect(page.getByRole('heading', { name: 'Translatly' })).toBeVisible();
  await expect(page.getByLabel('Texto para traducir')).toBeVisible();
  await expect(page.locator('.language-bar label').nth(0).locator('select')).toHaveValue('en');
  await expect(page.locator('.language-bar label').nth(1).locator('select')).toHaveValue('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.close();
});

test('renders a compact inline bubble for selected text and closes it outside', async () => {
  const page = await context!.newPage();
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto(contentUrl);
  await page.locator('#selection').selectText();
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));

  const bubbleHost = page.locator('#translatly-bubble-host');
  await expect(bubbleHost).toBeAttached();
  const box = await bubbleHost.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);

  await page.mouse.click(350, 620);
  await expect(bubbleHost).not.toBeAttached();
  await page.close();
});

test('cancels a model download and returns it to the not-installed state', async () => {
  const page = await extensionPage('translator.html');
  const modelsToggle = page.getByRole('button', { name: /Models|Modelos/ });
  await modelsToggle.click();

  const firstModel = page.locator('.model-row').first();
  const downloadButton = firstModel.getByRole('button', { name: /Download|Descargar/ });
  await expect(downloadButton).toBeEnabled({ timeout: 10_000 });
  await downloadButton.click();

  const cancelButton = firstModel.getByRole('button', { name: /Cancel|Cancelar/ });
  await expect(cancelButton).toBeVisible();
  await cancelButton.click();
  await expect(firstModel).toContainText(/Not downloaded|No descargado/, { timeout: 10_000 });
  await page.close();
});
