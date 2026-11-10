import { describe, expect, it } from 'vitest';
import {
  CREDIT_V1_0,
  CREDIT_V1_1,
  INVOICE_V1_0,
  INVOICE_V1_1,
  SELF_BILLED_CREDIT_V1_1,
  SELF_BILLED_DEBIT_V1_1,
  SELF_BILLED_REFUND_V1_1,
} from '../src/docs.js';
import { check } from '../src/rules-required.js';

function L(value: string | number, attrs: Record<string, string> = {}) {
  return [{ _: value, ...attrs }];
}

function ident(scheme: string, id: string) {
  return { ID: [{ _: id, schemeID: scheme }] };
}

function address() {
  return {
    AddressLine: [{ Line: L('Lot 1, Jalan Example') }],
    CityName: L('Kuala Lumpur'),
    CountrySubentityCode: L('14'),
    Country: [{ IdentificationCode: L('MYS') }],
  };
}

function contact() {
  return { Telephone: L('+60123456789') };
}

function supplierParty() {
  return {
    PartyLegalEntity: [{ RegistrationName: L('Supplier Sdn Bhd') }],
    PartyIdentification: [ident('TIN', 'C1234567890'), ident('BRN', '202001234567')],
    IndustryClassificationCode: [{ _: '01111', name: 'Growing of maize' }],
    PostalAddress: [address()],
    Contact: [contact()],
  };
}

