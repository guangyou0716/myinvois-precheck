import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STRUCTURE } from '../src/docs.js';
import { validate, validateJson, validateXml } from '../src/validate.js';
import { XML_MAX_DEPTH, XmlParseError, xmlToUbl } from '../src/xml.js';
import type { Finding, ValidationResult } from '../src/types.js';

const INV = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
const CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
const CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';

const NS = `xmlns="${INV}" xmlns:cac="${CAC}" xmlns:cbc="${CBC}"`;

function invoiceXml(body: string, attrs: string = NS): string {
  return `<Invoice ${attrs}>${body}</Invoice>`;
}

function nestedInvoice(depth: number): string {
  if (depth < 1) throw new Error('depth');
  if (depth === 1) return `<Invoice ${NS}/>`;
  let inner = '<cbc:ID>x</cbc:ID>';
  for (let i = 0; i < depth - 2; i += 1) inner = `<cac:X>${inner}</cac:X>`;
  return invoiceXml(inner);
}

type FindingSig = Pick<Finding, 'rule' | 'severity' | 'path' | 'message'>;

function findingSig(finding: Finding): FindingSig {
  return {
    rule: finding.rule,
    severity: finding.severity,
    path: finding.path,
    message: finding.message,
  };
}

function findingKeys(result: ValidationResult): string[] {
  return result.findings.map((finding) => JSON.stringify(findingSig(finding))).sort();
}

function sigsFromKeys(keys: string[]): FindingSig[] {
  return keys.map((key) => JSON.parse(key) as FindingSig);
}

