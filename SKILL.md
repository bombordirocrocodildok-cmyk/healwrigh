---
name: healwright
description: Autonomous self-healing E2E test & selector repair engine for Playwright. Automatically analyzes broken locators, inspects DOM snapshots, computes accessible role/test-id matches, and auto-patches test files.
---

# HealWright: Self-Healing E2E Test Repair Skill

Use this skill whenever:
1. Playwright E2E tests fail due to selector timeouts (`waiting for locator(...)`, element not found, or detached element).
2. The user requests automated repair of broken test locators or migration to accessible Playwright locators (`getByRole`, `getByTestId`).
3. You need to inspect DOM snapshots at the point of failure and generate resilient replacement locators.

## Workflow

### 1. Diagnose Failed Selector
When a Playwright test fails, extract:
- Broken test file path (`tests/checkout.spec.ts`)
- Failure line number (`line 24`)
- Broken selector string (e.g. `#submit-btn`, `.btn-checkout`)
- HTML snapshot at the time of failure (or dump from page DOM)

### 2. Run HealWright CLI

```bash
# Preview proposed healed locator and diff
healwright fix --test-file <path-to-spec> --line <line-number> --html <snapshot.html>

# Or directly apply the fix in-place to the test file:
healwright fix --test-file <path-to-spec> --line <line-number> --html <snapshot.html> --apply
```

### 3. Programmatic Usage in Node.js

```typescript
import { healLocator, PlaywrightErrorParser } from 'healwright';

const report = healLocator({
  originalSelector: '#old-btn',
  locatorMethod: 'locator',
  filePath: 'tests/auth.spec.ts',
  lineNumber: 15
}, htmlSnapshotString, { autoApply: true });

console.log(report.bestCandidate?.suggestedLocator);
```

### 4. Verification Protocol
After applying the patch:
1. Re-run the affected Playwright test (`npx playwright test <file>`).
2. Verify the test passes with the healed, accessible locator.