function buyerParty() {
  return {
    PartyLegalEntity: [{ RegistrationName: L('Buyer Bhd') }],
    PartyIdentification: [ident('TIN', 'C0987654321'), ident('NRIC', '880101015555')],
    PostalAddress: [address()],
    Contact: [contact()],
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

function invoiceLine() {
  return {
    ID: L('1'),
    InvoicedQuantity: [{ _: 1, unitCode: 'C62' }],
    LineExtensionAmount: L(100, { currencyID: 'MYR' }),
    TaxTotal: [taxTotal()],
    Item: [
      {
        Description: L('Maize'),
        CommodityClassification: [{ ItemClassificationCode: [{ _: '001', listID: 'CLASS' }] }],
      },
    ],
    Price: [{ PriceAmount: L(100, { currencyID: 'MYR' }) }],
    ItemPriceExtension: [{ Amount: L(100, { currencyID: 'MYR' }) }],
  };
}

function doc(
  mutate?: (invoice: Record<string, unknown>) => void,
  version = '1.1',
): Record<string, unknown> {
  const invoice: Record<string, unknown> = {
    ID: L('INV-001'),
    IssueDate: L('2026-01-15'),
    IssueTime: L('12:01:26Z'),
    InvoiceTypeCode: [{ _: '01', listVersionID: version }],
    DocumentCurrencyCode: L('MYR'),
    AccountingSupplierParty: [{ Party: [supplierParty()] }],
    AccountingCustomerParty: [{ Party: [buyerParty()] }],
    TaxTotal: [taxTotal()],
    LegalMonetaryTotal: [
      {
        TaxExclusiveAmount: L(100, { currencyID: 'MYR' }),
        TaxInclusiveAmount: L(106, { currencyID: 'MYR' }),
        PayableAmount: L(106, { currencyID: 'MYR' }),
      },
    ],
    InvoiceLine: [invoiceLine()],
  };
  mutate?.(invoice);
  return { Invoice: [invoice] };
}

function partyOf(invoice: Record<string, unknown>, key: string): Record<string, unknown> {
  const side = invoice[key] as Array<{ Party: Array<Record<string, unknown>> }>;
  return side[0].Party[0];
}

function finding(
  rule: string,
  path: string,
  message: string,
  extra: { severity?: 'error' | 'warning'; docUrl?: string; lhdnCode?: string } = {},
) {
  const result: Record<string, unknown> = {
    rule,
    severity: extra.severity ?? 'error',
    path,
    message,
    docUrl: extra.docUrl ?? INVOICE_V1_1,
  };
  if (extra.lhdnCode !== undefined) result.lhdnCode = extra.lhdnCode;
  return result;
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
});

describe('required.missing', () => {
  it('returns no findings for a complete invoice', () => {
    expect(check(doc())).toEqual([]);
    expect(check(doc(undefined, '1.0'))).toEqual([]);
  });

  it.each([
    ['ID', (inv: Record<string, unknown>) => delete inv.ID, 'Invoice/ID', 'ID is missing.'],
    [
      'IssueDate',
      (inv: Record<string, unknown>) => delete inv.IssueDate,
      'Invoice/IssueDate',
      'IssueDate is missing.',
    ],
    [
      'IssueTime',
      (inv: Record<string, unknown>) => delete inv.IssueTime,
      'Invoice/IssueTime',
      'IssueTime is missing. LHDN expects UTC.',
    ],
    [
      'DocumentCurrencyCode',
      (inv: Record<string, unknown>) => delete inv.DocumentCurrencyCode,
      'Invoice/DocumentCurrencyCode',
      'DocumentCurrencyCode is missing.',
    ],
    [
      'AccountingSupplierParty',
      (inv: Record<string, unknown>) => delete inv.AccountingSupplierParty,
      'Invoice/AccountingSupplierParty',
      'AccountingSupplierParty is missing.',
    ],
    [
      'AccountingCustomerParty',
      (inv: Record<string, unknown>) => delete inv.AccountingCustomerParty,
      'Invoice/AccountingCustomerParty',
      'AccountingCustomerParty is missing.',
    ],
    [
      'InvoiceLine',
      (inv: Record<string, unknown>) => {
        inv.InvoiceLine = [];
      },
      'Invoice/InvoiceLine',
      'InvoiceLine is missing.',
    ],
    [
      'TaxTotal/TaxAmount',
      (inv: Record<string, unknown>) => {
        const total = (inv.TaxTotal as Array<Record<string, unknown>>)[0];
        delete total.TaxAmount;
      },
      'Invoice/TaxTotal/TaxAmount',
      'TaxAmount is missing.',
    ],
    [
      'LegalMonetaryTotal/TaxExclusiveAmount',
      (inv: Record<string, unknown>) => {
        const lmt = (inv.LegalMonetaryTotal as Array<Record<string, unknown>>)[0];
        delete lmt.TaxExclusiveAmount;
      },
      'Invoice/LegalMonetaryTotal/TaxExclusiveAmount',
      'TaxExclusiveAmount is missing.',
    ],
    [
      'LegalMonetaryTotal/TaxInclusiveAmount',
      (inv: Record<string, unknown>) => {
        const lmt = (inv.LegalMonetaryTotal as Array<Record<string, unknown>>)[0];
        delete lmt.TaxInclusiveAmount;
      },
      'Invoice/LegalMonetaryTotal/TaxInclusiveAmount',
      'TaxInclusiveAmount is missing.',
    ],
    [
      'LegalMonetaryTotal/PayableAmount',
      (inv: Record<string, unknown>) => {
        const lmt = (inv.LegalMonetaryTotal as Array<Record<string, unknown>>)[0];
        delete lmt.PayableAmount;
      },
      'Invoice/LegalMonetaryTotal/PayableAmount',
      'PayableAmount is missing.',
    ],
    [
      'TaxSubtotal TaxAmount',
      (inv: Record<string, unknown>) => {
        const sub = (
          (inv.TaxTotal as Array<{ TaxSubtotal: Array<Record<string, unknown>> }>)[0]
            .TaxSubtotal[0]
        );
        delete sub.TaxAmount;
      },
      'Invoice/TaxTotal/TaxSubtotal[0]/TaxAmount',
      'TaxAmount is missing.',
    ],
    [
      'TaxSubtotal TaxCategory/ID',
      (inv: Record<string, unknown>) => {
        const sub = (
          (inv.TaxTotal as Array<{ TaxSubtotal: Array<Record<string, unknown>> }>)[0]
            .TaxSubtotal[0]
        );
        delete sub.TaxCategory;
      },
      'Invoice/TaxTotal/TaxSubtotal[0]/TaxCategory/ID',
      'ID is missing.',
    ],
  ])('errors when %s is missing', (_label, mutate, path, message) => {
    const extra = path === 'Invoice/DocumentCurrencyCode' ? { lhdnCode: 'CF378' } : {};
    expect(check(doc(mutate))).toEqual([finding('required.missing', path, message, extra)]);
  });

  it('cites CF378 only on DocumentCurrencyCode', () => {
    const currency = check(doc((inv) => delete inv.DocumentCurrencyCode));
    expect(currency[0]?.lhdnCode).toBe('CF378');
    const id = check(doc((inv) => delete inv.ID));
    expect(id[0]?.lhdnCode).toBeUndefined();
  });

  it('cites INVOICE_V1_0 when listVersionID is 1.0', () => {
    const findings = check(doc((inv) => delete inv.ID, '1.0'));
    expect(findings[0]?.docUrl).toBe(INVOICE_V1_0);
  });

  it('cites INVOICE_V1_0 when listVersionID is padded " 1.0 "', () => {
    const findings = check(doc((inv) => delete inv.ID, ' 1.0 '));
    expect(findings[0]?.docUrl).toBe(INVOICE_V1_0);
  });

  it('errors when a mandatory value is an empty string', () => {
    expect(check(doc((inv) => (inv.ID = L(''))))).toEqual([
      finding('required.missing', 'Invoice/ID', 'ID is missing.'),
    ]);
  });

  it('errors when TaxSubtotal is missing', () => {
    expect(
      check(
        doc((inv) => {
          const total = (inv.TaxTotal as Array<Record<string, unknown>>)[0];
          delete total.TaxSubtotal;
        }),
      ),
    ).toEqual([
      finding('required.missing', 'Invoice/TaxTotal/TaxSubtotal', 'TaxSubtotal is missing.'),
    ]);
  });

  describe('supplier and buyer', () => {
    it.each([
      [
        'supplier RegistrationName',
        (inv: Record<string, unknown>) => {
          delete partyOf(inv, 'AccountingSupplierParty').PartyLegalEntity;
        },
        'Invoice/AccountingSupplierParty/Party/PartyLegalEntity/RegistrationName',
        'RegistrationName is missing.',
      ],
      [
        'buyer RegistrationName',
        (inv: Record<string, unknown>) => {
          delete partyOf(inv, 'AccountingCustomerParty').PartyLegalEntity;
        },
        'Invoice/AccountingCustomerParty/Party/PartyLegalEntity/RegistrationName',
        'RegistrationName is missing.',
      ],
      [
        'supplier TIN',
        (inv: Record<string, unknown>) => {
          partyOf(inv, 'AccountingSupplierParty').PartyIdentification = [
            ident('BRN', '202001234567'),
          ];
        },
        'Invoice/AccountingSupplierParty/Party/PartyIdentification[TIN]',
        'PartyIdentification with schemeID TIN is missing.',
      ],
      [
        'buyer registration id',
        (inv: Record<string, unknown>) => {
          partyOf(inv, 'AccountingCustomerParty').PartyIdentification = [
            ident('TIN', 'C0987654321'),
          ];
        },
        'Invoice/AccountingCustomerParty/Party/PartyIdentification',
        'PartyIdentification with schemeID NRIC, BRN, PASSPORT, or ARMY is missing.',
      ],
      [
        'supplier AddressLine',
        (inv: Record<string, unknown>) => {
          const addr = (
            partyOf(inv, 'AccountingSupplierParty').PostalAddress as Array<
              Record<string, unknown>
            >
          )[0];
          delete addr.AddressLine;
        },
        'Invoice/AccountingSupplierParty/Party/PostalAddress/AddressLine[0]/Line',
        'Line is missing.',
      ],
      [
        'buyer CityName',
        (inv: Record<string, unknown>) => {
          const addr = (
            partyOf(inv, 'AccountingCustomerParty').PostalAddress as Array<
              Record<string, unknown>
            >
          )[0];
          delete addr.CityName;
        },
        'Invoice/AccountingCustomerParty/Party/PostalAddress/CityName',
        'CityName is missing.',
      ],
      [
        'supplier CountrySubentityCode',
        (inv: Record<string, unknown>) => {
          const addr = (
            partyOf(inv, 'AccountingSupplierParty').PostalAddress as Array<
              Record<string, unknown>
            >
          )[0];
          delete addr.CountrySubentityCode;
        },
        'Invoice/AccountingSupplierParty/Party/PostalAddress/CountrySubentityCode',
        'CountrySubentityCode is missing.',
      ],
      [
        'buyer Country',
        (inv: Record<string, unknown>) => {
          const addr = (
            partyOf(inv, 'AccountingCustomerParty').PostalAddress as Array<
              Record<string, unknown>
            >
          )[0];
          delete addr.Country;
        },
        'Invoice/AccountingCustomerParty/Party/PostalAddress/Country/IdentificationCode',
        'IdentificationCode is missing.',
      ],
      [
        'supplier Telephone',
        (inv: Record<string, unknown>) => {
          delete partyOf(inv, 'AccountingSupplierParty').Contact;
        },
        'Invoice/AccountingSupplierParty/Party/Contact/Telephone',
        'Telephone is missing.',
      ],
      [
        'supplier MSIC value',
        (inv: Record<string, unknown>) => {
          partyOf(inv, 'AccountingSupplierParty').IndustryClassificationCode = [
            { name: 'Growing of maize' },
          ];
        },
        'Invoice/AccountingSupplierParty/Party/IndustryClassificationCode',
        'IndustryClassificationCode is missing.',
      ],
      [
        'supplier MSIC name',
        (inv: Record<string, unknown>) => {
          partyOf(inv, 'AccountingSupplierParty').IndustryClassificationCode = [{ _: '01111' }];
        },
        'Invoice/AccountingSupplierParty/Party/IndustryClassificationCode/name',
        'IndustryClassificationCode name is missing.',
      ],
    ])('errors when %s is missing', (_label, mutate, path, message) => {
      expect(check(doc(mutate))).toEqual([finding('required.missing', path, message)]);
    });

    it('does not require MSIC on the buyer', () => {
      expect(check(doc())).toEqual([]);
    });

    it('accepts PASSPORT and ARMY as registration identifiers', () => {
      expect(
        check(
          doc((inv) => {
            partyOf(inv, 'AccountingSupplierParty').PartyIdentification = [
              ident('TIN', 'C1234567890'),
              ident('PASSPORT', 'A12345678'),
            ];
            partyOf(inv, 'AccountingCustomerParty').PartyIdentification = [
              ident('TIN', 'C0987654321'),
              ident('ARMY', 'WA1234567'),
            ];
          }),
        ),
      ).toEqual([]);
    });

    it.each(['', ' ', '\t  '])('does not count TIN %j as present', (id) => {
      expect(
        check(
          doc((inv) => {
            partyOf(inv, 'AccountingSupplierParty').PartyIdentification = [
              ident('TIN', id),
              ident('BRN', '202001234567'),
            ];
          }),
        ),
      ).toEqual([
        finding(
          'required.missing',
          'Invoice/AccountingSupplierParty/Party/PartyIdentification[TIN]',
          'PartyIdentification with schemeID TIN is missing.',
        ),
      ]);
    });

    it.each([
      ['NRIC', ''],
      ['BRN', ' '],
      ['PASSPORT', '\t'],
      ['ARMY', '  \n'],
    ])('does not count %s identification %j as present', (scheme, id) => {
      expect(
        check(
          doc((inv) => {
            partyOf(inv, 'AccountingCustomerParty').PartyIdentification = [
              ident('TIN', 'C0987654321'),
              ident(scheme, id),
            ];
          }),
        ),
      ).toEqual([
        finding(
          'required.missing',
          'Invoice/AccountingCustomerParty/Party/PartyIdentification',
          'PartyIdentification with schemeID NRIC, BRN, PASSPORT, or ARMY is missing.',
        ),
      ]);
    });
  });

  describe('InvoiceLine', () => {
    it.each([
      [
        'ID',
        (line: Record<string, unknown>) => delete line.ID,
        'Invoice/InvoiceLine[0]/ID',
        'ID is missing.',
      ],
      [
        'Description',
        (line: Record<string, unknown>) => {
          delete (line.Item as Array<Record<string, unknown>>)[0].Description;
        },
        'Invoice/InvoiceLine[0]/Item/Description',
        'Description is missing.',
      ],
      [
        'CLASS classification',
        (line: Record<string, unknown>) => {
          (line.Item as Array<Record<string, unknown>>)[0].CommodityClassification = [
            { ItemClassificationCode: [{ _: '9800.00.001', listID: 'PTC' }] },
          ];
        },
        'Invoice/InvoiceLine[0]/Item/CommodityClassification/ItemClassificationCode[CLASS]',
        'ItemClassificationCode with listID CLASS is missing.',
      ],
      [
        'PriceAmount',
        (line: Record<string, unknown>) => delete line.Price,
        'Invoice/InvoiceLine[0]/Price/PriceAmount',
        'PriceAmount is missing.',
      ],
      [
        'ItemPriceExtension/Amount',
        (line: Record<string, unknown>) => delete line.ItemPriceExtension,
        'Invoice/InvoiceLine[0]/ItemPriceExtension/Amount',
        'Amount is missing.',
      ],
      [
        'LineExtensionAmount',
        (line: Record<string, unknown>) => delete line.LineExtensionAmount,
        'Invoice/InvoiceLine[0]/LineExtensionAmount',
        'LineExtensionAmount is missing.',
      ],
      [
        'TaxAmount',
        (line: Record<string, unknown>) => {
          delete (line.TaxTotal as Array<Record<string, unknown>>)[0].TaxAmount;
        },
        'Invoice/InvoiceLine[0]/TaxTotal/TaxAmount',
        'TaxAmount is missing.',
      ],
      [
        'TaxSubtotal TaxCategory/ID',
        (line: Record<string, unknown>) => {
          const sub = (
            (line.TaxTotal as Array<{ TaxSubtotal: Array<Record<string, unknown>> }>)[0]
              .TaxSubtotal[0]
          );
          delete sub.TaxCategory;
        },
        'Invoice/InvoiceLine[0]/TaxTotal/TaxSubtotal[0]/TaxCategory/ID',
        'ID is missing.',
      ],
    ])('errors when %s is missing', (_label, mutateLine, path, message) => {
      expect(
        check(
          doc((inv) => {
            mutateLine((inv.InvoiceLine as Array<Record<string, unknown>>)[0]);
          }),
        ),
      ).toEqual([finding('required.missing', path, message)]);
    });

    it.each(['', '   '])('does not count CLASS ItemClassificationCode %j as present', (code) => {
      expect(
        check(
          doc((inv) => {
            (inv.InvoiceLine as Array<{ Item: Array<Record<string, unknown>> }>)[0].Item[0].CommodityClassification =
              [{ ItemClassificationCode: [{ _: code, listID: 'CLASS' }] }];
          }),
        ),
      ).toEqual([
        finding(
          'required.missing',
          'Invoice/InvoiceLine[0]/Item/CommodityClassification/ItemClassificationCode[CLASS]',
          'ItemClassificationCode with listID CLASS is missing.',
        ),
      ]);
    });

    it('does not require TaxAmount on a line TaxSubtotal', () => {
      expect(
        check(
          doc((inv) => {
            const sub = (
              (inv.InvoiceLine as Array<{ TaxTotal: Array<{ TaxSubtotal: Array<Record<string, unknown>> }>}>)[0]
                .TaxTotal[0].TaxSubtotal[0]
            );
            delete sub.TaxAmount;
          }),
        ),
      ).toEqual([]);
    });
  });
});

describe('required.format', () => {
  it('errors when IssueDate is not YYYY-MM-DD', () => {
    expect(check(doc((inv) => (inv.IssueDate = L('15-01-2026'))))).toEqual([
      finding('required.format', 'Invoice/IssueDate', 'IssueDate must be YYYY-MM-DD.'),
    ]);
  });

  it('accepts IssueTime with Z or offset and errors otherwise', () => {
    expect(check(doc((inv) => (inv.IssueTime = L('12:01:26'))))).toEqual([]);
    expect(check(doc((inv) => (inv.IssueTime = L('12:01:26+08:00'))))).toEqual([]);
    expect(check(doc((inv) => (inv.IssueTime = L('12:01:26-00:00'))))).toEqual([]);
    expect(check(doc((inv) => (inv.IssueTime = L('12:01'))))).toEqual([
      finding(
        'required.format',
        'Invoice/IssueTime',
        'IssueTime must be HH:MM:SS with optional Z or ±HH:MM. LHDN expects UTC.',
      ),
    ]);
  });
});

describe('required.max-length', () => {
  it('accepts values at the maximum length', () => {
    expect(
      check(
        doc((inv) => {
          inv.ID = L('A'.repeat(50));
          partyOf(inv, 'AccountingSupplierParty').PartyLegalEntity = [
            { RegistrationName: L('S'.repeat(300)) },
          ];
          partyOf(inv, 'AccountingCustomerParty').PartyLegalEntity = [
            { RegistrationName: L('B'.repeat(300)) },
          ];
          partyOf(inv, 'AccountingSupplierParty').IndustryClassificationCode = [
            { _: '01111', name: 'N'.repeat(300) },
          ];
          (inv.InvoiceLine as Array<{ Item: Array<Record<string, unknown>> }>)[0].Item[0].Description =
            L('D'.repeat(300));
        }),
      ),
    ).toEqual([]);
  });

  it.each([
    [
      'Invoice ID',
      (inv: Record<string, unknown>) => {
        inv.ID = L('A'.repeat(51));
      },
      'Invoice/ID',
      'ID exceeds maximum length of 50.',
    ],
    [
      'supplier RegistrationName',
      (inv: Record<string, unknown>) => {
        partyOf(inv, 'AccountingSupplierParty').PartyLegalEntity = [
          { RegistrationName: L('S'.repeat(301)) },
        ];
      },
      'Invoice/AccountingSupplierParty/Party/PartyLegalEntity/RegistrationName',
      'RegistrationName exceeds maximum length of 300.',
    ],
    [
      'buyer RegistrationName',
      (inv: Record<string, unknown>) => {
        partyOf(inv, 'AccountingCustomerParty').PartyLegalEntity = [
          { RegistrationName: L('B'.repeat(301)) },
        ];
      },
      'Invoice/AccountingCustomerParty/Party/PartyLegalEntity/RegistrationName',
      'RegistrationName exceeds maximum length of 300.',
    ],
    [
      'MSIC name',
      (inv: Record<string, unknown>) => {
        partyOf(inv, 'AccountingSupplierParty').IndustryClassificationCode = [
          { _: '01111', name: 'N'.repeat(301) },
        ];
      },
      'Invoice/AccountingSupplierParty/Party/IndustryClassificationCode/name',
      'IndustryClassificationCode name exceeds maximum length of 300.',
    ],
    [
      'line Description',
      (inv: Record<string, unknown>) => {
        (inv.InvoiceLine as Array<{ Item: Array<Record<string, unknown>> }>)[0].Item[0].Description =
          L('D'.repeat(301));
      },
      'Invoice/InvoiceLine[0]/Item/Description',
      'Description exceeds maximum length of 300.',
    ],
  ])('errors when %s exceeds the limit', (_label, mutate, path, message) => {
    expect(check(doc(mutate))).toEqual([finding('required.max-length', path, message)]);
  });
});

describe('required.amount-length', () => {
  it('accepts amount values with 26 digits', () => {
    const digits26 = '1'.repeat(24) + '.12';
    expect(
      check(
        doc((inv) => {
          (inv.LegalMonetaryTotal as Array<Record<string, unknown>>)[0].PayableAmount = L(
            digits26,
            { currencyID: 'MYR' },
          );
        }),
      ),
    ).toEqual([]);
  });

  it('errors when an amount has more than 26 digits', () => {
    const digits27 = '1'.repeat(27);
    expect(
      check(
        doc((inv) => {
          (inv.LegalMonetaryTotal as Array<Record<string, unknown>>)[0].PayableAmount = L(
            digits27,
            { currencyID: 'MYR' },
          );
        }),
      ),
    ).toEqual([
      finding(
        'required.amount-length',
        'Invoice/LegalMonetaryTotal/PayableAmount',
        'PayableAmount has more than 26 digits.',
      ),
    ]);
  });

  it('counts digits only and checks nested line amounts', () => {
    expect(
      check(
        doc((inv) => {
          (inv.InvoiceLine as Array<Record<string, unknown>>)[0].LineExtensionAmount = L(
            '-12345678901234567890123456.7',
            { currencyID: 'MYR' },
          );
        }),
      ),
    ).toEqual([
      finding(
        'required.amount-length',
        'Invoice/InvoiceLine[0]/LineExtensionAmount',
        'LineExtensionAmount has more than 26 digits.',
      ),
    ]);
  });
});

describe('required.exemption-reason', () => {
  it('accepts tax category E when TaxExemptionReason is present', () => {
    expect(
      check(
        doc((inv) => {
          const sub = (
            (inv.TaxTotal as Array<{ TaxSubtotal: Array<Record<string, unknown>> }>)[0]
              .TaxSubtotal[0]
          );
          sub.TaxCategory = [{ ID: L('E'), TaxExemptionReason: L('Export sales') }];
          const lineSub = (
            (inv.InvoiceLine as Array<{
              TaxTotal: Array<{ TaxSubtotal: Array<Record<string, unknown>> }>;
            }>)[0].TaxTotal[0].TaxSubtotal[0]
          );
          lineSub.TaxCategory = [{ ID: L('E'), TaxExemptionReason: L('Export sales') }];
        }),
      ),
    ).toEqual([]);
  });

  it('warns when TaxExemptionReason is missing for category E', () => {
    expect(
      check(
        doc((inv) => {
          const sub = (
            (inv.TaxTotal as Array<{ TaxSubtotal: Array<Record<string, unknown>> }>)[0]
              .TaxSubtotal[0]
          );
          sub.TaxCategory = [{ ID: L('E') }];
        }),
      ),
    ).toEqual([
      finding(
        'required.exemption-reason',
        'Invoice/TaxTotal/TaxSubtotal[0]/TaxCategory/TaxExemptionReason',
        'Mandatory if tax exemption is applicable',
        { severity: 'warning' },
      ),
    ]);
  });

  it.each(['', '   '])('warns when TaxExemptionReason is %j for category E', (reason) => {
    expect(
      check(
        doc((inv) => {
          const sub = (
            (inv.TaxTotal as Array<{ TaxSubtotal: Array<Record<string, unknown>> }>)[0]
              .TaxSubtotal[0]
          );
          sub.TaxCategory = [{ ID: L('E'), TaxExemptionReason: L(reason) }];
        }),
      ),
    ).toEqual([
      finding(
        'required.exemption-reason',
        'Invoice/TaxTotal/TaxSubtotal[0]/TaxCategory/TaxExemptionReason',
        'Mandatory if tax exemption is applicable',
        { severity: 'warning' },
      ),
    ]);
  });

  it('errors when TaxExemptionReason exceeds 300 characters', () => {
    expect(
      check(
        doc((inv) => {
          const sub = (
            (inv.TaxTotal as Array<{ TaxSubtotal: Array<Record<string, unknown>> }>)[0]
              .TaxSubtotal[0]
          );
          sub.TaxCategory = [{ ID: L('E'), TaxExemptionReason: L('R'.repeat(301)) }];
        }),
      ),
    ).toEqual([
      finding(
        'required.exemption-reason',
        'Invoice/TaxTotal/TaxSubtotal[0]/TaxCategory/TaxExemptionReason',
        'TaxExemptionReason exceeds maximum length of 300.',
      ),
    ]);
  });
});

function originalRef(uuid?: string, id?: string) {
  const node: Record<string, unknown> = {};
  if (uuid !== undefined) node.UUID = L(uuid);
  if (id !== undefined) node.ID = L(id);
  return [{ InvoiceDocumentReference: [node] }];
}

function asNote(
  type: string,
  extra?: (invoice: Record<string, unknown>) => void,
  version = '1.1',
) {
  return doc((inv) => {
    inv.InvoiceTypeCode = [{ _: type, listVersionID: version }];
    extra?.(inv);
  }, version);
}

describe('required.original-reference', () => {
  it('accepts a credit note with UUID and ID both present and within 26 characters', () => {
    expect(
      check(
        asNote('02', (inv) => {
          inv.BillingReference = originalRef('F9D425P6DS7D8IU', 'INV12345');
        }),
      ),
    ).toEqual([]);
  });

  it.each(['03', '04'])('accepts type %s with a complete original reference pair', (type) => {
    expect(
      check(
        asNote(type, (inv) => {
          inv.BillingReference = originalRef('F9D425P6DS7D8IU', 'INV12345');
        }),
      ),
    ).toEqual([]);
  });

  it('errors when UUID is missing from InvoiceDocumentReference', () => {
    expect(
      check(
        asNote('02', (inv) => {
          inv.BillingReference = originalRef(undefined, 'INV12345');
        }),
      ),
    ).toEqual([
      finding(
        'required.original-reference',
        'Invoice/BillingReference/InvoiceDocumentReference/UUID',
        'UUID is missing. Original e-Invoice reference UUID and ID are both required.',
        { docUrl: CREDIT_V1_1 },
      ),
    ]);
  });

  it('errors when ID is missing from InvoiceDocumentReference', () => {
    expect(
      check(
        asNote('02', (inv) => {
          inv.BillingReference = originalRef('F9D425P6DS7D8IU', undefined);
        }),
      ),
    ).toEqual([
      finding(
        'required.original-reference',
        'Invoice/BillingReference/InvoiceDocumentReference/ID',
        'ID is missing. Original e-Invoice reference UUID and ID are both required.',
        { docUrl: CREDIT_V1_1 },
      ),
    ]);
  });

  it('errors when UUID or ID exceeds 26 characters', () => {
    expect(
      check(
        asNote('02', (inv) => {
          inv.BillingReference = originalRef('U'.repeat(27), 'INV12345');
        }),
      ),
    ).toEqual([
      finding(
        'required.original-reference',
        'Invoice/BillingReference/InvoiceDocumentReference/UUID',
        'UUID exceeds maximum length of 26.',
        { docUrl: CREDIT_V1_1 },
      ),
    ]);

    expect(
      check(
        asNote('02', (inv) => {
          inv.BillingReference = originalRef('F9D425P6DS7D8IU', 'I'.repeat(27));
        }),
      ),
    ).toEqual([
      finding(
        'required.original-reference',
        'Invoice/BillingReference/InvoiceDocumentReference/ID',
        'ID exceeds maximum length of 26.',
        { docUrl: CREDIT_V1_1 },
      ),
    ]);
  });

  it('warns when a credit note has no InvoiceDocumentReference', () => {
    expect(check(asNote('02'))).toEqual([
      finding(
        'required.original-reference',
        'Invoice/BillingReference/InvoiceDocumentReference',
        'Original e-Invoice reference is expected for credit, debit, and refund notes.',
        { severity: 'warning', docUrl: CREDIT_V1_1 },
      ),
    ]);
  });

  it('does not apply the rule to Invoice type 01', () => {
    expect(check(doc())).toEqual([]);
    expect(
      check(
        doc((inv) => {
          inv.BillingReference = originalRef('F9D425P6DS7D8IU', undefined);
        }),
      ),
    ).toEqual([]);
  });

  it.each([
    ['12', SELF_BILLED_CREDIT_V1_1],
    ['13', SELF_BILLED_DEBIT_V1_1],
    ['14', SELF_BILLED_REFUND_V1_1],
  ] as const)('warns when type %s has no InvoiceDocumentReference', (type, docUrl) => {
    expect(check(asNote(type))).toEqual([
      finding(
        'required.original-reference',
        'Invoice/BillingReference/InvoiceDocumentReference',
        'Original e-Invoice reference is expected for credit, debit, and refund notes.',
        { severity: 'warning', docUrl },
      ),
    ]);
  });

  it('does not apply the rule to Self-billed Invoice type 11', () => {
    expect(check(asNote('11'))).toEqual([]);
    expect(
      check(
        asNote('11', (inv) => {
          inv.BillingReference = originalRef('F9D425P6DS7D8IU', undefined);
        }),
      ),
    ).toEqual([]);
  });

  it('errors when UUID is missing from a self-billed debit note type 13', () => {
    expect(
      check(
        asNote('13', (inv) => {
          inv.BillingReference = originalRef(undefined, 'INV12345');
        }),
      ),
    ).toEqual([
      finding(
        'required.original-reference',
        'Invoice/BillingReference/InvoiceDocumentReference/UUID',
        'UUID is missing. Original e-Invoice reference UUID and ID are both required.',
        { docUrl: SELF_BILLED_DEBIT_V1_1 },
      ),
    ]);
  });

  it('cites CREDIT_V1_0 for a type 02 version 1.0 finding', () => {
    const findings = check(asNote('02', undefined, '1.0'));
    expect(findings).toEqual([
      finding(
        'required.original-reference',
        'Invoice/BillingReference/InvoiceDocumentReference',
        'Original e-Invoice reference is expected for credit, debit, and refund notes.',
        { severity: 'warning', docUrl: CREDIT_V1_0 },
      ),
    ]);
  });

  it('errors when UUID is an empty string', () => {
    expect(
      check(
        asNote('02', (inv) => {
          inv.BillingReference = originalRef('', 'INV12345');
        }),
      ),
    ).toEqual([
      finding(
        'required.original-reference',
        'Invoice/BillingReference/InvoiceDocumentReference/UUID',
        'UUID is missing. Original e-Invoice reference UUID and ID are both required.',
        { docUrl: CREDIT_V1_1 },
      ),
    ]);
  });

  it('errors when ID is an empty string', () => {
    expect(
      check(
        asNote('02', (inv) => {
          inv.BillingReference = originalRef('F9D425P6DS7D8IU', '');
        }),
      ),
    ).toEqual([
      finding(
        'required.original-reference',
        'Invoice/BillingReference/InvoiceDocumentReference/ID',
        'ID is missing. Original e-Invoice reference UUID and ID are both required.',
        { docUrl: CREDIT_V1_1 },
      ),
    ]);
  });

  it('indexes the second BillingReference when it is missing ID', () => {
    const findings = check(
      asNote('02', (inv) => {
        inv.BillingReference = [
          ...originalRef('F9D425P6DS7D8IU', 'INV12345'),
          ...originalRef('F9D425P6DS7D8IU', undefined),
        ];
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('required.original-reference');
    expect(findings[0]?.path).toContain('BillingReference[1]');
  });

  it('indexes the second InvoiceDocumentReference when it is missing UUID', () => {
    const findings = check(
      asNote('02', (inv) => {
        inv.BillingReference = [
          {
            InvoiceDocumentReference: [
              { UUID: L('F9D425P6DS7D8IU'), ID: L('INV12345') },
              { ID: L('INV67890') },
            ],
          },
        ];
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('required.original-reference');
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.path).toContain('InvoiceDocumentReference[1]');
  });

  it('accepts UUID and ID at the 26-character boundary', () => {
    expect(
      check(
        asNote('02', (inv) => {
          inv.BillingReference = originalRef('U'.repeat(26), 'I'.repeat(26));
        }),
      ),
    ).toEqual([]);
  });
});

