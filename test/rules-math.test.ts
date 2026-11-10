import { describe, expect, it } from 'vitest';
import { MATH } from '../src/docs.js';
import { check } from '../src/rules-math.js';

function amt(value: number, currencyID = 'MYR') {
  return [{ _: value, currencyID }];
}

function line(overrides: Record<string, unknown> = {}) {
  return {
    ID: [{ _: '1' }],
    InvoicedQuantity: [{ _: 2, unitCode: 'C62' }],
    LineExtensionAmount: amt(100),
    TaxTotal: [
      {
        TaxAmount: amt(6),
        TaxSubtotal: [
          {
            TaxableAmount: amt(100),
            TaxAmount: amt(6),
            TaxCategory: [{ ID: [{ _: '01' }] }],
          },
        ],
      },
    ],
    Price: [{ PriceAmount: amt(50) }],
    ItemPriceExtension: [{ Amount: amt(100) }],
    ...overrides,
  };
}

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    Invoice: [
      {
        InvoiceTypeCode: [{ _: '01', listVersionID: '1.1' }],
        DocumentCurrencyCode: [{ _: 'MYR' }],
        TaxTotal: [
          {
            TaxAmount: amt(6),
            TaxSubtotal: [
              {
                TaxableAmount: amt(100),
                TaxAmount: amt(6),
                TaxCategory: [{ ID: [{ _: '01' }] }],
              },
            ],
          },
        ],
        LegalMonetaryTotal: [
          {
            LineExtensionAmount: amt(100),
            TaxExclusiveAmount: amt(100),
            TaxInclusiveAmount: amt(106),
            PayableAmount: amt(106),
          },
        ],
        InvoiceLine: [line()],
        ...overrides,
      },
    ],
  };
}

function ofRule(findings: ReturnType<typeof check>, rule: string) {
  return findings.filter((finding) => finding.rule === rule);
}

describe('check', () => {
  it('returns no findings when Invoice[0] is not an object', () => {
    expect(check({})).toEqual([]);
    expect(check({ Invoice: [] })).toEqual([]);
    expect(check({ Invoice: [null] })).toEqual([]);
    expect(check(null)).toEqual([]);
  });

  it('returns no findings for a balanced invoice', () => {
    expect(check(invoice())).toEqual([]);
  });
});

describe('math.line-subtotal', () => {
  it('accepts ItemPriceExtension/Amount equal to PriceAmount × InvoicedQuantity', () => {
    expect(ofRule(check(invoice()), 'math.line-subtotal')).toEqual([]);
  });

  it('flags ItemPriceExtension/Amount that does not equal PriceAmount × InvoicedQuantity', () => {
    const findings = ofRule(
      check(
        invoice({
          InvoiceLine: [line({ Price: [{ PriceAmount: amt(40) }] })],
        }),
      ),
      'math.line-subtotal',
    );
    expect(findings).toEqual([
      {
        rule: 'math.line-subtotal',
        severity: 'error',
        path: 'Invoice/InvoiceLine/ItemPriceExtension/Amount',
        message:
          'ItemPriceExtension/Amount 100 must equal Price/PriceAmount 40 × InvoicedQuantity 2 (80)',
        docUrl: MATH,
      },
    ]);
  });

  it('skips the check when InvoicedQuantity is missing', () => {
    const withoutQty: Record<string, unknown> = { ...line() };
    delete withoutQty.InvoicedQuantity;
    expect(ofRule(check(invoice({ InvoiceLine: [withoutQty] })), 'math.line-subtotal')).toEqual([]);
  });

  it('accepts 1.005 vs 1.01 without a round-then-compare false positive', () => {
    const findings = ofRule(
      check(
        invoice({
          InvoiceLine: [
            line({
              InvoicedQuantity: [{ _: 1, unitCode: 'C62' }],
              LineExtensionAmount: amt(1.01),
              Price: [{ PriceAmount: amt(1.005) }],
              ItemPriceExtension: [{ Amount: amt(1.01) }],
              TaxTotal: [
                {
                  TaxAmount: amt(0),
                  TaxSubtotal: [
                    {
                      TaxableAmount: amt(1.01),
                      TaxAmount: amt(0),
                      TaxCategory: [{ ID: [{ _: '01' }] }],
                    },
                  ],
                },
              ],
            }),
          ],
          TaxTotal: [
            {
              TaxAmount: amt(0),
              TaxSubtotal: [
                {
                  TaxableAmount: amt(1.01),
                  TaxAmount: amt(0),
                  TaxCategory: [{ ID: [{ _: '01' }] }],
                },
              ],
            },
          ],
          LegalMonetaryTotal: [
            {
              LineExtensionAmount: amt(1.01),
              TaxExclusiveAmount: amt(1.01),
              TaxInclusiveAmount: amt(1.01),
              PayableAmount: amt(1.01),
            },
          ],
        }),
      ),
      'math.line-subtotal',
    );
    expect(findings).toEqual([]);
  });
});

