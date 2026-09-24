import test from 'node:test';
import assert from 'node:assert/strict';
import { SelectorHealer } from '../src/healer.js';
import { PlaywrightErrorParser } from '../src/parser.js';
import { TestPatcher } from '../src/patcher.js';

test('SelectorHealer recovers broken selector using test-id and tokens', () => {
  const sampleHtml = `
    <main>
      <form id="auth-box">
        <input type="email" placeholder="Email address" />
        <button data-testid="login-submit" class="btn-primary">Sign In</button>
      </form>
    </main>
  `;

  const failure = {
    originalSelector: '#old-login-btn',
    locatorMethod: 'locator',
    filePath: 'test.spec.ts',
    lineNumber: 10,
    contextLine: "await page.locator('#old-login-btn').click();",
  };

  const report = SelectorHealer.heal(failure, sampleHtml);
  assert.equal(report.success, true);
  assert.ok(report.bestCandidate);
  assert.equal(report.bestCandidate.suggestedLocator, "page.getByTestId('login-submit')");
  assert.ok(report.bestCandidate.confidence >= 0.5);
});

test('SelectorHealer recovers element using accessible role and name', () => {
  const sampleHtml = `
    <div>
      <button class="nav-btn">Save Changes</button>
    </div>
  `;

  const failure = {
    originalSelector: 'button#btn-save',
    locatorMethod: 'locator',
    filePath: 'test.spec.ts',
    lineNumber: 14,
  };

  const report = SelectorHealer.heal(failure, sampleHtml);
  assert.equal(report.success, true);
  assert.ok(report.bestCandidate);
  assert.equal(
    report.bestCandidate.suggestedLocator,
    "page.getByRole('button', { name: 'Save Changes' })"
  );
});

test('PlaywrightErrorParser parses terminal failure output', () => {
  const mockLog = `
Running 1 test using 1 worker
  1) [chromium] › checkout.spec.ts:18:3 › checkout flow ───
    Error: locator.click: Target page, context or browser has been closed
    Call log:
      - waiting for locator('#broken-submit')
    
       16 |   await page.goto('/checkout');
       17 |   // click submit
    >  18 |   await page.locator('#broken-submit').click();
          |              ^
       19 | });

        at checkout.spec.ts:18:14
  `;

  const failures = PlaywrightErrorParser.parseLog(mockLog);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].originalSelector, '#broken-submit');
  assert.equal(failures[0].lineNumber, 18);
});