function sortSigs(sigs: readonly FindingSig[]): FindingSig[] {
  return [...sigs].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function parseError(text: string): XmlParseError {
  try {
    xmlToUbl(text);
  } catch (cause) {
    expect(cause).toBeInstanceOf(XmlParseError);
    return cause as XmlParseError;
  }
  throw new Error('expected xmlToUbl to throw');
}

function expectOwn(obj: object, key: string, value: unknown): void {
  expect(Object.hasOwn(obj, key)).toBe(true);
  expect(Object.getOwnPropertyDescriptor(obj, key)).toEqual({
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

describe('xmlToUbl', () => {
  it('converts a minimal Invoice to the UBL JSON shape', () => {
    expect(xmlToUbl(invoiceXml('<cbc:ID>x</cbc:ID>'))).toEqual({
      _D: INV,
      _A: CAC,
      _B: CBC,
      Invoice: [{ ID: [{ _: 'x' }] }],
    });
  });

  it('skips an XML declaration, comments, and processing instructions', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <!-- leading comment -->
      <?xml-stylesheet type="text/xsl" href="n.xsl"?>
      <Invoice ${NS}>
        <!-- inner -->
        <?pi data?>
        <cbc:ID>ok</cbc:ID>
      </Invoice>
      <!-- trailing -->
      <?tail ?>`;
    expect(xmlToUbl(xml)).toEqual({
      _D: INV,
      _A: CAC,
      _B: CBC,
      Invoice: [{ ID: [{ _: 'ok' }] }],
    });
  });

  it('treats CDATA as text', () => {
    const xml = invoiceXml('<cbc:ID><![CDATA[a<b>&c]]></cbc:ID>');
    expect(xmlToUbl(xml)).toEqual({
      _D: INV,
      _A: CAC,
      _B: CBC,
      Invoice: [{ ID: [{ _: 'a<b>&c' }] }],
    });
  });

  it('decodes the five predefined entities and numeric character references', () => {
    const xml = invoiceXml(
      '<cbc:Note>&lt;&gt;&amp;&apos;&quot;&#65;&#x42;&#x6a;</cbc:Note>',
    );
    expect(xmlToUbl(xml)).toEqual({
      _D: INV,
      _A: CAC,
      _B: CBC,
      Invoice: [{ Note: [{ _: `<>&'"ABj` }] }],
    });
  });

  it('accepts attributes quoted with single or double quotes', () => {
    const xml = invoiceXml(
      `<cbc:ID schemeID="TIN" schemeAgencyID='6'>C1234567890</cbc:ID>`,
    );
    expect(xmlToUbl(xml)).toEqual({
      _D: INV,
      _A: CAC,
      _B: CBC,
      Invoice: [{ ID: [{ _: 'C1234567890', schemeID: 'TIN', schemeAgencyID: '6' }] }],
    });
  });

  it('accepts self-closing tags and stores empty leaf text as "_"', () => {
    const xml = invoiceXml('<cbc:Amount currencyID="MYR"/>');
    expect(xmlToUbl(xml)).toEqual({
      _D: INV,
      _A: CAC,
      _B: CBC,
      Invoice: [{ Amount: [{ _: '', currencyID: 'MYR' }] }],
    });
  });

  it('drops namespace prefixes to local names and ignores xmlns attributes', () => {
    const xml = invoiceXml(
      `<cac:Party><cbc:ID schemeID="TIN">n</cbc:ID></cac:Party>
       <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature"/>`,
    );
    const doc = xmlToUbl(xml) as {
      Invoice: Array<Record<string, unknown>>;
    };
    expect(doc.Invoice[0]).toEqual({
      Party: [{ ID: [{ _: 'n', schemeID: 'TIN' }] }],
      Signature: [{ _: '', Id: 'signature' }],
    });
    expect(JSON.stringify(doc.Invoice[0])).not.toContain('xmlns');
  });

  it('ignores whitespace-only text between elements', () => {
    const xml = invoiceXml(`
      <cac:Party>
        <cbc:ID>n</cbc:ID>
      </cac:Party>
    `);
    expect(xmlToUbl(xml)).toEqual({
      _D: INV,
      _A: CAC,
      _B: CBC,
      Invoice: [{ Party: [{ ID: [{ _: 'n' }] }] }],
    });
  });

  it('keeps significant leaf whitespace', () => {
    const xml = invoiceXml('<cbc:ID>  padded  </cbc:ID>');
    expect(xmlToUbl(xml)).toEqual({
      _D: INV,
      _A: CAC,
      _B: CBC,
      Invoice: [{ ID: [{ _: '  padded  ' }] }],
    });
  });

  it('collects repeated child elements as arrays in document order', () => {
    const xml = invoiceXml('<cbc:ID>1</cbc:ID><cbc:ID>2</cbc:ID>');
    expect(xmlToUbl(xml)).toEqual({
      _D: INV,
      _A: CAC,
      _B: CBC,
      Invoice: [{ ID: [{ _: '1' }, { _: '2' }] }],
    });
  });

  it('sets _D/_A/_B from the root xmlns declarations, including non-standard prefixes', () => {
    const xml = `<inv:Invoice xmlns:inv="${INV}" xmlns:agg="${CAC}" xmlns:bas="${CBC}">
      <bas:ID>x</bas:ID>
    </inv:Invoice>`;
    expect(xmlToUbl(xml)).toEqual({
      _D: INV,
      _A: CAC,
      _B: CBC,
      Invoice: [{ ID: [{ _: 'x' }] }],
    });
  });

  it('strips a leading UTF-8 BOM', () => {
    expect(xmlToUbl(`\uFEFF${invoiceXml('<cbc:ID>x</cbc:ID>')}`)).toMatchObject({
      Invoice: [{ ID: [{ _: 'x' }] }],
    });
  });

  it('rejects a non-Invoice root', () => {
    const err = parseError(`<CreditNote ${NS}></CreditNote>`);
    expect(err.message).toMatch(/root element must be Invoice, got CreditNote/);
    expect(err.line).toBe(1);
  });

  it('stores __proto__, constructor, and prototype as own enumerable keys', () => {
    const protoNames = Object.getOwnPropertyNames(Object.prototype);
    const xml = invoiceXml(
      `<__proto__>child-proto</__proto__>
       <constructor>child-ctor</constructor>
       <prototype>child-proto-name</prototype>
       <cbc:Note __proto__="attr-proto" constructor="attr-ctor" prototype="attr-proto-name">n</cbc:Note>`,
    );
    const doc = xmlToUbl(xml) as Record<string, unknown>;
    const invoice = (doc.Invoice as Array<Record<string, unknown>>)[0]!;
    const protoChild = [{ _: 'child-proto' }];
    expectOwn(invoice, '__proto__', protoChild);
    expect(Object.getPrototypeOf(invoice)).not.toBe(Object.getOwnPropertyDescriptor(invoice, '__proto__')?.value);
    expectOwn(invoice, 'constructor', [{ _: 'child-ctor' }]);
    expectOwn(invoice, 'prototype', [{ _: 'child-proto-name' }]);

    const note = (invoice.Note as Array<Record<string, unknown>>)[0]!;
    expectOwn(note, '__proto__', 'attr-proto');
    expectOwn(note, 'constructor', 'attr-ctor');
    expectOwn(note, 'prototype', 'attr-proto-name');
    expectOwn(note, '_', 'n');

    for (const node of [doc, invoice, note]) {
      const proto = Object.getPrototypeOf(node);
      expect(proto === Object.prototype || proto === null).toBe(true);
    }
    expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(protoNames);
  });
});

describe('xmlToUbl rejections', () => {
  it('rejects <!DOCTYPE>', () => {
    const err = parseError(`<!DOCTYPE Invoice>\n${invoiceXml('<cbc:ID>x</cbc:ID>')}`);
    expect(err.message).toMatch(/<!DOCTYPE> is not allowed/);
    expect(err.line).toBe(1);
  });

  it('rejects <!DOCTYPE> case-insensitively', () => {
    const err = parseError(`<!doctype Invoice>\n${invoiceXml('')}`);
    expect(err.message).toMatch(/<!DOCTYPE> is not allowed/);
  });

  it('rejects <!ENTITY>', () => {
    const err = parseError(`<!ENTITY foo "bar">${invoiceXml('')}`);
    expect(err.message).toMatch(/<!ENTITY> is not allowed/);
    expect(err.line).toBe(1);
  });

  it('rejects <!ENTITY> inside element content', () => {
    const err = parseError(invoiceXml('<!ENTITY foo "bar">'));
    expect(err.message).toMatch(/<!ENTITY> is not allowed/);
  });

  it(`accepts nesting of ${XML_MAX_DEPTH} and rejects ${XML_MAX_DEPTH + 1}`, () => {
    expect(() => xmlToUbl(nestedInvoice(XML_MAX_DEPTH))).not.toThrow();
    const err = parseError(nestedInvoice(XML_MAX_DEPTH + 1));
    expect(err.message).toMatch(new RegExp(`maximum depth of ${XML_MAX_DEPTH}`));
  });

  it('rejects a mismatched end tag and includes the line number', () => {
    const xml = `<Invoice ${NS}>\n  <cbc:ID>x</cbc:Note>\n</Invoice>`;
    const err = parseError(xml);
    expect(err.message).toMatch(/mismatched tag <\/cbc:Note> \(expected <\/cbc:ID>\)/);
    expect(err.line).toBe(2);
  });

  it('rejects an unclosed tag', () => {
    const xml = `<Invoice ${NS}>\n  <cbc:ID>x</cbc:ID>\n`;
    const err = parseError(xml);
    expect(err.message).toMatch(/unclosed tag <Invoice>/);
  });

  it('rejects unquoted attributes', () => {
    const err = parseError(`<Invoice ${NS} foo=bar></Invoice>`);
    expect(err.message).toMatch(/attribute value must be quoted/);
  });

  it('rejects an attribute without a value', () => {
    const err = parseError(`<Invoice ${NS} foo></Invoice>`);
    expect(err.message).toMatch(/attribute foo is missing a value/);
  });

  it('rejects an unknown entity', () => {
    const err = parseError(invoiceXml('<cbc:ID>&unknown;</cbc:ID>'));
    expect(err.message).toMatch(/unknown entity &unknown;/);
  });

  it('rejects a duplicate attribute on one element', () => {
    const err = parseError(`<Invoice ${NS} foo="1" foo="2"></Invoice>`);
    expect(err.message).toMatch(/duplicate attribute foo/);
  });

  it('rejects a raw "<" in an attribute value', () => {
    const err = parseError(`<Invoice ${NS} foo="a<b"></Invoice>`);
    expect(err.message).toMatch(/"<" is not allowed in an attribute value/);
  });

  it('rejects unclosed CDATA', () => {
    const err = parseError(invoiceXml('<cbc:ID><![CDATA[x</cbc:ID>'));
    expect(err.message).toMatch(/unclosed CDATA/);
  });

  it('rejects an unclosed comment', () => {
    const err = parseError(invoiceXml('<!-- not closed'));
    expect(err.message).toMatch(/unclosed comment/);
  });

  it('rejects non-whitespace content after the root element', () => {
    const err = parseError(`${invoiceXml('')}<tail/>`);
    expect(err.message).toMatch(/unexpected content after the root element/);
  });
});

describe('validateXml', () => {
  it('returns a single structure.xml-parse error for malformed XML', () => {
    const result = validateXml('<not-closed>');
    expect(result.ok).toBe(false);
    expect(result.version).toBeUndefined();
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      rule: 'structure.xml-parse',
      severity: 'error',
      path: '',
      docUrl: STRUCTURE,
    });
    expect(result.findings[0]?.message).toMatch(/^XML parse failed:/);
    expect(result.findings[0]?.message).toMatch(/line /);
  });

  it('accepts the valid 1.1 XML fixture with 0 errors and 0 warnings', () => {
    const xml = readFileSync(new URL('../fixtures/valid-invoice-1.1.xml', import.meta.url), 'utf8');
    const result = validateXml(xml);
    expect(result.ok, JSON.stringify(result.findings, null, 2)).toBe(true);
    expect(result.version).toBe('1.1');
    expect(result.findings).toEqual([]);
  });

  it('matches findings of the JSON twin of the valid 1.1 fixture', () => {
    const xml = readFileSync(new URL('../fixtures/valid-invoice-1.1.xml', import.meta.url), 'utf8');
    const json = readFileSync(new URL('../fixtures/valid-invoice-1.1.json', import.meta.url), 'utf8');
    expect(findingKeys(validateXml(xml))).toEqual(findingKeys(validateJson(json)));
  });
});

