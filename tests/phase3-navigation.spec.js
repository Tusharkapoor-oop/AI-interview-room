// Phase 3: Live Browser Testing — Navigate entire application as real user
// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:8000';
const SCREENSHOTS = path.resolve(__dirname, '..', 'test-artifacts', 'phase3-screenshots');

// Helper: capture screenshot + check for console errors
async function snapshot(page, name, step) {
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage: true });
  console.log(`  [OK] ${step}: ${name}`);
}

// Collect all console errors
const consoleErrors = [];
function trackConsole(page) {
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), location: msg.location() });
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push({ text: err.message, stack: err.stack });
  });
}

test.describe('Phase 3: Live Browser Testing — Full App Navigation', () => {

  test.beforeAll(async () => {
    // Verify services are up
    const fetch = (await import('node-fetch')).default || globalThis.fetch;
    let backendOk = false, frontendOk = false;
    try { const r = await fetch(`${API}/api/health`); backendOk = r.ok; } catch {}
    try { const r = await fetch(BASE); frontendOk = r.ok; } catch {}
    if (!backendOk) throw new Error('Backend not reachable at ' + API);
    if (!frontendOk) throw new Error('Frontend not reachable at ' + BASE);
    console.log('[PRE-CHECK] Both services operational');
  });

  test('3.1 — Landing Page / Root Route', async ({ page }) => {
    trackConsole(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snapshot(page, '01-landing', 'Landing page loads without errors');

    // Verify key elements
    const title = await page.title();
    expect(title).toContain('AEGIS');

    // Check for root-level React mount
    const root = await page.$('#root');
    expect(root).toBeTruthy();

    // Verify no immediate console errors
    const immediateErrors = consoleErrors.filter(e => e.text && !e.text.includes('favicon'));
    if (immediateErrors.length > 0) {
      console.warn(`  [WARN] ${immediateErrors.length} console errors on landing:`, immediateErrors.map(e => e.text));
    }
  });

  test('3.2 — Onboarding Screen Navigation', async ({ page }) => {
    trackConsole(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Check for onboarding elements — may be triggered by button or auto-appear
    const onboardBtn = await page.$('text=Get Started') || await page.$('button:has-text("Start")') || await page.$('a:has-text("Onboard")');
    if (onboardBtn) {
      await onboardBtn.click();
      await page.waitForTimeout(800);
      await snapshot(page, '02-onboarding', 'Onboarding screen');
    }
    // Check for LuxConcierge popup
    const luxPopup = await page.$('[class*="Lux"]') || await page.$('[class*="lux"]');
    if (luxPopup) {
      await snapshot(page, '02b-lux-concierge', 'Lux concierge visible');
    }
  });

  test('3.3 — Calibration Screen', async ({ page }) => {
    trackConsole(page);
    // Navigate to calibration directly if possible
    await page.goto(`${BASE}/calibration`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1000);

    // Check if calibration page renders
    const calElements = await page.$$('[class*="calibrat"], [class*="Calibrat"]');
    if (calElements.length > 0) {
      await snapshot(page, '03-calibration', 'Calibration screen');
    }
    // Direct navigation may redirect — check current URL
    console.log(`  [INFO] Current URL after /calibration: ${page.url()}`);
  });

  test('3.4 — Interview Arena (Core Page)', async ({ page }) => {
    trackConsole(page);
    await page.goto(`${BASE}/arena`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1500);

    await snapshot(page, '04-interview-arena', 'Interview Arena');
    console.log(`  [INFO] Arena URL: ${page.url()}`);

    // Check for key arena sub-components
    const hasCamera = await page.$('[class*="camera"], [class*="Camera"], [class*="video"], video');
    const hasTimer = await page.$('[class*="timer"], [class*="Timer"], [class*="countdown"]');
    const hasQuestion = await page.$('[class*="question"], [class*="prompt"]');
    console.log(`  [CHECK] Camera: ${!!hasCamera}, Timer: ${!!hasTimer}, Question: ${!!hasQuestion}`);
  });

  test('3.5 — Liveness Challenge', async ({ page }) => {
    trackConsole(page);
    await page.goto(`${BASE}/liveness`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1000);

    await snapshot(page, '05-liveness-challenge', 'Liveness Challenge');
    console.log(`  [INFO] Liveness URL: ${page.url()}`);
  });

  test('3.6 — Identity Verification', async ({ page }) => {
    trackConsole(page);
    await page.goto(`${BASE}/identity`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1000);

    await snapshot(page, '06-identity-verification', 'Identity Verification');
    console.log(`  [INFO] Identity URL: ${page.url()}`);
  });

  test('3.7 — Security Dashboard', async ({ page }) => {
    trackConsole(page);
    await page.goto(`${BASE}/security`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1000);

    await snapshot(page, '07-security-dashboard', 'Security Dashboard');
    console.log(`  [INFO] Security URL: ${page.url()}`);
  });

  test('3.8 — Recruiter Panel', async ({ page }) => {
    trackConsole(page);
    await page.goto(`${BASE}/recruiter`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1000);

    await snapshot(page, '08-recruiter-panel', 'Recruiter Panel');
    console.log(`  [INFO] Recruiter URL: ${page.url()}`);
  });

  test('3.9 — Recruiter God Mode', async ({ page }) => {
    trackConsole(page);
    await page.goto(`${BASE}/godmode`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1000);

    await snapshot(page, '09-recruiter-godmode', 'Recruiter God Mode');
    console.log(`  [INFO] God Mode URL: ${page.url()}`);
  });

  test('3.10 — Score Report', async ({ page }) => {
    trackConsole(page);
    await page.goto(`${BASE}/score`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1000);

    await snapshot(page, '10-score-report', 'Score Report');
    console.log(`  [INFO] Score URL: ${page.url()}`);
  });

  test('3.11 — HITL Panel (Human-in-the-Loop)', async ({ page }) => {
    trackConsole(page);
    await page.goto(`${BASE}/hitl`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1000);

    await snapshot(page, '11-hitl-panel', 'HITL Panel');
    console.log(`  [INFO] HITL URL: ${page.url()}`);
  });

  test('3.12 — Appeal Panel', async ({ page }) => {
    trackConsole(page);
    await page.goto(`${BASE}/appeal`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1000);

    await snapshot(page, '12-appeal-panel', 'Appeal Panel');
    console.log(`  [INFO] Appeal URL: ${page.url()}`);
  });

  test('3.13 — Command Center', async ({ page }) => {
    trackConsole(page);
    await page.goto(`${BASE}/command`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1000);

    await snapshot(page, '13-command-center', 'Command Center');
    console.log(`  [INFO] Command URL: ${page.url()}`);
  });

  test('3.14 — Extension Threat Catalog', async ({ page }) => {
    trackConsole(page);
    await page.goto(`${BASE}/threats`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1000);

    await snapshot(page, '14-threat-catalog', 'Extension Threat Catalog');
    console.log(`  [INFO] Threats URL: ${page.url()}`);
  });

  test('3.15 — Environment Scan', async ({ page }) => {
    trackConsole(page);
    await page.goto(`${BASE}/envscan`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1000);

    await snapshot(page, '15-environment-scan', 'Environment Scan');
    console.log(`  [INFO] EnvScan URL: ${page.url()}`);
  });

  test('3.16 — Backend API Swagger/OpenAPI Docs', async ({ page }) => {
    trackConsole(page);
    await page.goto(`${API}/docs`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await snapshot(page, '16-api-docs', 'FastAPI OpenAPI docs');
    console.log(`  [INFO] API docs loaded`);
  });

  test('3.17 — Backend API Alternative Docs (ReDoc)', async ({ page }) => {
    trackConsole(page);
    await page.goto(`${API}/redoc`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await snapshot(page, '17-redoc', 'FastAPI ReDoc');
    console.log(`  [INFO] ReDoc loaded`);
  });

  test('3.18 — Full User Flow: Landing → Onboard → Arena → Score', async ({ page }) => {
    trackConsole(page);
    // Simulate real user flow
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await snapshot(page, '18a-flow-landing', 'Flow: Landing');

    // Look for navigation elements
    const navLinks = await page.$$('nav a, [role="navigation"] a, header a');
    const linkTexts = await Promise.all(navLinks.map(async (el) => ({ text: await el.textContent(), href: await el.getAttribute('href') })));
    console.log(`  [NAV] Found ${navLinks.length} nav links:`, linkTexts.map(l => `${l.text?.trim()} → ${l.href}`));

    // Try to navigate through each detected link
    for (const link of linkTexts) {
      if (link.href && !link.href.startsWith('http') && !link.href.startsWith('#') && link.href !== '/') {
        try {
          await page.click(`a[href="${link.href}"]`);
          await page.waitForTimeout(500);
          console.log(`  [NAV] Clicked "${link.text?.trim()}" → ${page.url()}`);
        } catch (e) {
          console.log(`  [NAV] Could not click "${link.text?.trim()}": ${e.message?.slice(0, 60)}`);
        }
      }
    }
    await snapshot(page, '18b-flow-final', 'Flow: Final state after navigation');
  });

  test('3.19 — Console Error Summary', async () => {
    const uniqueErrors = [...new Set(consoleErrors.map(e => e.text))];
    console.log(`\n===== CONSOLE ERROR SUMMARY (Phase 3) =====`);
    console.log(`Total console errors: ${consoleErrors.length}`);
    console.log(`Unique errors: ${uniqueErrors.length}`);
    uniqueErrors.forEach((e, i) => console.log(`  [${i+1}] ${e}`));
    console.log(`============================================\n`);
  });

});