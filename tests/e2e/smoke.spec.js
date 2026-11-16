// Smoke test: the production build boots, the title screen works, and 30
// seconds of scripted play run without a single console error.
import { test, expect } from '@playwright/test';

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}

test('title screen boots and the attract demo plays', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await expect(page.locator('#titleLogo')).toHaveText('ASTEROID FIELD');
  await expect(page.locator('#titleMenu .title-item')).toHaveCount(6);
  await page.waitForFunction(() => window.__game?.tally.shots > 0, null, { timeout: 20_000 });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter'); // High Scores
  await expect(page.locator('#titleScores')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#titleMenu')).toBeVisible();
  expect(errors).toEqual([]);
});

test('30 seconds of play without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./?mode=endless&seed=7');
  await page.waitForFunction(() => window.__game?.mode === 'playing', null, { timeout: 20_000 });
  await page.evaluate(() => { window.__game.options.training = true; }); // survive the whole script

  // A loop of real key input: turn, thrust, fire, shield, hyperspace.
  const pattern = [
    ['ArrowLeft', 500], ['ArrowUp', 600], ['Space', 900], ['ArrowRight', 400],
    ['KeyE', 500], ['Space', 700], ['ShiftLeft', 80], ['ArrowUp', 400],
  ];
  const end = Date.now() + 30_000;
  while (Date.now() < end) {
    for (const [key, ms] of pattern) {
      await page.keyboard.down(key);
      await page.waitForTimeout(ms);
      await page.keyboard.up(key);
    }
  }

  const state = await page.evaluate(() => ({
    time: window.__game.runTime, shots: window.__game.tally.shots, hits: window.__game.tally.hits, mode: window.__game.mode,
  }));
  expect(state.time).toBeGreaterThan(20);
  expect(state.shots).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('pause menu opens and changes a setting', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./?mode=campaign&seed=3');
  await page.waitForFunction(() => window.__game?.mode === 'playing', null, { timeout: 20_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#paused')).toBeVisible();
  await page.locator('#menu .menu-item', { hasText: 'Screen shake' }).locator('.menu-arrow').last().click();
  await expect(page.locator('#menu .menu-item', { hasText: 'Screen shake' })).toContainText('Reduced');
  await page.keyboard.press('Escape');
  await expect(page.locator('#paused')).toBeHidden();
  expect(errors).toEqual([]);
});
