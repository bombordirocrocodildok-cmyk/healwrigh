import * as fs from 'node:fs';
import { SelectorHealer } from './healer.js';
import { PlaywrightErrorParser } from './parser.js';
import { TestPatcher } from './patcher.js';
import {
  CandidateMatch,
  FailedLocatorInfo,
  HealerOptions,
  HealingReport,
} from './types.js';

export * from './types.js';
export { SelectorHealer } from './healer.js';
export { PlaywrightErrorParser } from './parser.js';
export { TestPatcher } from './patcher.js';

/**
 * High-level API to heal a single failing locator given an HTML snapshot
 */
export function healLocator(
  failedInfo: FailedLocatorInfo,
  htmlSnapshot: string,
  options: HealerOptions = {}
): HealingReport {
  const report = SelectorHealer.heal(failedInfo, htmlSnapshot, options);

  if (report.success && report.bestCandidate && fs.existsSync(failedInfo.filePath)) {
    const patch = TestPatcher.patch(
      failedInfo,
      report.bestCandidate,
      options.autoApply ?? false
    );
    report.patchDiff = patch.diff;
    if (patch.applied) {
      report.modifiedFile = failedInfo.filePath;
    }
  }

  return report;
}

/**
 * Parse an entire Playwright error log and attempt to heal all detected failed locators
 */
export function healPlaywrightLog(
  logContent: string,
  htmlSnapshot: string,
  options: HealerOptions = {}
): HealingReport[] {
  const failures = PlaywrightErrorParser.parseLog(logContent);
  return failures.map((fail) => healLocator(fail, htmlSnapshot, options));
}
