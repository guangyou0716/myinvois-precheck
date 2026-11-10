import { describe, expect, it } from 'vitest';
import { CODE } from '../src/docs.js';
import { check } from '../src/rules-codes.js';
import type { Finding } from '../src/types.js';

function L(value: string | number, attrs: Record<string, string> = {}) {
  return [{ _: value, ...attrs }];
}

function address(country = 'MYS', state = '14') {
  return {
    AddressLine: [{ Line: L('Lot 1, Jalan Example') }],
    CityName: L('Kuala Lumpur'),
    CountrySubentityCode: L(state),
    Country: [{ IdentificationCode: L(country) }],
  };
}

function supplierParty(overrides: Record<string, unknown> = {}) {
  return {
    PartyLegalEntity: [{ RegistrationName: L('Supplier Sdn Bhd') }],
    IndustryClassificationCode: [{ _: '01111', name: 'Growing of maize' }],
    PostalAddress: [address()],
    ...overrides,
  };
}

function buyerParty(overrides: Record<string, unknown> = {}) {
  return {
    PartyLegalEntity: [{ RegistrationName: L('Buyer Bhd') }],
    PostalAddress: [address()],
    ...overrides,
  };
}

function taxTotal(categoryId = '01') {
  return {
    TaxAmount: L(6, { currencyID: 'MYR' }),
    TaxSubtotal: [
      {
        TaxableAmount: L(100, { currencyID: 'MYR' }),
        TaxAmount: L(6, { currencyID: 'MYR' }),
        TaxCategory: [{ ID: L(categoryId) }],
      },
    ],
  };
}

function invoiceLine(overrides: Record<string, unknown> = {}) {
  return {
    ID: L('1'),
    InvoicedQuantity: [{ _: 1, unitCode: 'C62' }],
    LineExtensionAmount: L(100, { currencyID: 'MYR' }),
    TaxTotal: [taxTotal()],
    Item: [
      {
        Description: L('Maize'),
        CommodityClassification: [{ ItemClassificationCode: [{ _: '001', listID: 'CLASS' }] }],
        OriginCountry: [{ IdentificationCode: L('MYS') }],
      },
    ],
    Price: [{ PriceAmount: L(100, { currencyID: 'MYR' }) }],
    ItemPriceExtension: [{ Amount: L(100, { currencyID: 'MYR' }) }],
    ...overrides,
  };
}

function doc(mutate?: (invoice: Record<string, unknown>) => void): Record<string, unknown> {
  const invoice: Record<string, unknown> = {
    InvoiceTypeCode: [{ _: '01', listVersionID: '1.1' }],
    DocumentCurrencyCode: L('MYR'),
    AccountingSupplierParty: [{ Party: [supplierParty()] }],
    AccountingCustomerParty: [{ Party: [buyerParty()] }],
    PaymentMeans: [{ PaymentMeansCode: L('01') }],
    TaxTotal: [taxTotal()],
    LegalMonetaryTotal: [{ PayableAmount: L(106, { currencyID: 'MYR' }) }],
    InvoiceLine: [invoiceLine()],
  };
  mutate?.(invoice);
  return { Invoice: [invoice] };
}

function ofRule(findings: Finding[], rule: string) {
  return findings.filter((finding) => finding.rule === rule);
}

function finding(
  rule: string,
  path: string,
  message: string,
  extra: { severity?: 'error' | 'warning'; lhdnCode?: string } = {},
): Finding {
  return {
    rule,
    severity: extra.severity ?? 'error',
    path,
    message,
    lhdnCode: extra.lhdnCode ?? 'CV302',
    docUrl: CODE,
  };
}

function partyOf(invoice: Record<string, unknown>, key: string): Record<string, unknown> {
  const side = invoice[key] as Array<{ Party: Array<Record<string, unknown>> }>;
  return side[0].Party[0];
}

describe('check', () => {
  it('returns [] when Invoice[0] is not an object', () => {
    expect(check(null)).toEqual([]);
    expect(check(undefined)).toEqual([]);
    expect(check({})).toEqual([]);
    expect(check({ Invoice: [] })).toEqual([]);
    expect(check({ Invoice: [null] })).toEqual([]);
    expect(check({ Invoice: ['x'] })).toEqual([]);
  });

  it('returns no findings for valid LHDN codes', () => {
    expect(check(doc())).toEqual([]);
    expect(
      check(
        doc((inv) => {
          inv.InvoiceTypeCode = [{ _: '01', listVersionID: '1.0' }];
        }),
      ),
    ).toEqual([]);
  });
});

