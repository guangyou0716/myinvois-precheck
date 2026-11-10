import { describe, expect, it } from 'vitest';
import { attr, num, text } from '../src/ubl.js';

describe('attr', () => {
  it('trims string attribute values', () => {
    const ident = { ID: [{ _: 'C1234567890', schemeID: ' TIN' }] };
    expect(attr(ident, 'schemeID', 'ID')).toBe('TIN');

    const code = { ItemClassificationCode: [{ _: '001', listID: 'CLASS ' }] };
    expect(attr(code, 'listID', 'ItemClassificationCode')).toBe('CLASS');

    const amount = { PayableAmount: [{ _: 106, currencyID: ' MYR' }] };
    expect(attr(amount, 'currencyID', 'PayableAmount')).toBe('MYR');

    const invoice = { InvoiceTypeCode: [{ _: '01', listVersionID: '1.1 ' }] };
    expect(attr(invoice, 'listVersionID', 'InvoiceTypeCode')).toBe('1.1');
  });

  it('leaves number attribute values unchanged aside from stringifying', () => {
    expect(attr({ PayableAmount: [{ _: 1, currencyID: 458 }] }, 'currencyID', 'PayableAmount')).toBe(
      '458',
    );
    expect(attr({ _: 1, currencyID: 0 }, 'currencyID')).toBe('0');
  });

  it('returns undefined when the attribute is missing or not a string or number', () => {
    expect(attr({ ID: [{ _: 'x' }] }, 'schemeID', 'ID')).toBeUndefined();
    expect(attr(null, 'schemeID')).toBeUndefined();
    expect(attr({ schemeID: true }, 'schemeID')).toBeUndefined();
    expect(attr({ schemeID: { nested: true } }, 'schemeID')).toBeUndefined();
  });
});

describe('text', () => {
  it('trims leaf text', () => {
    expect(text({ ID: [{ _: '  TIN  ' }] }, 'ID')).toBe('TIN');
  });
});

describe('num', () => {
  it('parses numeric leaves', () => {
    expect(num({ Amount: [{ _: 12.5 }] }, 'Amount')).toBe(12.5);
    expect(num({ Amount: [{ _: '  3  ' }] }, 'Amount')).toBe(3);
  });
});
