import { describe, expect, it } from 'vitest';
import {
  CREDIT_V1_0,
  CREDIT_V1_1,
  DEBIT_V1_0,
  DEBIT_V1_1,
  INVOICE_V1_0,
  INVOICE_V1_1,
  REFUND_V1_0,
  REFUND_V1_1,
  documentUrl,
} from '../src/docs.js';
import { check } from '../src/rules-structure.js';

const namespaces = {
  _D: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  _A: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  _B: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
};

function typedInvoice(type: string, version: string): Record<string, unknown> {
  return {
    ...namespaces,
    Invoice: [{ InvoiceTypeCode: [{ _: type, listVersionID: version }] }],
  };
}

describe('documentUrl', () => {
  it.each([
    ['01', '1.0', INVOICE_V1_0],
    ['01', '1.1', INVOICE_V1_1],
    ['02', '1.0', CREDIT_V1_0],
    ['02', '1.1', CREDIT_V1_1],
    ['03', '1.0', DEBIT_V1_0],
    ['03', '1.1', DEBIT_V1_1],
    ['04', '1.0', REFUND_V1_0],
    ['04', '1.1', REFUND_V1_1],
  ] as const)('type %s version %s returns the matching data-structure page', (type, version, page) => {
    expect(documentUrl(type, version)).toBe(page);
  });

  it.each(['99', '11', undefined] as const)(
    'unknown type %j falls back to the invoice page',
    (type) => {
      expect(documentUrl(type, '1.0')).toBe(INVOICE_V1_0);
      expect(documentUrl(type, '1.1')).toBe(INVOICE_V1_1);
    },
  );

  it.each([
    ['01', INVOICE_V1_1],
    ['02', CREDIT_V1_1],
    ['03', DEBIT_V1_1],
    ['04', REFUND_V1_1],
  ] as const)('unknown version for type %s cites the v1.1 page', (type, page) => {
    expect(documentUrl(type, '1.2')).toBe(page);
    expect(documentUrl(type, undefined)).toBe(page);
  });

  it('cites debit-v1-1 and refund-v1-1 on type 03 and 04 findings', () => {
    const debit = check(typedInvoice('03', '1.1'));
    expect(debit[0]).toMatchObject({
      rule: 'structure.signature',
      docUrl: DEBIT_V1_1,
    });
    expect(debit[0]?.docUrl).toContain('debit-v1-1');

    const refund = check(typedInvoice('04', '1.1'));
    expect(refund[0]).toMatchObject({
      rule: 'structure.signature',
      docUrl: REFUND_V1_1,
    });
    expect(refund[0]?.docUrl).toContain('refund-v1-1');
  });
});