describe('math.line-total-excl', () => {
  it('accepts LineExtensionAmount equal to subtotal − allowances + charges', () => {
    const findings = ofRule(
      check(
        invoice({
          InvoiceLine: [
            line({
              LineExtensionAmount: amt(95),
              AllowanceCharge: [
                { ChargeIndicator: [{ _: false }], Amount: amt(10) },
                { ChargeIndicator: [{ _: 'true' }], Amount: amt(5) },
              ],
            }),
          ],
          LegalMonetaryTotal: [
            {
              LineExtensionAmount: amt(95),
              TaxExclusiveAmount: amt(95),
              TaxInclusiveAmount: amt(101),
              PayableAmount: amt(101),
            },
          ],
        }),
      ),
      'math.line-total-excl',
    );
    expect(findings).toEqual([]);
  });

  it('flags LineExtensionAmount that does not equal subtotal − allowances + charges', () => {
    const findings = ofRule(
      check(
        invoice({
          InvoiceLine: [
            line({
              AllowanceCharge: [{ ChargeIndicator: [{ _: false }], Amount: amt(10) }],
            }),
          ],
        }),
      ),
      'math.line-total-excl',
    );
    expect(findings).toEqual([
      {
        rule: 'math.line-total-excl',
        severity: 'error',
        path: 'Invoice/InvoiceLine/LineExtensionAmount',
        message:
          'LineExtensionAmount 100 must equal ItemPriceExtension/Amount 100 − allowances 10 + charges 0 (90)',
        docUrl: MATH,
      },
    ]);
  });
});

describe('math.line-tax-total', () => {
  it('accepts line TaxTotal/TaxAmount equal to the sum of TaxSubtotal/TaxAmount', () => {
    expect(ofRule(check(invoice()), 'math.line-tax-total')).toEqual([]);
  });

  it('flags line TaxTotal/TaxAmount that does not equal the sum of TaxSubtotal/TaxAmount', () => {
    const findings = ofRule(
      check(
        invoice({
          InvoiceLine: [
            line({
              TaxTotal: [
                {
                  TaxAmount: amt(5),
                  TaxSubtotal: [
                    {
                      TaxableAmount: amt(100),
                      TaxAmount: amt(6),
                      TaxCategory: [{ ID: [{ _: '01' }] }],
                    },
                  ],
                },
              ],
            }),
          ],
        }),
      ),
      'math.line-tax-total',
    );
    expect(findings).toEqual([
      {
        rule: 'math.line-tax-total',
        severity: 'error',
        path: 'Invoice/InvoiceLine/TaxTotal/TaxAmount',
        message: 'TaxTotal/TaxAmount 5 must equal the sum of TaxSubtotal/TaxAmount (6)',
        docUrl: MATH,
      },
    ]);
  });
});

