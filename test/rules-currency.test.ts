import { describe, expect, it } from 'vitest';
import { CURRENCY, INVOICE_V1_0, INVOICE_V1_1 } from '../src/docs.js';
import { check } from '../src/rules-currency.js';

function doc(invoice: Record<string, unknown>) {
  return { Invoice: [invoice] };
}

function myrInvoice(overrides: Record<string, unknown> = {}) {
  return doc({
    InvoiceTypeCode: [{ _: '01', listVersionID: '1.1' }],
    DocumentCurrencyCode: [{ _: 'MYR' }],
    LegalMonetaryTotal: [
      {
        PayableAmount: [{ _: 106, currencyID: 'MYR' }],
      },
    ],
    ...overrides,
  });
}

function usdInvoice(overrides: Record<string, unknown> = {}) {
  return doc({
    InvoiceTypeCode: [{ _: '01', listVersionID: '1.1' }],
    DocumentCurrencyCode: [{ _: 'USD' }],
    TaxExchangeRate: [
      {
        SourceCurrencyCode: [{ _: 'USD' }],
        TargetCurrencyCode: [{ _: 'MYR' }],
        CalculationRate: [{ _: 4.5 }],
      },
    ],
    LegalMonetaryTotal: [
      {
        PayableAmount: [{ _: 100, currencyID: 'USD' }],
      },
    ],
    ...overrides,
  });
}

describe('check', () => {
  it('returns no findings when Invoice[0] is not an object', () => {
    expect(check({})).toEqual([]);
    expect(check({ Invoice: [] })).toEqual([]);
    expect(check({ Invoice: [null] })).toEqual([]);
    expect(check(null)).toEqual([]);
  });

  it('skips amount-currency and exchange-rate when DocumentCurrencyCode is missing', () => {
    const findings = check(
      doc({
        InvoiceTypeCode: [{ _: '01', listVersionID: '1.1' }],
        LegalMonetaryTotal: [
          {
            PayableAmount: [{ _: 106, currencyID: 'MYR' }],
          },
        ],
      }),
    );
    expect(findings.filter((f) => f.rule === 'currency.amount-currency')).toEqual([]);
    expect(findings.filter((f) => f.rule === 'currency.exchange-rate')).toEqual([]);
  });
});

describe('currency.amount-currency', () => {
  it('accepts amounts whose currencyID equals DocumentCurrencyCode', () => {
    const findings = check(
      myrInvoice({
        TaxTotal: [
          {
            TaxAmount: [{ _: 6, currencyID: 'MYR' }],
            TaxSubtotal: [
              {
                TaxableAmount: [{ _: 100, currencyID: 'MYR' }],
                TaxAmount: [{ _: 6, currencyID: 'MYR' }],
              },
            ],
          },
        ],
      }),
    );
    expect(findings.filter((f) => f.rule === 'currency.amount-currency')).toEqual([]);
  });

  it('flags amounts whose currencyID does not equal DocumentCurrencyCode', () => {
    const findings = check(
      myrInvoice({
        LegalMonetaryTotal: [
          {
            PayableAmount: [{ _: 106, currencyID: 'USD' }],
          },
        ],
      }),
    );
    expect(findings).toEqual([
      {
        rule: 'currency.amount-currency',
        severity: 'error',
        path: 'Invoice/LegalMonetaryTotal/PayableAmount',
        message: 'currencyID "USD" must equal DocumentCurrencyCode "MYR"',
        lhdnCode: 'DC502',
        docUrl: CURRENCY,
      },
    ]);
  });

  it('allows TaxTotal/TaxAmount and TaxSubtotal/TaxAmount to use TaxCurrencyCode', () => {
    const findings = check(
      myrInvoice({
        TaxCurrencyCode: [{ _: 'USD' }],
        TaxTotal: [
          {
            TaxAmount: [{ _: 2, currencyID: 'USD' }],
            TaxSubtotal: [
              {
                TaxableAmount: [{ _: 100, currencyID: 'MYR' }],
                TaxAmount: [{ _: 2, currencyID: 'USD' }],
              },
            ],
          },
        ],
        InvoiceLine: [
          {
            TaxTotal: [
              {
                TaxAmount: [{ _: 2, currencyID: 'USD' }],
              },
            ],
          },
        ],
      }),
    );
    expect(findings.filter((f) => f.rule === 'currency.amount-currency')).toEqual([]);
  });

  it('flags tax amounts that match neither document nor tax currency', () => {
    const findings = check(
      myrInvoice({
        TaxCurrencyCode: [{ _: 'USD' }],
        TaxTotal: [
          {
            TaxAmount: [{ _: 2, currencyID: 'EUR' }],
          },
        ],
      }),
    );
    expect(findings.filter((f) => f.rule === 'currency.amount-currency')).toEqual([
      {
        rule: 'currency.amount-currency',
        severity: 'error',
        path: 'Invoice/TaxTotal/TaxAmount',
        message: 'currencyID "EUR" must equal DocumentCurrencyCode "MYR" or TaxCurrencyCode "USD"',
        lhdnCode: 'DC502',
        docUrl: CURRENCY,
      },
    ]);
  });
});