describe('validate auto-detect', () => {
  it('treats a leading < as XML', () => {
    const result = validate('  \n<not-closed>');
    expect(result.findings[0]?.rule).toBe('structure.xml-parse');
  });

  it('treats other input as JSON', () => {
    const result = validate('{');
    expect(result.findings[0]?.rule).toBe('structure.json-parse');
  });
});

const SAMPLE_NAMES = [
  '1.0-Invoice-Sample',
  '1.0-Invoice-Consolidated-Sample',
  '1.0-Invoice-ForeignCurrency-Sample',
  '1.0-Invoice-MultiLineItem-Sample',
  '1.1-Invoice-Sample',
  '1.1-Invoice-Consolidated-Sample',
  '1.1-Invoice-ForeignCurrency-Sample',
  '1.1-Invoice-MultiLineItem-Sample',
] as const;

const MULTILINE_TAXTOTAL_DIFF = {
  reason:
    'Invoice TaxTotal is not the same document: XML has three TaxSubtotals (01=10, 02=75, E=100) and the invoice-level E category has no TaxExemptionReason; JSON has a single TaxSubtotal (E=100 with reason "Special case"). The 1.0 JSON file repeats the TaxSubtotal key, so JSON.parse keeps only the last; the 1.1 JSON file publishes only the E subtotal. TaxAmount is 85 on both sides.',
  xmlOnly: [
    {
      rule: 'math.tax-total',
      severity: 'error',
      path: 'Invoice/TaxTotal/TaxAmount',
      message: 'TaxTotal/TaxAmount 85 must equal the sum of TaxSubtotal/TaxAmount (185)',
    },
    {
      rule: 'required.exemption-reason',
      severity: 'warning',
      path: 'Invoice/TaxTotal/TaxSubtotal[2]/TaxCategory/TaxExemptionReason',
      message: 'Mandatory if tax exemption is applicable',
    },
  ],
  jsonOnly: [
    {
      rule: 'math.tax-total',
      severity: 'error',
      path: 'Invoice/TaxTotal/TaxAmount',
      message: 'TaxTotal/TaxAmount 85 must equal the sum of TaxSubtotal/TaxAmount (100)',
    },
  ],
} as const;