describe('math.total-net', () => {
  it('accepts LegalMonetaryTotal/LineExtensionAmount equal to the sum of line totals', () => {
    expect(ofRule(check(invoice()), 'math.total-net')).toEqual([]);
  });

  it('flags LegalMonetaryTotal/LineExtensionAmount that does not equal the sum of line totals', () => {
    const findings = ofRule(
      check(
        invoice({
          LegalMonetaryTotal: [
            {
              LineExtensionAmount: amt(90),
              TaxExclusiveAmount: amt(90),
              TaxInclusiveAmount: amt(96),
              PayableAmount: amt(96),
            },
          ],
        }),
      ),
      'math.total-net',
    );
    expect(findings).toEqual([
      {
        rule: 'math.total-net',
        severity: 'error',
        path: 'Invoice/LegalMonetaryTotal/LineExtensionAmount',
        message: 'LineExtensionAmount 90 must equal the sum of InvoiceLine/LineExtensionAmount (100)',
        docUrl: MATH,
      },
    ]);
  });
});

describe('math.total-discount', () => {
  it('accepts AllowanceTotalAmount equal to the sum of invoice-level allowances', () => {
    const findings = ofRule(
      check(
        invoice({
          AllowanceCharge: [{ ChargeIndicator: [{ _: false }], Amount: amt(10) }],
          LegalMonetaryTotal: [
            {
              LineExtensionAmount: amt(100),
              AllowanceTotalAmount: amt(10),
              TaxExclusiveAmount: amt(90),
              TaxInclusiveAmount: amt(96),
              PayableAmount: amt(96),
            },
          ],
        }),
      ),
      'math.total-discount',
    );
    expect(findings).toEqual([]);
  });

  it('flags AllowanceTotalAmount that does not equal the sum of invoice-level allowances', () => {
    const findings = ofRule(
      check(
        invoice({
          LegalMonetaryTotal: [
            {
              LineExtensionAmount: amt(100),
              AllowanceTotalAmount: amt(10),
              TaxExclusiveAmount: amt(90),
              TaxInclusiveAmount: amt(96),
              PayableAmount: amt(96),
            },
          ],
        }),
      ),
      'math.total-discount',
    );
    expect(findings).toEqual([
      {
        rule: 'math.total-discount',
        severity: 'error',
        path: 'Invoice/LegalMonetaryTotal/AllowanceTotalAmount',
        message: 'AllowanceTotalAmount 10 must equal the sum of invoice-level allowance Amount (0)',
        docUrl: MATH,
      },
    ]);
  });
});

describe('math.total-charge', () => {
  it('accepts ChargeTotalAmount equal to the sum of invoice-level charges', () => {
    const findings = ofRule(
      check(
        invoice({
          AllowanceCharge: [{ ChargeIndicator: [{ _: true }], Amount: amt(8) }],
          LegalMonetaryTotal: [
            {
              LineExtensionAmount: amt(100),
              ChargeTotalAmount: amt(8),
              TaxExclusiveAmount: amt(108),
              TaxInclusiveAmount: amt(114),
              PayableAmount: amt(114),
            },
          ],
        }),
      ),
      'math.total-charge',
    );
    expect(findings).toEqual([]);
  });

  it('flags ChargeTotalAmount that does not equal the sum of invoice-level charges', () => {
    const findings = ofRule(
      check(
        invoice({
          LegalMonetaryTotal: [
            {
              LineExtensionAmount: amt(100),
              ChargeTotalAmount: amt(8),
              TaxExclusiveAmount: amt(108),
              TaxInclusiveAmount: amt(114),
              PayableAmount: amt(114),
            },
          ],
        }),
      ),
      'math.total-charge',
    );
    expect(findings).toEqual([
      {
        rule: 'math.total-charge',
        severity: 'error',
        path: 'Invoice/LegalMonetaryTotal/ChargeTotalAmount',
        message: 'ChargeTotalAmount 8 must equal the sum of invoice-level charge Amount (0)',
        docUrl: MATH,
      },
    ]);
  });
});