describe('currency.tax-currency', () => {
  it('accepts TaxCurrencyCode equal to DocumentCurrencyCode or MYR', () => {
    expect(
      check(myrInvoice({ TaxCurrencyCode: [{ _: 'MYR' }] })).filter(
        (f) => f.rule === 'currency.tax-currency',
      ),
    ).toEqual([]);
    expect(
      check(usdInvoice({ TaxCurrencyCode: [{ _: 'USD' }] })).filter(
        (f) => f.rule === 'currency.tax-currency',
      ),
    ).toEqual([]);
    expect(
      check(usdInvoice({ TaxCurrencyCode: [{ _: 'MYR' }] })).filter(
        (f) => f.rule === 'currency.tax-currency',
      ),
    ).toEqual([]);
  });

  it('flags TaxCurrencyCode that is neither DocumentCurrencyCode nor MYR', () => {
    const findings = check(myrInvoice({ TaxCurrencyCode: [{ _: 'EUR' }] }));
    expect(findings.filter((f) => f.rule === 'currency.tax-currency')).toEqual([
      {
        rule: 'currency.tax-currency',
        severity: 'error',
        path: 'Invoice/TaxCurrencyCode',
        message: 'TaxCurrencyCode "EUR" must equal DocumentCurrencyCode "MYR" or "MYR"',
        lhdnCode: 'DC512',
        docUrl: CURRENCY,
      },
    ]);
  });
});

describe('currency.source-currency', () => {
  it('accepts SourceCurrencyCode equal to DocumentCurrencyCode', () => {
    const findings = check(usdInvoice());
    expect(findings.filter((f) => f.rule === 'currency.source-currency')).toEqual([]);
  });

  it('flags SourceCurrencyCode that does not equal DocumentCurrencyCode', () => {
    const findings = check(
      usdInvoice({
        TaxExchangeRate: [
          {
            SourceCurrencyCode: [{ _: 'EUR' }],
            TargetCurrencyCode: [{ _: 'MYR' }],
            CalculationRate: [{ _: 4.5 }],
          },
        ],
      }),
    );
    expect(findings.filter((f) => f.rule === 'currency.source-currency')).toEqual([
      {
        rule: 'currency.source-currency',
        severity: 'error',
        path: 'Invoice/TaxExchangeRate/SourceCurrencyCode',
        message: 'SourceCurrencyCode "EUR" must equal DocumentCurrencyCode "USD"',
        lhdnCode: 'DC510',
        docUrl: CURRENCY,
      },
    ]);
  });
});

describe('currency.exchange-rate', () => {
  it('accepts a positive CalculationRate and MYR TargetCurrencyCode when document currency is not MYR', () => {
    expect(check(usdInvoice()).filter((f) => f.rule === 'currency.exchange-rate')).toEqual([]);
    expect(
      check(myrInvoice()).filter((f) => f.rule === 'currency.exchange-rate'),
    ).toEqual([]);
  });

  it('flags a missing or non-positive CalculationRate and a non-MYR target when document currency is not MYR', () => {
    const missing = check(
      doc({
        InvoiceTypeCode: [{ _: '01', listVersionID: '1.1' }],
        DocumentCurrencyCode: [{ _: 'USD' }],
        LegalMonetaryTotal: [{ PayableAmount: [{ _: 100, currencyID: 'USD' }] }],
      }),
    );
    expect(missing.filter((f) => f.rule === 'currency.exchange-rate')).toEqual([
      {
        rule: 'currency.exchange-rate',
        severity: 'error',
        path: 'Invoice/TaxExchangeRate/CalculationRate',
        message:
          'Currency Exchange Rate (CalculationRate) is mandatory and must be greater than 0 when DocumentCurrencyCode is not MYR',
        docUrl: INVOICE_V1_1,
      },
    ]);

    const bad = check(
      usdInvoice({
        InvoiceTypeCode: [{ _: '01', listVersionID: '1.0' }],
        TaxExchangeRate: [
          {
            SourceCurrencyCode: [{ _: 'USD' }],
            TargetCurrencyCode: [{ _: 'USD' }],
            CalculationRate: [{ _: 0 }],
          },
        ],
      }),
    );
    expect(bad.filter((f) => f.rule === 'currency.exchange-rate')).toEqual([
      {
        rule: 'currency.exchange-rate',
        severity: 'error',
        path: 'Invoice/TaxExchangeRate/CalculationRate',
        message:
          'Currency Exchange Rate (CalculationRate) is mandatory and must be greater than 0 when DocumentCurrencyCode is not MYR',
        docUrl: INVOICE_V1_0,
      },
      {
        rule: 'currency.exchange-rate',
        severity: 'error',
        path: 'Invoice/TaxExchangeRate/TargetCurrencyCode',
        message: 'TaxExchangeRate/TargetCurrencyCode must be "MYR" when DocumentCurrencyCode is not MYR',
        docUrl: INVOICE_V1_0,
      },
    ]);
  });
});