/**
 * LHDN publishes XML and JSON "twins" that are not always the same document.
 * Findings that appear on only one side are listed here with the content reason.
 * Shared (rule, severity, path, message) findings must still match.
 */
const SAMPLE_PAIR_EXCEPTIONS: Record<
  string,
  { xmlOnly: readonly FindingSig[]; jsonOnly: readonly FindingSig[]; reason: string }
> = {
  '1.0-Invoice-MultiLineItem-Sample': MULTILINE_TAXTOTAL_DIFF,
  '1.1-Invoice-MultiLineItem-Sample': MULTILINE_TAXTOTAL_DIFF,
  '1.1-Invoice-ForeignCurrency-Sample': {
    reason:
      'XML TaxCurrencyCode is "MYS" (a country code); JSON uses "MYR". XML InvoicedQuantity is 1.123456; JSON uses 1. XML PayableAmount is the non-numeric "abc" so math.total-payable is skipped; JSON PayableAmount is 1436.5 and fails the prepaid/rounding formula.',
    xmlOnly: [
      {
        rule: 'codes.currency',
        severity: 'error',
        path: 'Invoice/TaxCurrencyCode',
        message: 'TaxCurrencyCode "MYS" is not in CurrencyCodes.',
      },
      {
        rule: 'currency.tax-amount-currency',
        severity: 'error',
        path: 'Invoice/InvoiceLine/TaxTotal/TaxAmount',
        message: 'currencyID "MYR" must equal TaxCurrencyCode "MYS"',
      },
      {
        rule: 'currency.tax-amount-currency',
        severity: 'error',
        path: 'Invoice/InvoiceLine/TaxTotal/TaxSubtotal/TaxAmount',
        message: 'currencyID "MYR" must equal TaxCurrencyCode "MYS"',
      },
      {
        rule: 'currency.tax-amount-currency',
        severity: 'error',
        path: 'Invoice/TaxTotal/TaxAmount',
        message: 'currencyID "MYR" must equal TaxCurrencyCode "MYS"',
      },
      {
        rule: 'currency.tax-amount-currency',
        severity: 'error',
        path: 'Invoice/TaxTotal/TaxSubtotal/TaxAmount',
        message: 'currencyID "MYR" must equal TaxCurrencyCode "MYS"',
      },
      {
        rule: 'currency.tax-currency',
        severity: 'error',
        path: 'Invoice/TaxCurrencyCode',
        message: 'TaxCurrencyCode "MYS" must equal DocumentCurrencyCode "USD" or "MYR"',
      },
      {
        rule: 'math.line-subtotal',
        severity: 'error',
        path: 'Invoice/InvoiceLine/ItemPriceExtension/Amount',
        message:
          'ItemPriceExtension/Amount 100 must equal Price/PriceAmount 17 × InvoicedQuantity 1.123456 (19.1)',
      },
    ],
    jsonOnly: [
      {
        rule: 'math.line-subtotal',
        severity: 'error',
        path: 'Invoice/InvoiceLine/ItemPriceExtension/Amount',
        message:
          'ItemPriceExtension/Amount 100 must equal Price/PriceAmount 17 × InvoicedQuantity 1 (17)',
      },
      {
        rule: 'math.total-payable',
        severity: 'error',
        path: 'Invoice/LegalMonetaryTotal/PayableAmount',
        message:
          'PayableAmount 1436.5 must equal TaxInclusiveAmount 1436.5 − PrepaidPayment/PaidAmount 1 + PayableRoundingAmount 0.3 (1435.8)',
      },
    ],
  },
};

