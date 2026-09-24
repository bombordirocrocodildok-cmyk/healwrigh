import * as fs from 'node:fs';
import * as path from 'node:path';
import { healLocator, healPlaywrightLog } from './index.js';
import { PlaywrightErrorParser } from './parser.js';
import { FailedLocatorInfo } from './types.js';

export function runCLI(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('-v') || args.includes('--version')) {
    console.log('HealWright v1.0.0');
    process.exit(0);
  }

  const command = args[0];

  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };

  const hasFlag = (flag: string): boolean => args.includes(flag);

  const isJson = hasFlag('--json');
  const apply = hasFlag('--apply');

  if (command === 'fix') {
    const testFile = getArg('--test-file') || getArg('-f');
    const lineStr = getArg('--line') || getArg('-l');
    const selector = getArg('--selector') || getArg('-s');
    const htmlPath = getArg('--html');

    if (!testFile) {
      console.error('Error: --test-file is required for fix command.');
      process.exit(1);
    }

    if (!htmlPath) {
      console.error('Error: --html snapshot file is required.');
      process.exit(1);
    }

    if (!fs.existsSync(htmlPath)) {
      console.error(`Error: HTML snapshot file not found: ${htmlPath}`);
      process.exit(1);
    }

    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    const lineNumber = lineStr ? parseInt(lineStr, 10) : 1;

    let failedInfo: FailedLocatorInfo;
    try {
      failedInfo = PlaywrightErrorParser.extractFromTestFile(
        testFile,
        lineNumber,
        selector
      );
    } catch (err: any) {
      console.error(`Error parsing test file: ${err.message}`);
      process.exit(1);
    }

    const report = healLocator(failedInfo, htmlContent, {
      autoApply: apply,
    });

    if (isJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
    }

    process.exit(report.success ? 0 : 1);
  }

  if (command === 'scan') {
    const logPath = getArg('--log');
    const htmlPath = getArg('--html');

    if (!logPath || !fs.existsSync(logPath)) {
      console.error('Error: Valid --log file is required for scan command.');
      process.exit(1);
    }

    if (!htmlPath || !fs.existsSync(htmlPath)) {
      console.error('Error: Valid --html snapshot file is required.');
      process.exit(1);
    }

    const logContent = fs.readFileSync(logPath, 'utf-8');
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    const reports = healPlaywrightLog(logContent, htmlContent, {
      autoApply: apply,
    });

    if (isJson) {
      console.log(JSON.stringify(reports, null, 2));
    } else {
      console.log(`\n🔍 Scanned log: Found ${reports.length} failing locator(s)\n`);
      for (const rep of reports) {
        printReport(rep);
      }
    }

    const anyFailed = reports.some((r) => !r.success);
    process.exit(anyFailed ? 1 : 0);
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

function printHelp(): void {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                      ✨ HEALWRIGHT ✨                         ║
║  Autonomous Self-Healing E2E Test & Selector Repair Engine    ║
╚═══════════════════════════════════════════════════════════════╝

Usage:
  healwright fix [options]
  healwright scan [options]

Commands:
  fix       Heal a specific broken locator in a Playwright test file
  scan      Scan a Playwright test run output log and auto-repair failures

Options:
  -f, --test-file <path>   Path to the broken Playwright test file (.spec.ts)
  -l, --line <number>      Line number of the failing locator
  -s, --selector <query>   Original selector or hint
  --html <path>            HTML snapshot taken at failure time
  --log <path>             Playwright console output / failure log file
  --apply                  Directly apply the healed selector to the file
  --json                   Output structured JSON for AI Agents & CI
  -v, --version            Display version
  -h, --help               Display this help guide

Examples:
  healwright fix -f tests/auth.spec.ts -l 15 --html snapshots/page.html
  healwright fix -f tests/checkout.spec.ts -l 42 --html snap.html --apply
  healwright scan --log playwright-report.log --html snap.html --apply
`);
}

function printReport(report: any): void {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎯 Target File:    ${report.original.filePath}:${report.original.lineNumber}`);
  console.log(`❌ Old Selector:   ${report.original.originalSelector}`);

  if (report.success && report.bestCandidate) {
    const best = report.bestCandidate;
    console.log(`✅ Healed Locator: ${best.suggestedLocator}`);
    console.log(`📊 Confidence:     ${Math.round(best.confidence * 100)}%`);
    console.log(`💡 Strategy:       ${best.strategy}`);
    console.log(`📝 Reason:         ${best.reason}`);

    if (report.patchDiff) {
      console.log(`\nProposed Diff:\n${report.patchDiff}`);
    }

    if (report.modifiedFile) {
      console.log(`\n🚀 [Auto-Applied] File successfully patched!`);
    } else {
      console.log(`\nℹ️  Run with --apply to automatically update the test file.`);
    }
  } else {
    console.log(`⚠️  Could not confidently heal this selector. Candidate count: ${report.candidates.length}`);
  }
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}
