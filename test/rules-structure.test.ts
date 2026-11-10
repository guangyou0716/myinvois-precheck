import { describe, expect, it } from 'vitest';
import { CREDIT_V1_1, INVOICE_V1_0, INVOICE_V1_1, STRUCTURE } from '../src/docs.js';
import { check } from '../src/rules-structure.js';

const URN = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';

const namespaces = {
  _D: URN,
  _A: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  _B: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
};

const signature = {
  UBLExtensions: [{ UBLExtension: [{}] }],
  Signature: [{ ID: [{ _: 'urn:oasis:names:specification:ubl:signature:Invoice' }] }],
};

function invoice(
  version: string | undefined,
  type: string | undefined,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const code: Record<string, unknown> = {};
  if (type !== undefined) code._ = type;
  if (version !== undefined) code.listVersionID = version;
  return {
    ...namespaces,
    Invoice: [
      {
        InvoiceTypeCode: [code],
        ...extra,
      },
    ],
  };
}

describe('structure.root', () => {
  it.each([null, undefined, 1, 'invoice', true, []])('rejects non-object document %j', (doc) => {
    expect(check(doc)).toEqual([
      {
        rule: 'structure.root',
        severity: 'error',
        path: 'Invoice',
        message:
          'Document must be a JSON object with a non-empty Invoice array (Invoice[0] must be an object).',
        docUrl: STRUCTURE,
      },
    ]);
  });

  it.each([
    { ...namespaces },
    { ...namespaces, Invoice: [] },
    { ...namespaces, Invoice: {} },
    { ...namespaces, Invoice: [null] },
    { ...namespaces, Invoice: ['01'] },
    { ...namespaces, Invoice: [[]] },
  ])('rejects a document with no Invoice[0] object', (doc) => {
    expect(check(doc)).toEqual([
      {
        rule: 'structure.root',
        severity: 'error',
        path: 'Invoice',
        message: 'Invoice[0] must be an object in a non-empty Invoice array.',
        docUrl: STRUCTURE,
      },
    ]);
  });

  it('reports a missing Invoice array and missing namespace markers', () => {
    const findings = check({});
    expect(findings.map((finding) => finding.rule)).toEqual([
      'structure.root',
      'structure.namespace',
    ]);
    expect(findings[0]?.severity).toBe('error');
    expect(findings[1]?.severity).toBe('warning');
  });
});

describe('structure.namespace', () => {
  it('warns when _D is not the Invoice URN', () => {
    const doc = invoice('1.0', '01', {});
    doc._D = 'urn:example:not-an-invoice';
    expect(check(doc)).toEqual([
      {
        rule: 'structure.namespace',
        severity: 'warning',
        path: '_D',
        message: `Top-level UBL namespaces are incomplete: _D must be ${URN}.`,
        docUrl: STRUCTURE,
      },
    ]);
  });

  it('warns when _A or _B is missing', () => {
    const missingA = invoice('1.0', '01');
    delete missingA._A;
    expect(check(missingA)).toEqual([
      {
        rule: 'structure.namespace',
        severity: 'warning',
        path: '_A',
        message: 'Top-level UBL namespaces are incomplete: _A is missing.',
        docUrl: STRUCTURE,
      },
    ]);

    const missingB = invoice('1.0', '01');
    missingB._B = '';
    expect(check(missingB)[0]).toMatchObject({
      rule: 'structure.namespace',
      severity: 'warning',
      path: '_B',
      docUrl: STRUCTURE,
    });
    expect(check(missingB)[0]?.message).toContain('_B is missing');
  });

  it('accepts any non-empty _A and _B when _D is the Invoice URN', () => {
    const doc = invoice('1.0', '01');
    doc._A = 'other-aggregate-namespace';
    doc._B = 'other-basic-namespace';
    expect(check(doc)).toEqual([]);
  });
});

describe('structure.type-code', () => {
  it('errors when InvoiceTypeCode is missing', () => {
    expect(check(invoice('1.0', undefined))).toEqual([
      {
        rule: 'structure.type-code',
        severity: 'error',
        path: 'Invoice/InvoiceTypeCode',
        message: 'InvoiceTypeCode is missing.',
        docUrl: INVOICE_V1_0,
      },
    ]);
  });

  it.each(['01', '02', '03', '04'])('accepts InvoiceTypeCode %s on version 1.0', (type) => {
    expect(check(invoice('1.0', type))).toEqual([]);
  });

  it.each(['02', '03', '04'])('accepts InvoiceTypeCode %s on version 1.1 with a signature', (type) => {
    expect(check(invoice('1.1', type, signature))).toEqual([]);
  });

  it.each(['11', '99'])(
    'rejects InvoiceTypeCode %s and names the supported Invoice/Credit/Debit/Refund Note types',
    (type) => {
      const v10 = check(invoice('1.0', type));
      expect(v10).toEqual([
        {
          rule: 'structure.type-code',
          severity: 'error',
          path: 'Invoice/InvoiceTypeCode',
          message: `InvoiceTypeCode "${type}" is not supported; only Invoice (01), Credit Note (02), Debit Note (03), and Refund Note (04) are supported (self-billed types 11-14 not yet).`,
          docUrl: INVOICE_V1_0,
        },
      ]);

      const v11 = check(invoice('1.1', type, signature));
      expect(v11).toEqual([
        {
          rule: 'structure.type-code',
          severity: 'error',
          path: 'Invoice/InvoiceTypeCode',
          message: `InvoiceTypeCode "${type}" is not supported; only Invoice (01), Credit Note (02), Debit Note (03), and Refund Note (04) are supported (self-billed types 11-14 not yet).`,
          docUrl: INVOICE_V1_1,
        },
      ]);
    },
  );

  it('cites the credit-note page for a type 02 version 1.1 finding', () => {
    const findings = check(invoice('1.1', '02'));
    expect(findings[0]).toMatchObject({
      rule: 'structure.signature',
      docUrl: CREDIT_V1_1,
    });
  });

  it('trims the type code the way JSON-UBL text leaves do', () => {
    expect(check(invoice('1.0', '  01  '))).toEqual([]);
    expect(check(invoice('1.0', '  02  '))).toEqual([]);
  });
});