describe('codes.currency', () => {
  it('accepts DocumentCurrencyCode, TaxCurrencyCode, and currencyID values in CurrencyCodes', () => {
    expect(
      ofRule(
        check(
          doc((inv) => {
            inv.DocumentCurrencyCode = L('USD');
            inv.TaxCurrencyCode = L('MYR');
            inv.LegalMonetaryTotal = [{ PayableAmount: L(100, { currencyID: 'USD' }) }];
          }),
        ),
        'codes.currency',
      ),
    ).toEqual([]);
  });

  it('errors when DocumentCurrencyCode, TaxCurrencyCode, or currencyID is not in CurrencyCodes', () => {
    expect(
      ofRule(
        check(doc((inv) => {
          inv.DocumentCurrencyCode = L('AAA');
        })),
        'codes.currency',
      ),
    ).toEqual([
      finding(
        'codes.currency',
        'Invoice/DocumentCurrencyCode',
        'DocumentCurrencyCode "AAA" is not in CurrencyCodes.',
      ),
    ]);

    expect(
      ofRule(
        check(doc((inv) => {
          inv.TaxCurrencyCode = L('ZZZ');
        })),
        'codes.currency',
      ),
    ).toEqual([
      finding(
        'codes.currency',
        'Invoice/TaxCurrencyCode',
        'TaxCurrencyCode "ZZZ" is not in CurrencyCodes.',
      ),
    ]);

    expect(
      ofRule(
        check(
          doc((inv) => {
            inv.LegalMonetaryTotal = [{ PayableAmount: L(106, { currencyID: 'AAA' }) }];
          }),
        ),
        'codes.currency',
      ),
    ).toEqual([
      finding(
        'codes.currency',
        'Invoice/LegalMonetaryTotal/PayableAmount',
        'currencyID "AAA" is not in CurrencyCodes.',
      ),
    ]);
  });
});

describe('codes.country', () => {
  it('accepts CountryCodes on supplier, buyer, delivery party, and line origin', () => {
    expect(
      ofRule(
        check(
          doc((inv) => {
            partyOf(inv, 'AccountingSupplierParty').PostalAddress = [address('MYS', '14')];
            partyOf(inv, 'AccountingCustomerParty').PostalAddress = [address('SGP', 'Singapore')];
            inv.Delivery = [{ DeliveryParty: [{ PostalAddress: [address('USA', 'California')] }] }];
            inv.InvoiceLine = [invoiceLine({ Item: [
              {
                Description: L('Maize'),
                CommodityClassification: [{ ItemClassificationCode: [{ _: '001', listID: 'CLASS' }] }],
                OriginCountry: [{ IdentificationCode: L('GBR') }],
              },
            ] })];
          }),
        ),
        'codes.country',
      ),
    ).toEqual([]);
  });

  it('errors when a country code is not in CountryCodes', () => {
    expect(
      ofRule(
        check(
          doc((inv) => {
            partyOf(inv, 'AccountingSupplierParty').PostalAddress = [address('XX', '17')];
          }),
        ),
        'codes.country',
      ),
    ).toEqual([
      finding(
        'codes.country',
        'Invoice/AccountingSupplierParty/Party/PostalAddress/Country/IdentificationCode',
        'IdentificationCode "XX" is not in CountryCodes.',
      ),
    ]);

    expect(
      ofRule(
        check(
          doc((inv) => {
            inv.InvoiceLine = [
              invoiceLine({
                Item: [
                  {
                    Description: L('Maize'),
                    CommodityClassification: [{ ItemClassificationCode: [{ _: '001', listID: 'CLASS' }] }],
                    OriginCountry: [{ IdentificationCode: L('ZZZ') }],
                  },
                ],
              }),
            ];
          }),
        ),
        'codes.country',
      ),
    ).toEqual([
      finding(
        'codes.country',
        'Invoice/InvoiceLine/Item/OriginCountry/IdentificationCode',
        'IdentificationCode "ZZZ" is not in CountryCodes.',
      ),
    ]);
  });
});

