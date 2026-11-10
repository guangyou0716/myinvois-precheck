export type Severity = 'error' | 'warning';

export interface Finding {
  rule: string;
  severity: Severity;
  path: string;
  message: string;
  lhdnCode?: string;
  docUrl: string;
}

/** `ok` is true when `findings` has no error. */
export interface ValidationResult {
  ok: boolean;
  version?: string;
  findings: Finding[];
}