describe('structure.version', () => {
  it('errors when listVersionID is missing', () => {
    const findings = check(invoice(undefined, '01'));
    expect(findings).toEqual([
      {
        rule: 'structure.version',
        severity: 'error',
        path: 'Invoice/InvoiceTypeCode/listVersionID',
        message:
          'InvoiceTypeCode listVersionID is missing; versions 1.2/1.3 (SVDP) are not supported yet.',
        docUrl: INVOICE_V1_1,
      },
    ]);
  });

  it.each(['1.2', '1.3', '2.0'])('rejects listVersionID %s', (version) => {
    const findings = check(invoice(version, '01'));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: 'structure.version',
      severity: 'error',
      path: 'Invoice/InvoiceTypeCode/listVersionID',
      docUrl: INVOICE_V1_1,
    });
    expect(findings[0]?.message).toContain('versions 1.2/1.3 (SVDP) are not supported yet');
    expect(findings.map((finding) => finding.rule)).not.toContain('structure.signature');
  });

  it('accepts versions 1.0 and 1.1', () => {
    expect(check(invoice('1.0', '01'))).toEqual([]);
    expect(check(invoice('1.1', '01', signature))).toEqual([]);
  });

  it('trims listVersionID before comparing with 1.0 and 1.1', () => {
    expect(check(invoice('  1.0  ', '01'))).toEqual([]);
    expect(check(invoice(' 1.1 ', '01', signature))).toEqual([]);
    expect(check(invoice(' 1.1 ', '01')).map((finding) => finding.rule)).toEqual([
      'structure.signature',
      'structure.signature',
    ]);
  });
});

describe('structure.signature', () => {
  it('requires Signature and UBLExtensions on version 1.1 only', () => {
    expect(check(invoice('1.0', '01'))).toEqual([]);

    const missingBoth = check(invoice('1.1', '01'));
    expect(missingBoth).toEqual([
      {
        rule: 'structure.signature',
        severity: 'error',
        path: 'Invoice/Signature',
        message: "Signature is missing. Version 1.1 Issuer's Digital Signature is Mandatory [1-1].",
        docUrl: INVOICE_V1_1,
      },
      {
        rule: 'structure.signature',
        severity: 'error',
        path: 'Invoice/UBLExtensions',
        message:
          "UBLExtensions is missing. Version 1.1 Issuer's Digital Signature is Mandatory [1-1].",
        docUrl: INVOICE_V1_1,
      },
    ]);
  });

  it('reports only the signature element that is missing', () => {
    const noSignature = check(invoice('1.1', '01', { UBLExtensions: [{}] }));
    expect(noSignature.map((finding) => finding.path)).toEqual(['Invoice/Signature']);

    const noExtensions = check(invoice('1.1', '01', { Signature: [{}] }));
    expect(noExtensions.map((finding) => finding.path)).toEqual(['Invoice/UBLExtensions']);
  });

  it('does not inspect signature contents', () => {
    expect(
      check(
        invoice('1.1', '01', {
          UBLExtensions: [{ not: 'a real signature' }],
          Signature: [{ nope: true }],
        }),
      ),
    ).toEqual([]);
  });

  it('still checks the signature when the type code value is absent but the version is 1.1', () => {
    const findings = check({
      ...namespaces,
      Invoice: [{ InvoiceTypeCode: [{ listVersionID: '1.1' }] }],
    });
    expect(findings.map((finding) => finding.rule)).toEqual([
      'structure.type-code',
      'structure.signature',
      'structure.signature',
    ]);
    expect(findings[0]?.docUrl).toBe(INVOICE_V1_1);
  });
});

describe('clean invoice', () => {
  it('returns no findings for a version 1.0 invoice without a signature', () => {
    expect(check(invoice('1.0', '01'))).toEqual([]);
  });

  it('returns no findings for a version 1.1 invoice that carries signature placeholders', () => {
    expect(check(invoice('1.1', '01', signature))).toEqual([]);
  });

  it('omits lhdnCode on structure findings', () => {
    for (const finding of check(invoice('1.1', '03'))) {
      expect(finding.lhdnCode).toBeUndefined();
    }
  });
});
