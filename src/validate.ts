import { STRUCTURE } from './docs.js';
import { check as checkCodes } from './rules-codes.js';
import { check as checkCurrency } from './rules-currency.js';
import { check as checkMath } from './rules-math.js';
import { check as checkParties } from './rules-parties.js';
import { check as checkRequired } from './rules-required.js';
import { check as checkStructure } from './rules-structure.js';
import type { Finding, ValidationResult } from './types.js';
import { attr } from './ubl.js';
import { xmlToUbl } from './xml.js';

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

function parseFinding(rule: string, prefix: string, cause: unknown): ValidationResult {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return {
    ok: false,
    findings: [
      {
        rule,
        severity: 'error',
        path: '',
        message: `${prefix}: ${detail}`,
        docUrl: STRUCTURE,
      },
    ],
  };
}

export function validateJson(text: string): ValidationResult {
  const stripped = text.startsWith('\uFEFF') ? text.slice(1) : text;
  let doc: unknown;
  try {
    doc = JSON.parse(stripped);
  } catch (cause) {
    return parseFinding('structure.json-parse', 'JSON parse failed', cause);
  }
  return validateDocument(doc);
}

export function validateXml(text: string): ValidationResult {
  const stripped = text.startsWith('\uFEFF') ? text.slice(1) : text;
  let doc: unknown;
  try {
    doc = xmlToUbl(stripped);
  } catch (cause) {
    return parseFinding('structure.xml-parse', 'XML parse failed', cause);
  }
  return validateDocument(doc);
}

/** True when the first non-whitespace character is `<` (UTF-8 BOM ignored). */
export function looksLikeXml(text: string): boolean {
  const body = text.startsWith('\uFEFF') ? text.slice(1) : text;
  return body.trimStart().startsWith('<');
}

/** Auto-detect XML vs JSON from the first non-whitespace character. */
export function validate(text: string): ValidationResult {
  return looksLikeXml(text) ? validateXml(text) : validateJson(text);
}