describe('math.total-excl', () => {
  it('accepts TaxExclusiveAmount equal to net − allowances + charges', () => {
    expect(ofRule(check(invoice()), 'math.total-excl')).toEqual([]);
  });

  it('flags TaxExclusiveAmount that does not equal net − allowances + charges', () => {
    const findings = ofRule(
      check(
        invoice({
          LegalMonetaryTotal: [
            {
              LineExtensionAmount: amt(100),
              TaxExclusiveAmount: amt(90),
              TaxInclusiveAmount: amt(96),
              PayableAmount: amt(96),
            },
          ],
        }),
      ),
      'math.total-excl',
    );
    expect(findings).toEqual([
      {
        rule: 'math.total-excl',
        severity: 'error',
        path: 'Invoice/LegalMonetaryTotal/TaxExclusiveAmount',
        message:
          'TaxExclusiveAmount 90 must equal LineExtensionAmount − AllowanceTotalAmount + ChargeTotalAmount (100)',
        docUrl: MATH,
      },
    ]);
  });
});

describe('math.total-incl', () => {
  it('accepts TaxInclusiveAmount equal to TaxExclusiveAmount + TaxTotal/TaxAmount', () => {
    expect(ofRule(check(invoice()), 'math.total-incl')).toEqual([]);
  });

  it('flags TaxInclusiveAmount that does not equal TaxExclusiveAmount + TaxTotal/TaxAmount', () => {
    const findings = ofRule(
      check(
        invoice({
          LegalMonetaryTotal: [
            {
              LineExtensionAmount: amt(100),
              TaxExclusiveAmount: amt(100),
              TaxInclusiveAmount: amt(100),
              PayableAmount: amt(100),
            },
          ],
        }),
      ),
      'math.total-incl',
    );
    expect(findings).toEqual([
      {
        rule: 'math.total-incl',
        severity: 'error',
        path: 'Invoice/LegalMonetaryTotal/TaxInclusiveAmount',
        message:
          'TaxInclusiveAmount 100 must equal TaxExclusiveAmount 100 + TaxTotal/TaxAmount 6 (106)',
        docUrl: MATH,
      },
    ]);
  });

  it('skips the check when TaxTotal/TaxAmount currency differs from TaxInclusiveAmount currency', () => {
    const findings = ofRule(
      check(
        invoice({
          DocumentCurrencyCode: [{ _: 'USD' }],
          TaxCurrencyCode: [{ _: 'MYR' }],
          TaxTotal: [
            {
              TaxAmount: amt(27, 'MYR'),
              TaxSubtotal: [
                {
                  TaxableAmount: amt(100, 'USD'),
                  TaxAmount: amt(27, 'MYR'),
                  TaxCategory: [{ ID: [{ _: '01' }] }],
                },
              ],
            },
          ],
          LegalMonetaryTotal: [
            {
              LineExtensionAmount: amt(100, 'USD'),
              TaxExclusiveAmount: amt(100, 'USD'),
              TaxInclusiveAmount: amt(106, 'USD'),
              PayableAmount: amt(106, 'USD'),
            },
          ],
          InvoiceLine: [
            line({
              LineExtensionAmount: amt(100, 'USD'),
              TaxTotal: [
                {
                  TaxAmount: amt(27, 'MYR'),
                  TaxSubtotal: [
                    {
                      TaxableAmount: amt(100, 'USD'),
                      TaxAmount: amt(27, 'MYR'),
                      TaxCategory: [{ ID: [{ _: '01' }] }],
                    },
                  ],
                },
              ],
              Price: [{ PriceAmount: amt(50, 'USD') }],
              ItemPriceExtension: [{ Amount: amt(100, 'USD') }],
            }),
          ],
        }),
      ),
      'math.total-incl',
    );
    expect(findings).toEqual([]);
  });
});