describe('codes.state', () => {
  it('accepts StateCodes 01-16 when country is MYS and free-text or 17 when it is not', () => {
    expect(ofRule(check(doc()), 'codes.state')).toEqual([]);
    expect(
      ofRule(
        check(
          doc((inv) => {
            partyOf(inv, 'AccountingCustomerParty').PostalAddress = [address('SGP', 'Singapore')];
            inv.Delivery = [{ DeliveryParty: [{ PostalAddress: [address('USA', '17')] }] }];
          }),
        ),
        'codes.state',
      ),
    ).toEqual([]);
  });

  it('errors when country is MYS and CountrySubentityCode is not in StateCodes', () => {
    expect(
      ofRule(
        check(
          doc((inv) => {
            partyOf(inv, 'AccountingSupplierParty').PostalAddress = [address('MYS', '99')];
          }),
        ),
        'codes.state',
      ),
    ).toEqual([
      finding(
        'codes.state',
        'Invoice/AccountingSupplierParty/Party/PostalAddress/CountrySubentityCode',
        'CountrySubentityCode "99" is not in StateCodes.',
      ),
    ]);
  });

  it('warns with CV317 when country is MYS and CountrySubentityCode is 17', () => {
    expect(
      ofRule(
        check(
          doc((inv) => {
            partyOf(inv, 'AccountingSupplierParty').PostalAddress = [address('MYS', '17')];
          }),
        ),
        'codes.state',
      ),
    ).toEqual([
      finding(
        'codes.state',
        'Invoice/AccountingSupplierParty/Party/PostalAddress/CountrySubentityCode',
        'State Code 17 should be used for Consolidated e-Invoice and non-Malaysian address only',
        { severity: 'warning', lhdnCode: 'CV317' },
      ),
    ]);
  });

  it('errors with CV316 when country is not MYS and CountrySubentityCode is 01-16', () => {
    expect(
      ofRule(
        check(
          doc((inv) => {
            partyOf(inv, 'AccountingCustomerParty').PostalAddress = [address('SGP', '14')];
          }),
        ),
        'codes.state',
      ),
    ).toEqual([
      finding(
        'codes.state',
        'Invoice/AccountingCustomerParty/Party/PostalAddress/CountrySubentityCode',
        'CountrySubentityCode "14" is a Malaysian state code and cannot be used when country is not MYS.',
        { lhdnCode: 'CV316' },
      ),
    ]);
  });
});

describe('codes.msic', () => {
  it('accepts a supplier IndustryClassificationCode in MSICSubCategoryCodes', () => {
    expect(ofRule(check(doc()), 'codes.msic')).toEqual([]);
    expect(
      ofRule(
        check(
          doc((inv) => {
            partyOf(inv, 'AccountingCustomerParty').IndustryClassificationCode = [{ _: '99999' }];
          }),
        ),
        'codes.msic',
      ),
    ).toEqual([]);
  });

  it('errors when the supplier IndustryClassificationCode is not in MSICSubCategoryCodes', () => {
    expect(
      ofRule(
        check(
          doc((inv) => {
            partyOf(inv, 'AccountingSupplierParty').IndustryClassificationCode = [
              { _: '99999', name: 'Unknown' },
            ];
          }),
        ),
        'codes.msic',
      ),
    ).toEqual([
      finding(
        'codes.msic',
        'Invoice/AccountingSupplierParty/Party/IndustryClassificationCode',
        'IndustryClassificationCode "99999" is not in MSICSubCategoryCodes.',
      ),
    ]);
  });
});

describe('codes.classification', () => {
  it('accepts CLASS ItemClassificationCode values in ClassificationCodes and ignores other listIDs', () => {
    expect(ofRule(check(doc()), 'codes.classification')).toEqual([]);
    expect(
      ofRule(
        check(
          doc((inv) => {
            inv.InvoiceLine = [
              invoiceLine({
                Item: [
                  {
                    Description: L('Maize'),
                    CommodityClassification: [
                      { ItemClassificationCode: [{ _: '001', listID: 'CLASS' }] },
                      { ItemClassificationCode: [{ _: '999', listID: 'PTC' }] },
                    ],
                    OriginCountry: [{ IdentificationCode: L('MYS') }],
                  },
                ],
              }),
            ];
          }),
        ),
        'codes.classification',
      ),
    ).toEqual([]);
  });

  it('errors when a CLASS ItemClassificationCode is not in ClassificationCodes', () => {
    expect(
      ofRule(
        check(
          doc((inv) => {
            inv.InvoiceLine = [
              invoiceLine({
                Item: [
                  {
                    Description: L('Maize'),
                    CommodityClassification: [{ ItemClassificationCode: [{ _: '999', listID: 'CLASS' }] }],
                    OriginCountry: [{ IdentificationCode: L('MYS') }],
                  },
                ],
              }),
            ];
          }),
        ),
        'codes.classification',
      ),
    ).toEqual([
      finding(
        'codes.classification',
        'Invoice/InvoiceLine/Item/CommodityClassification/ItemClassificationCode[CLASS]',
        'ItemClassificationCode "999" is not in ClassificationCodes.',
      ),
    ]);
  });
});

