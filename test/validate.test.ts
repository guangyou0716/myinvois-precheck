import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STRUCTURE } from '../src/docs.js';
import {
  formatJson,
  formatText,
  validateDocument,
  validateJson,
  type ValidationResult,
} from '../src/index.js';

function loadFixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

function loadFixtureJson(name: string): unknown {
  return JSON.parse(loadFixture(name)) as unknown;
}

describe('validateJson', () => {
  it('returns a single structure.json-parse error for invalid JSON', () => {
    const result = validateJson('{');
    expect(result.ok).toBe(false);
    expect(result.version).toBeUndefined();
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      rule: 'structure.json-parse',
      severity: 'error',
      path: '',
      docUrl: STRUCTURE,
    });
    expect(result.findings[0]?.message).toMatch(/JSON parse failed/);
  });

  it('parses JSON and validates the document', () => {
    const result = validateJson(loadFixture('valid-invoice-1.1.json'));
    expect(result.ok).toBe(true);
    expect(result.version).toBe('1.1');
  });

  it('strips a leading UTF-8 BOM before parsing', () => {
    const result = validateJson(`\uFEFF${loadFixture('valid-invoice-1.1.json')}`);
    expect(result.ok).toBe(true);
    expect(result.version).toBe('1.1');
  });
});

describe('validateDocument', () => {
  it('stops at structure when Invoice[0] is missing', () => {
    const result = validateDocument({ Invoice: [] });
    expect(result.ok).toBe(false);
    expect(result.version).toBeUndefined();
    expect(result.findings.every((finding) => finding.rule.startsWith('structure.'))).toBe(true);
    expect(result.findings.some((finding) => finding.rule === 'structure.root')).toBe(true);
  });

  it('stops at structure for a non-object document', () => {
    const result = validateDocument(null);
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([
      expect.objectContaining({ rule: 'structure.root', severity: 'error' }),
    ]);
  });

  it('sets version from InvoiceTypeCode listVersionID', () => {
    expect(validateDocument(loadFixtureJson('valid-invoice-1.1.json')).version).toBe('1.1');
    expect(validateDocument(loadFixtureJson('valid-invoice-1.0.json')).version).toBe('1.0');
    expect(validateDocument(loadFixtureJson('invalid-missing-fields.json')).version).toBe('1.1');
  });

  it('runs all rule modules when Invoice[0] is present', () => {
    const missing = validateDocument(loadFixtureJson('invalid-missing-fields.json'));
    expect(missing.ok).toBe(false);
    expect(missing.findings.some((finding) => finding.rule.startsWith('required'))).toBe(true);

    const codes = validateDocument(loadFixtureJson('invalid-codes.json'));
    expect(codes.ok).toBe(false);
    expect(codes.findings.some((finding) => finding.rule.startsWith('codes.'))).toBe(true);

    const math = validateDocument(loadFixtureJson('invalid-math.json'));
    expect(math.ok).toBe(false);
    expect(math.findings.some((finding) => finding.rule.startsWith('math.'))).toBe(true);

    const parties = validateDocument(loadFixtureJson('invalid-parties.json'));
    expect(parties.ok).toBe(false);
    expect(parties.findings.some((finding) => finding.rule.startsWith('parties.'))).toBe(true);
  });

  it('accepts the valid 1.0 and 1.1 fixtures', () => {
    const v11 = validateDocument(loadFixtureJson('valid-invoice-1.1.json'));
    expect(v11.ok, JSON.stringify(v11.findings, null, 2)).toBe(true);
    expect(v11.findings.filter((finding) => finding.severity === 'error')).toEqual([]);

    const v10 = validateDocument(loadFixtureJson('valid-invoice-1.0.json'));
    expect(v10.ok, JSON.stringify(v10.findings, null, 2)).toBe(true);
    expect(v10.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
  });

  it('is ok when findings are warnings only', () => {
    const doc = loadFixtureJson('valid-invoice-1.1.json') as Record<string, unknown>;
    doc._D = 'not-the-invoice-urn';
    const result = validateDocument(doc);
    expect(result.findings.some((finding) => finding.rule === 'structure.namespace')).toBe(true);
    expect(result.findings.some((finding) => finding.severity === 'error')).toBe(false);
    expect(result.ok).toBe(true);
  });
});

function cloneValidInvoice(): Record<string, unknown> {
  return structuredClone(loadFixtureJson('valid-invoice-1.1.json')) as Record<string, unknown>;
}

function walkRecords(node: unknown, visit: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walkRecords(child, visit);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const record = node as Record<string, unknown>;
  visit(record);
  for (const value of Object.values(record)) walkRecords(value, visit);
}

describe('padded attributes', () => {
  it('treats schemeID " TIN" as TIN: bad TIN is reported and whitespace is warned', () => {
    const doc = cloneValidInvoice();
    walkRecords(doc, (record) => {
      if (record.schemeID === 'TIN' && record._ === 'C1234567890') {
        record.schemeID = ' TIN';
        record._ = 'XX1234567890';
      }
    });
    const result = validateDocument(doc);
    const rules = result.findings.map((finding) => finding.rule);
    expect(rules).toContain('parties.tin-format');
    expect(rules).toContain('structure.attribute-whitespace');
    expect(
      result.findings.some(
        (finding) =>
          finding.rule === 'structure.attribute-whitespace' &&
          finding.path ===
            'Invoice/AccountingSupplierParty/Party/PartyIdentification/ID@schemeID',
      ),
    ).toBe(true);
  });

  it('treats listID "CLASS " as CLASS so an unknown classification is reported', () => {
    const doc = cloneValidInvoice();
    let mutated = false;
    walkRecords(doc, (record) => {
      if (!mutated && record.listID === 'CLASS' && record._ === '022') {
        record.listID = 'CLASS ';
        record._ = '999';
        mutated = true;
      }
    });
    const result = validateDocument(doc);
    expect(result.findings.some((finding) => finding.rule === 'codes.classification')).toBe(true);
    expect(result.findings.some((finding) => finding.rule === 'structure.attribute-whitespace')).toBe(
      true,
    );
  });

  it('treats currencyID " MYR" as MYR', () => {
    const doc = cloneValidInvoice();
    let mutated = false;
    walkRecords(doc, (record) => {
      if (!mutated && record.currencyID === 'MYR') {
        record.currencyID = ' MYR';
        mutated = true;
      }
    });
    const result = validateDocument(doc);
    expect(result.findings.some((finding) => finding.rule.startsWith('currency.'))).toBe(false);
    expect(result.findings.some((finding) => finding.rule === 'codes.currency')).toBe(false);
    expect(result.findings.some((finding) => finding.rule === 'structure.attribute-whitespace')).toBe(
      true,
    );
    expect(result.ok).toBe(true);
  });
});

describe('formatText', () => {
  const sample: ValidationResult = {
    ok: false,
    version: '1.1',
    findings: [
      {
        rule: 'required',
        severity: 'error',
        path: 'Invoice/DocumentCurrencyCode',
        message: 'DocumentCurrencyCode is missing.',
        lhdnCode: 'CF378',
        docUrl: 'https://example.test/core',
      },
      {
        rule: 'structure.namespace',
        severity: 'warning',
        path: '_D',
        message: 'namespaces incomplete',
        docUrl: 'https://example.test/structure',
      },
    ],
  };

  it('prints file, version, FAIL, findings, and summary counts', () => {
    const text = formatText(sample, 'inv.json');
    expect(text).toContain('inv.json  1.1  FAIL');
    expect(text).toContain(
      'ERROR  required  [CF378]  Invoice/DocumentCurrencyCode  DocumentCurrencyCode is missing.',
    );
    expect(text).toContain('  see: https://example.test/core');
    expect(text).toContain('WARN  structure.namespace  _D  namespaces incomplete');
    expect(text).toContain('  see: https://example.test/structure');
    expect(text).toContain('1 error, 1 warning');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('prints PASS and a zero summary when there are no findings', () => {
    const text = formatText({ ok: true, version: '1.0', findings: [] }, 'ok.json');
    expect(text).toBe('ok.json  1.0  PASS\n0 errors, 0 warnings\n');
  });

  it('uses "-" when version is missing', () => {
    const text = formatText({ ok: false, findings: [] }, 'x.json');
    expect(text.startsWith('x.json  -  FAIL\n')).toBe(true);
  });
});

describe('formatJson', () => {
  it('prints pretty JSON with file, ok, version, counts, and findings', () => {
    const result: ValidationResult = {
      ok: false,
      version: '1.1',
      findings: [
        {
          rule: 'required',
          severity: 'error',
          path: 'Invoice/DocumentCurrencyCode',
          message: 'DocumentCurrencyCode is missing.',
          lhdnCode: 'CF378',
          docUrl: 'https://example.test/core',
        },
      ],
    };
    const parsed: unknown = JSON.parse(formatJson(result, 'inv.json'));
    expect(parsed).toEqual({
      file: 'inv.json',
      ok: false,
      version: '1.1',
      errorCount: 1,
      warningCount: 0,
      findings: result.findings,
    });
    expect(formatJson(result, 'inv.json')).toMatch(/\n\s+"file": /);
  });
});
