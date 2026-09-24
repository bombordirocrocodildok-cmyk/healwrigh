import * as fs from 'node:fs';
import { CandidateMatch, FailedLocatorInfo } from './types.js';

export interface PatchResult {
  filePath: string;
  originalLine: string;
  patchedLine: string;
  diff: string;
  applied: boolean;
}

export class TestPatcher {
  /**
   * Generates diff and optionally updates the file on disk
   */
  public static patch(
    failedInfo: FailedLocatorInfo,
    bestMatch: CandidateMatch,
    applyToFile = false
  ): PatchResult {
    if (!fs.existsSync(failedInfo.filePath)) {
      throw new Error(`File not found: ${failedInfo.filePath}`);
    }

    const content = fs.readFileSync(failedInfo.filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const lineIdx = failedInfo.lineNumber - 1;

    if (lineIdx < 0 || lineIdx >= lines.length) {
      throw new Error(
        `Invalid line number ${failedInfo.lineNumber} for file ${failedInfo.filePath}`
      );
    }

    const originalLine = lines[lineIdx];
    let patchedLine = originalLine;

    // Pattern A: page.locator('...') -> replace with new locator
    // Or page.getByRole(...) / page.getByTestId(...)
    const locatorCallRegex =
      /(?:page\.)?(locator|getByRole|getByTestId|getByText|getByLabel)\(['"][^'"]+['"](?:\s*,\s*\{[^}]*\})?\)/;

    if (locatorCallRegex.test(originalLine)) {
      patchedLine = originalLine.replace(
        locatorCallRegex,
        bestMatch.suggestedLocator
      );
    } else if (originalLine.includes(failedInfo.originalSelector)) {
      // Direct substring replace if exact selector text is found
      patchedLine = originalLine.replace(
        failedInfo.originalSelector,
        bestMatch.rawSelector
      );
    } else {
      // Fallback: replace within quotes
      const quoteMatch = /(['"`])([^'"`]+)(['"`])/.exec(originalLine);
      if (quoteMatch) {
        patchedLine = originalLine.replace(
          quoteMatch[0],
          `'${bestMatch.rawSelector}'`
        );
      }
    }

    const diff = TestPatcher.generateDiff(
      failedInfo.filePath,
      failedInfo.lineNumber,
      originalLine,
      patchedLine
    );

    if (applyToFile && originalLine !== patchedLine) {
      lines[lineIdx] = patchedLine;
      fs.writeFileSync(failedInfo.filePath, lines.join('\n'), 'utf-8');
    }

    return {
      filePath: failedInfo.filePath,
      originalLine,
      patchedLine,
      diff,
      applied: applyToFile && originalLine !== patchedLine,
    };
  }

  public static generateDiff(
    filePath: string,
    lineNumber: number,
    oldLine: string,
    newLine: string
  ): string {
    return [
      `--- ${filePath}:${lineNumber}`,
      `+++ ${filePath}:${lineNumber}`,
      `@@ -${lineNumber},1 +${lineNumber},1 @@`,
      `- ${oldLine}`,
      `+ ${newLine}`,
    ].join('\n');
  }
}