describe('official LHDN sample pairs', () => {
  const samplesDir = new URL('./samples/', import.meta.url);
  const files = readdirSync(samplesDir).sort();

  it('copies all 8 XML/JSON sample pairs into test/samples/', () => {
    const expected = SAMPLE_NAMES.flatMap((name) => [`${name}.json`, `${name}.xml`]).sort();
    expect(files).toEqual(expected);
  });

  it.each([...SAMPLE_NAMES])(
    '%s XML and JSON twins share the same findings except documented content diffs',
    (name) => {
      const xml = readFileSync(new URL(`./samples/${name}.xml`, import.meta.url), 'utf8');
      const json = readFileSync(new URL(`./samples/${name}.json`, import.meta.url), 'utf8');
      const xmlKeys = new Set(findingKeys(validateXml(xml)));
      const jsonKeys = new Set(findingKeys(validateJson(json)));
      const xmlOnly = sigsFromKeys([...xmlKeys].filter((key) => !jsonKeys.has(key)).sort());
      const jsonOnly = sigsFromKeys([...jsonKeys].filter((key) => !xmlKeys.has(key)).sort());
      const documented = SAMPLE_PAIR_EXCEPTIONS[name];
      if (documented === undefined) {
        expect({ xmlOnly, jsonOnly }).toEqual({ xmlOnly: [], jsonOnly: [] });
        return;
      }
      expect(xmlOnly, documented.reason).toEqual(sortSigs(documented.xmlOnly));
      expect(jsonOnly, documented.reason).toEqual(sortSigs(documented.jsonOnly));
    },
  );
});