describe('math.total-payable', () => {
  it('accepts PayableAmount equal to TaxInclusiveAmount − prepaid + rounding', () => {
    const findings = ofRule(
      check(
        invoice({
          PrepaidPayment: [{ PaidAmount: amt(10) }],
          LegalMonetaryTotal: [
            {
              LineExtensionAmount: amt(100),
              TaxExclusiveAmount: amt(100),
              TaxInclusiveAmount: amt(106),
              PayableRoundingAmount: amt(0.02),
              PayableAmount: amt(96.02),
            },
          ],
        }),
      ),
      'math.total-payable',
    );
    expect(findings).toEqual([]);
  });

  it('flags PayableAmount that does not equal TaxInclusiveAmount − prepaid + rounding', () => {
    const findings = ofRule(
      check(
        invoice({
          LegalMonetaryTotal: [
            {
              LineExtensionAmount: amt(100),
              TaxExclusiveAmount: amt(100),
              TaxInclusiveAmount: amt(106),
              PayableAmount: amt(100),
            },
          ],
        }),
      ),
      'math.total-payable',
    );
    expect(findings).toEqual([
      {
        rule: 'math.total-payable',
        severity: 'error',
        path: 'Invoice/LegalMonetaryTotal/PayableAmount',
        message:
          'PayableAmount 100 must equal TaxInclusiveAmount 106 − PrepaidPayment/PaidAmount 0 + PayableRoundingAmount 0 (106)',
        docUrl: MATH,
      },
    ]);
  });
});

describe('math.tax-per-type', () => {
  it('accepts invoice TaxSubtotal/TaxAmount equal to the sum of line amounts of the same type', () => {
    expect(ofRule(check(invoice()), 'math.tax-per-type')).toEqual([]);
  });

  it('flags invoice TaxSubtotal/TaxAmount that does not equal the line sum for that tax type', () => {
    const findings = ofRule(
      check(
        invoice({
          TaxTotal: [
            {
              TaxAmount: amt(5),
              TaxSubtotal: [
                {
                  TaxableAmount: amt(100),
                  TaxAmount: amt(5),
                  TaxCategory: [{ ID: [{ _: '01' }] }],
                },
              ],
            },
          ],
          LegalMonetaryTotal: [
            {
              LineExtensionAmount: amt(100),
              TaxExclusiveAmount: amt(100),
              TaxInclusiveAmount: amt(105),
              PayableAmount: amt(105),
            },
          ],
        }),
      ),
      'math.tax-per-type',
    );
    expect(findings).toEqual([
      {
        rule: 'math.tax-per-type',
        severity: 'error',
        path: 'Invoice/TaxTotal/TaxSubtotal/TaxAmount',
        message:
          'TaxAmount 5 for TaxCategory/ID "01" must equal the sum of line TaxSubtotal/TaxAmount for the same tax type (6)',
        docUrl: MATH,
      },
    ]);
  });
});

describe('math.tax-total', () => {
  it('accepts invoice TaxTotal/TaxAmount equal to the sum of TaxSubtotal/TaxAmount', () => {
    expect(ofRule(check(invoice()), 'math.tax-total')).toEqual([]);
  });

  it('flags invoice TaxTotal/TaxAmount that does not equal the sum of TaxSubtotal/TaxAmount', () => {
    const findings = ofRule(
      check(
        invoice({
          TaxTotal: [
            {
              TaxAmount: amt(10),
              TaxSubtotal: [
                {
                  TaxableAmount: amt(100),
                  TaxAmount: amt(6),
                  TaxCategory: [{ ID: [{ _: '01' }] }],
                },
              ],
            },
          ],
          LegalMonetaryTotal: [
            {
              LineExtensionAmount: amt(100),
              TaxExclusiveAmount: amt(100),
              TaxInclusiveAmount: amt(110),
              PayableAmount: amt(110),
            },
          ],
        }),
      ),
      'math.tax-total',
    );
    expect(findings).toEqual([
      {
        rule: 'math.tax-total',
        severity: 'error',
        path: 'Invoice/TaxTotal/TaxAmount',
        message: 'TaxTotal/TaxAmount 10 must equal the sum of TaxSubtotal/TaxAmount (6)',
        docUrl: MATH,
      },
    ]);
  });
});
