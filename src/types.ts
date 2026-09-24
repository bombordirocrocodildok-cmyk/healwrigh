export interface FailedLocatorInfo {
  originalSelector: string;
  locatorMethod: string;
  filePath: string;
  lineNumber: number;
  columnNumber?: number;
  errorMessage?: string;
  contextLine?: string;
}

export type HealingStrategy =
  | 'role-name'
  | 'test-id'
  | 'fuzzy-text'
  | 'semantic-attribute'
  | 'structural-fallback';

export interface CandidateMatch {
  suggestedLocator: string;
  rawSelector: string;
  confidence: number;
  strategy: HealingStrategy;
  elementTag: string;
  elementAttributes: Record<string, string>;
  elementText: string;
  reason: string;
}

export interface HealingReport {
  success: boolean;
  original: FailedLocatorInfo;
  candidates: CandidateMatch[];
  bestCandidate?: CandidateMatch;
  patchDiff?: string;
  modifiedFile?: string;
  timestamp: string;
}

export interface HealerOptions {
  minConfidence?: number;
  autoApply?: boolean;
  preferredLocatorStyle?: 'playwright-best-practice' | 'css' | 'testid-first';
  htmlSnapshot?: string;
}

export interface ParsedElement {
  tag: string;
  attributes: Record<string, string>;
  text: string;
  fullHtml: string;
  parentTag?: string;
}
