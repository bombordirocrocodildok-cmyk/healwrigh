import {
  CandidateMatch,
  FailedLocatorInfo,
  HealerOptions,
  HealingReport,
  ParsedElement,
} from './types.js';

export class SelectorHealer {
  /**
   * Robust HTML element extractor without heavy native DOM dependencies
   */
  public static parseElements(html: string): ParsedElement[] {
    const elements: ParsedElement[] = [];

    // Match each opening tag: <tag attr="val">
    const openTagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/gi;
    let match: RegExpExecArray | null;

    while ((match = openTagRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase();
      const rawAttrs = match[2] || '';
      const startIndex = match.index + match[0].length;

      // Skip doctype, comments, script, style
      if (['!doctype', 'script', 'style', 'head', 'meta', 'link'].includes(tag)) {
        continue;
      }

      const attributes = SelectorHealer.parseAttributes(rawAttrs);

      // Extract text content between this tag and its closing tag, or up to 400 chars
      const closeTag = `</${tag}>`;
      const closeIndex = html.indexOf(closeTag, startIndex);
      let innerContent = '';

      if (closeIndex !== -1 && closeIndex - startIndex < 2000) {
        innerContent = html.substring(startIndex, closeIndex);
      }

      // Clean inner text (strip HTML tags)
      const cleanText = innerContent
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      elements.push({
        tag,
        attributes,
        text: cleanText,
        fullHtml: match[0],
      });
    }

    return elements;
  }

  private static parseAttributes(rawAttrs: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const attrRegex =
      /([a-zA-Z0-9_:-]+)(?:=(?:["']([^"']*)["']|([^\s>]+)))?/g;
    let match: RegExpExecArray | null;

    while ((match = attrRegex.exec(rawAttrs)) !== null) {
      const key = match[1].toLowerCase();
      const val = match[2] !== undefined ? match[2] : match[3] || '';
      attrs[key] = val;
    }
    return attrs;
  }

  /**
   * Main healing logic: evaluates candidates across heuristics
   */
  public static heal(
    failedInfo: FailedLocatorInfo,
    htmlSnapshot: string,
    options: HealerOptions = {}
  ): HealingReport {
    const minConfidence = options.minConfidence ?? 0.45;
    const elements = SelectorHealer.parseElements(htmlSnapshot);
    const candidates: CandidateMatch[] = [];

    const searchTokens = SelectorHealer.extractTokens(failedInfo.originalSelector);

    for (const el of elements) {
      const match = SelectorHealer.scoreElement(el, failedInfo, searchTokens);
      if (match && match.confidence >= minConfidence) {
        candidates.push(match);
      }
    }

    // Sort descending by confidence
    candidates.sort((a, b) => b.confidence - a.confidence);

    const best = candidates.length > 0 ? candidates[0] : undefined;

    return {
      success: !!best,
      original: failedInfo,
      candidates,
      bestCandidate: best,
      timestamp: new Date().toISOString(),
    };
  }

  private static scoreElement(
    el: ParsedElement,
    failedInfo: FailedLocatorInfo,
    tokens: string[]
  ): CandidateMatch | null {
    let score = 0;
    const reasons: string[] = [];
    let strategy: CandidateMatch['strategy'] = 'fuzzy-text';

    const testId =
      el.attributes['data-testid'] ||
      el.attributes['data-test'] ||
      el.attributes['data-cy'];

    const ariaRole = el.attributes['role'] || SelectorHealer.getImplicitRole(el.tag, el.attributes);
    const accessibleName =
      el.attributes['aria-label'] ||
      el.attributes['placeholder'] ||
      el.attributes['value'] ||
      el.text;

    // 1. Test-ID exact or token match
    if (testId) {
      const tokenMatch = tokens.some((t) =>
        testId.toLowerCase().includes(t.toLowerCase())
      );
      if (tokenMatch) {
        score += 0.55;
        strategy = 'test-id';
        reasons.push(`Matching test-id token: "${testId}"`);
      }
    }

    // 2. Role + Accessible Name match
    if (ariaRole && accessibleName) {
      const nameTokens = SelectorHealer.extractTokens(accessibleName);
      const overlap = tokens.filter((t) =>
        nameTokens.some((nt) => nt.toLowerCase() === t.toLowerCase())
      );

      if (overlap.length > 0) {
        score += 0.5 + overlap.length * 0.15;
        strategy = 'role-name';
        reasons.push(
          `Role "${ariaRole}" matches accessible name "${accessibleName}" on tokens: ${overlap.join(', ')}`
        );
      }
    }

    // 3. ID / Class / Name attribute similarity
    const idVal = el.attributes['id'] || '';
    if (idVal) {
      const idTokens = SelectorHealer.extractTokens(idVal);
      const overlap = tokens.filter((t) =>
        idTokens.some((it) => it.toLowerCase() === t.toLowerCase())
      );
      if (overlap.length > 0) {
        score += 0.45;
        reasons.push(`ID attribute "${idVal}" shares tokens: ${overlap.join(', ')}`);
      }
    }

    // 4. Tag relevance
    const oldTagMatch = /^(button|input|a|select|textarea|form)/i.exec(
      failedInfo.originalSelector
    );
    if (oldTagMatch && oldTagMatch[1].toLowerCase() === el.tag) {
      score += 0.15;
      reasons.push(`Tag matches "${el.tag}"`);
    }

    // Cap confidence at 0.99
    const confidence = Math.min(Math.round(score * 100) / 100, 0.99);

    if (confidence <= 0.2) {
      return null;
    }

    // Generate modern Playwright locator
    const { suggestedLocator, rawSelector } = SelectorHealer.generatePlaywrightLocator(
      el,
      ariaRole,
      accessibleName,
      testId
    );

    return {
      suggestedLocator,
      rawSelector,
      confidence,
      strategy,
      elementTag: el.tag,
      elementAttributes: el.attributes,
      elementText: el.text,
      reason: reasons.join('; '),
    };
  }

  private static getImplicitRole(tag: string, attrs: Record<string, string>): string | null {
    if (tag === 'button') return 'button';
    if (tag === 'a' && attrs['href']) return 'link';
    if (tag === 'input') {
      const type = (attrs['type'] || 'text').toLowerCase();
      if (['button', 'submit', 'reset'].includes(type)) return 'button';
      if (['checkbox', 'radio'].includes(type)) return type;
      return 'textbox';
    }
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    return null;
  }

  private static generatePlaywrightLocator(
    el: ParsedElement,
    role: string | null,
    name: string | null,
    testId: string | null
  ): { suggestedLocator: string; rawSelector: string } {
    // Priority 1: getByTestId if available and concise
    if (testId) {
      return {
        suggestedLocator: `page.getByTestId('${testId}')`,
        rawSelector: `[data-testid="${testId}"]`,
      };
    }

    // Priority 2: getByRole with accessible name
    if (role && name && name.length <= 40) {
      const cleanName = name.replace(/'/g, "\\'");
      return {
        suggestedLocator: `page.getByRole('${role}', { name: '${cleanName}' })`,
        rawSelector: `${el.tag}:has-text("${cleanName}")`,
      };
    }

    // Priority 3: getByLabel if input has label or aria-label
    if (el.attributes['aria-label']) {
      const label = el.attributes['aria-label'].replace(/'/g, "\\'");
      return {
        suggestedLocator: `page.getByLabel('${label}')`,
        rawSelector: `[aria-label="${label}"]`,
      };
    }

    // Priority 4: ID locator
    if (el.attributes['id']) {
      return {
        suggestedLocator: `page.locator('#${el.attributes['id']}')`,
        rawSelector: `#${el.attributes['id']}`,
      };
    }

    // Priority 5: Fallback text locator
    if (el.text && el.text.length > 0 && el.text.length <= 30) {
      const text = el.text.replace(/'/g, "\\'");
      return {
        suggestedLocator: `page.getByText('${text}')`,
        rawSelector: `text="${text}"`,
      };
    }

    return {
      suggestedLocator: `page.locator('${el.tag}')`,
      rawSelector: el.tag,
    };
  }

  public static extractTokens(str: string): string[] {
    return str
      .replace(/[#[\]().=:'"-]/g, ' ')
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && !['page', 'locator', 'click', 'wait'].includes(s.toLowerCase()));
  }
}