describe('codes.tax-type', () => {
  it('accepts TaxCategory/ID values in TaxTypes at invoice and line level', () => {
    expect(ofRule(check(doc()), 'codes.tax-type')).toEqual([]);
    expect(
      ofRule(
        check(
          doc((inv) => {
            inv.TaxTotal = [taxTotal('E')];
            inv.InvoiceLine = [invoiceLine({ TaxTotal: [taxTotal('06')] })];
          }),
        ),
        'codes.tax-type',
      ),
    ).toEqual([]);
  });

  it('errors when TaxCategory/ID is not in TaxTypes', () => {
    expect(
      ofRule(
        check(
          doc((inv) => {
            inv.TaxTotal = [taxTotal('09')];
            inv.InvoiceLine = [invoiceLine({ TaxTotal: [taxTotal('09')] })];
          }),
        ),
        'codes.tax-type',
      ),
    ).toEqual([
      finding(
        'codes.tax-type',
        'Invoice/TaxTotal/TaxSubtotal/TaxCategory/ID',
        'TaxCategory/ID "09" is not in TaxTypes.',
      ),
      finding(
        'codes.tax-type',
        'Invoice/InvoiceLine/TaxTotal/TaxSubtotal/TaxCategory/ID',
        'TaxCategory/ID "09" is not in TaxTypes.',
      ),
    ]);
  });
});

describe('codes.unit', () => {
  it('accepts InvoicedQuantity unitCode values in UnitTypes', () => {
    expect(ofRule(check(doc()), 'codes.unit')).toEqual([]);
    const without = invoiceLine();
    delete (without as { InvoicedQuantity?: unknown }).InvoicedQuantity;
    expect(
      ofRule(check(doc((inv) => {
        inv.InvoiceLine = [without];
      })), 'codes.unit'),
    ).toEqual([]);
  });

  it('errors when unitCode is not in UnitTypes', () => {
    expect(
      ofRule(
        check(
          doc((inv) => {
            inv.InvoiceLine = [invoiceLine({ InvoicedQuantity: [{ _: 1, unitCode: 'ZZZ' }] })];
          }),
        ),
        'codes.unit',
      ),
    ).toEqual([
      finding(
        'codes.unit',
        'Invoice/InvoiceLine/InvoicedQuantity/unitCode',
        'unitCode "ZZZ" is not in UnitTypes.',
      ),
    ]);
  });
});

describe('codes.payment-method', () => {
  it('accepts PaymentMeansCode values in PaymentMethods', () => {
    expect(ofRule(check(doc()), 'codes.payment-method')).toEqual([]);
    expect(
      ofRule(
        check(
          doc((inv) => {
            delete inv.PaymentMeans;
          }),
        ),
        'codes.payment-method',
      ),
    ).toEqual([]);
  });

  it('errors when PaymentMeansCode is not in PaymentMethods', () => {
    expect(
      ofRule(
        check(
          doc((inv) => {
            inv.PaymentMeans = [{ PaymentMeansCode: L('99') }];
          }),
        ),
        'codes.payment-method',
      ),
    ).toEqual([
      finding(
        'codes.payment-method',
        'Invoice/PaymentMeans/PaymentMeansCode',
        'PaymentMeansCode "99" is not in PaymentMethods.',
      ),
    ]);
  });
});

describe('codes.invoice-type', () => {
  it('accepts InvoiceTypeCode values in EInvoiceTypes', () => {
    expect(ofRule(check(doc()), 'codes.invoice-type')).toEqual([]);
    expect(
      ofRule(
        check(
          doc((inv) => {
            inv.InvoiceTypeCode = [{ _: '02', listVersionID: '1.1' }];
          }),
        ),
        'codes.invoice-type',
      ),
    ).toEqual([]);
  });

  it('errors when InvoiceTypeCode is not in EInvoiceTypes', () => {
    expect(
      ofRule(
        check(
          doc((inv) => {
            inv.InvoiceTypeCode = [{ _: '99', listVersionID: '1.1' }];
          }),
        ),
        'codes.invoice-type',
      ),
    ).toEqual([
      finding(
        'codes.invoice-type',
        'Invoice/InvoiceTypeCode',
        'InvoiceTypeCode "99" is not in EInvoiceTypes.',
      ),
    ]);
  });
});
