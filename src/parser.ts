import * as fs from 'node:fs';
import { FailedLocatorInfo } from './types.js';

export class PlaywrightErrorParser {
  /**
   * Parse Playwright error logs or terminal output to extract failure context
   */
  public static parseLog(logOutput: string): FailedLocatorInfo[] {
    const failures: FailedLocatorInfo[] = [];

    // Regex to match "waiting for locator('...')" or "locator.click: Timeout ... waiting for getBy..."
    const locatorRegex =
      /(?:waiting for (?:locator|getByRole|getByTestId|getByText|getByLabel)\(['"]([^'"]+)['"]\)|locator\(['"]([^'"]+)['"]\))/gi;

    // Regex to match stacktrace line: "at /path/to/test.spec.ts:12:34" or "at tests/checkout.spec.ts:42:15"
    const stackRegex =
      /at\s+(?:.*?\s+\()?([a-zA-Z0-9_./\\-]+\.(?:spec|test)\.[jt]sx?):(\d+):(\d+)\)?/i;

    const lines = logOutput.split(/\r?\n/);
    let currentSelector: string | null = null;
    let currentMethod = 'locator';
    let currentError: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentError.push(line);

      // Check for selector patterns
      const locMatch =
        /waiting for (locator|getByRole|getByTestId|getByText|getByLabel)\(['"]([^'"]+)['"]\)/i.exec(
          line
        ) ||
        /(locator|getByRole|getByTestId|getByText|getByLabel)\(['"]([^'"]+)['"]\)/i.exec(
          line
        );

      if (locMatch) {
        currentMethod = locMatch[1];
        currentSelector = locMatch[2];
      }

      // Check for stack trace
      const stackMatch = stackRegex.exec(line);
      if (stackMatch && currentSelector) {
        const filePath = stackMatch[1];
        const lineNumber = parseInt(stackMatch[2], 10);
        const columnNumber = parseInt(stackMatch[3], 10);

        let contextLine = '';
        if (fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const fileLines = content.split(/\r?\n/);
            contextLine = fileLines[lineNumber - 1] || '';
          } catch {
            // Ignore file read error if path is relative or missing
          }
        }

        failures.push({
          originalSelector: currentSelector,
          locatorMethod: currentMethod,
          filePath,
          lineNumber,
          columnNumber,
          errorMessage: currentError.slice(-10).join('\n'),
          contextLine: contextLine.trim(),
        });

        // Reset for next potential failure in the log
        currentSelector = null;
        currentError = [];
      }
    }

    return failures;
  }

  /**
   * Directly extract failure locator from a test file if given file and line number
   */
  public static extractFromTestFile(
    filePath: string,
    lineNumber: number,
    hintSelector?: string
  ): FailedLocatorInfo {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Test file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const lineIndex = lineNumber - 1;

    if (lineIndex < 0 || lineIndex >= lines.length) {
      throw new Error(
        `Line ${lineNumber} out of bounds for file ${filePath} (${lines.length} lines)`
      );
    }

    const contextLine = lines[lineIndex];
    let selector = hintSelector || '';
    let method = 'locator';

    if (!selector) {
      const match =
        /(locator|getByRole|getByTestId|getByText|getByLabel)\(\s*['"`]([^'"`]+)['"`]/i.exec(
          contextLine
        );
      if (match) {
        method = match[1];
        selector = match[2];
      } else {
        selector = contextLine.trim();
      }
    }

    return {
      originalSelector: selector,
      locatorMethod: method,
      filePath,
      lineNumber,
      contextLine: contextLine.trim(),
    };
  }
}
