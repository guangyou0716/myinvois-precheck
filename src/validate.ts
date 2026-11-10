import { STRUCTURE } from './docs.js';
import { check as checkCodes } from './rules-codes.js';
import { check as checkCurrency } from './rules-currency.js';
import { check as checkMath } from './rules-math.js';
import { check as checkParties } from './rules-parties.js';
import { check as checkRequired } from './rules-required.js';
import { check as checkStructure } from './rules-structure.js';
import type { Finding, ValidationResult } from './types.js';
import { attr } from './ubl.js';

const extraChecks = [checkRequired, checkParties, checkCodes, checkCurrency, checkMath];

function documentVersion(doc: unknown): string | undefined {
  return attr(doc, 'listVersionID', 'Invoice', 'InvoiceTypeCode');
}

function hasErrors(findings: Finding[]): boolean {
  return findings.some((finding) => finding.severity === 'error');
}

export function validateDocument(doc: unknown): ValidationResult {
  const findings = checkStructure(doc);
  const invoiceMissing = findings.some(
    (finding) => finding.rule === 'structure.root' && finding.severity === 'error',
  );
  // Other rule modules need Invoice[0]; stop when structure.root already reported it missing.
  if (!invoiceMissing) {
    for (const check of extraChecks) {
      findings.push(...check(doc));
    }
  }
  const version = documentVersion(doc);
  const result: ValidationResult = { ok: !hasErrors(findings), findings };
  if (version !== undefined) result.version = version;
  return result;
}

export function validateJson(text: string): ValidationResult {
  const stripped = text.startsWith('\uFEFF') ? text.slice(1) : text;
  let doc: unknown;
  try {
    doc = JSON.parse(stripped);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      findings: [
        {
          rule: 'structure.json-parse',
          severity: 'error',
          path: '',
          message: `JSON parse failed: ${detail}`,
          docUrl: STRUCTURE,
        },
      ],
    };
  }
  return validateDocument(doc);
}
