import { describe, expect, it } from 'vitest';
import {
  CREDIT_V1_0,
  CREDIT_V1_1,
  CREDIT_V1_2,
  CREDIT_V1_3,
  DEBIT_V1_0,
  DEBIT_V1_1,
  DEBIT_V1_2,
  DEBIT_V1_3,
  INVOICE_V1_0,
  INVOICE_V1_1,
  INVOICE_V1_2,
  INVOICE_V1_3,
  REFUND_V1_0,
  REFUND_V1_1,
  REFUND_V1_2,
  REFUND_V1_3,
  SELF_BILLED_CREDIT_V1_0,
  SELF_BILLED_CREDIT_V1_1,
  SELF_BILLED_CREDIT_V1_2,
  SELF_BILLED_CREDIT_V1_3,
  SELF_BILLED_DEBIT_V1_0,
  SELF_BILLED_DEBIT_V1_1,
  SELF_BILLED_DEBIT_V1_2,
  SELF_BILLED_DEBIT_V1_3,
  SELF_BILLED_INVOICE_V1_0,
  SELF_BILLED_INVOICE_V1_1,
  SELF_BILLED_INVOICE_V1_2,
  SELF_BILLED_INVOICE_V1_3,
  SELF_BILLED_REFUND_V1_0,
  SELF_BILLED_REFUND_V1_1,
  SELF_BILLED_REFUND_V1_2,
  SELF_BILLED_REFUND_V1_3,
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
    ['01', '1.2', INVOICE_V1_2],
    ['01', '1.3', INVOICE_V1_3],
    ['02', '1.0', CREDIT_V1_0],
    ['02', '1.1', CREDIT_V1_1],
    ['02', '1.2', CREDIT_V1_2],
    ['02', '1.3', CREDIT_V1_3],
    ['03', '1.0', DEBIT_V1_0],
    ['03', '1.1', DEBIT_V1_1],
    ['03', '1.2', DEBIT_V1_2],
    ['03', '1.3', DEBIT_V1_3],
    ['04', '1.0', REFUND_V1_0],
    ['04', '1.1', REFUND_V1_1],
    ['04', '1.2', REFUND_V1_2],
    ['04', '1.3', REFUND_V1_3],
    ['11', '1.0', SELF_BILLED_INVOICE_V1_0],
    ['11', '1.1', SELF_BILLED_INVOICE_V1_1],
    ['11', '1.2', SELF_BILLED_INVOICE_V1_2],
    ['11', '1.3', SELF_BILLED_INVOICE_V1_3],
    ['12', '1.0', SELF_BILLED_CREDIT_V1_0],
    ['12', '1.1', SELF_BILLED_CREDIT_V1_1],
    ['12', '1.2', SELF_BILLED_CREDIT_V1_2],
    ['12', '1.3', SELF_BILLED_CREDIT_V1_3],
    ['13', '1.0', SELF_BILLED_DEBIT_V1_0],
    ['13', '1.1', SELF_BILLED_DEBIT_V1_1],
    ['13', '1.2', SELF_BILLED_DEBIT_V1_2],
    ['13', '1.3', SELF_BILLED_DEBIT_V1_3],
    ['14', '1.0', SELF_BILLED_REFUND_V1_0],
    ['14', '1.1', SELF_BILLED_REFUND_V1_1],
    ['14', '1.2', SELF_BILLED_REFUND_V1_2],
    ['14', '1.3', SELF_BILLED_REFUND_V1_3],
  ] as const)('type %s version %s returns the matching data-structure page', (type, version, page) => {
    expect(documentUrl(type, version)).toBe(page);
  });

  it.each(['99', '05', undefined] as const)(
    'unknown type %j falls back to the invoice page',
    (type) => {
      expect(documentUrl(type, '1.0')).toBe(INVOICE_V1_0);
      expect(documentUrl(type, '1.1')).toBe(INVOICE_V1_1);
      expect(documentUrl(type, '1.2')).toBe(INVOICE_V1_2);
      expect(documentUrl(type, '1.3')).toBe(INVOICE_V1_3);
    },
  );

  it.each([
    ['01', INVOICE_V1_1],
    ['02', CREDIT_V1_1],
    ['03', DEBIT_V1_1],
    ['04', REFUND_V1_1],
    ['11', SELF_BILLED_INVOICE_V1_1],
    ['12', SELF_BILLED_CREDIT_V1_1],
    ['13', SELF_BILLED_DEBIT_V1_1],
    ['14', SELF_BILLED_REFUND_V1_1],
  ] as const)('unknown version for type %s cites the v1.1 page', (type, page) => {
    expect(documentUrl(type, '1.4')).toBe(page);
    expect(documentUrl(type, '2.0')).toBe(page);
    expect(documentUrl(type, undefined)).toBe(page);
  });

  it('trims a padded type code before selecting the page', () => {
    expect(documentUrl(' 02 ', '1.0')).toBe(CREDIT_V1_0);
    expect(documentUrl(' 02 ', '1.1')).toBe(CREDIT_V1_1);
    expect(documentUrl(' 02 ', '1.2')).toBe(CREDIT_V1_2);
    expect(documentUrl(' 02 ', '1.3')).toBe(CREDIT_V1_3);
  });

  it.each([
    [' 1.0 ', INVOICE_V1_0],
    [' 1.2 ', INVOICE_V1_2],
    ['1.3 ', INVOICE_V1_3],
  ] as const)('trims padded version %j to the matching data-structure page', (version, page) => {
    expect(documentUrl('01', version)).toBe(page);
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

  it('cites self-billed-debit-v1-1 and self-billed-refund-v1-1 on type 13 and 14 findings', () => {
    const debit = check(typedInvoice('13', '1.1'));
    expect(debit[0]).toMatchObject({
      rule: 'structure.signature',
      docUrl: SELF_BILLED_DEBIT_V1_1,
    });
    expect(debit[0]?.docUrl).toContain('self-billed-debit-v1-1');

    const refund = check(typedInvoice('14', '1.1'));
    expect(refund[0]).toMatchObject({
      rule: 'structure.signature',
      docUrl: SELF_BILLED_REFUND_V1_1,
    });
    expect(refund[0]?.docUrl).toContain('self-billed-refund-v1-1');
  });
});
