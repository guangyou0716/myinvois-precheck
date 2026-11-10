import { describe, expect, it } from 'vitest';
import { CORE_FIELDS, FAQ, TAXPAYER } from '../src/docs.js';
import { check } from '../src/rules-parties.js';
import type { Finding } from '../src/types.js';

function L(value: string | number, attrs: Record<string, string> = {}) {
  return [{ _: value, ...attrs }];
}

function ident(scheme: string, id: string) {
  return { ID: [{ _: id, schemeID: scheme }] };
}

function address(overrides: Record<string, unknown> = {}) {
  return {
    AddressLine: [{ Line: L('Lot 1, Jalan Example') }],
    CityName: L('Kuala Lumpur'),
    PostalZone: L('50000'),
    CountrySubentityCode: L('14'),
    Country: [{ IdentificationCode: L('MYS') }],
    ...overrides,
  };
}

function supplierParty(): Record<string, unknown> {
  return {
    PartyLegalEntity: [{ RegistrationName: L('Supplier Sdn Bhd') }],
    PartyIdentification: [
      ident('TIN', 'C1234567890'),
      ident('BRN', '202001234567'),
      ident('SST', 'NA'),
      ident('TTX', 'NA'),
    ],
    PostalAddress: [address()],
    Contact: [{ Telephone: L('+60123456789'), ElectronicMail: L('supplier@example.com') }],
  };
}

function buyerParty(): Record<string, unknown> {
  return {
    PartyLegalEntity: [{ RegistrationName: L('Buyer Bhd') }],
    PartyIdentification: [ident('TIN', 'C9876543210'), ident('NRIC', '880101015555')],
    PostalAddress: [address()],
    Contact: [{ Telephone: L('+60198765432'), ElectronicMail: L('buyer@example.com') }],
  };
}

function doc(mutate?: (invoice: Record<string, unknown>) => void): Record<string, unknown> {
  const invoice: Record<string, unknown> = {
    InvoiceTypeCode: [{ _: '01', listVersionID: '1.1' }],
    AccountingSupplierParty: [{ Party: [supplierParty()] }],
    AccountingCustomerParty: [{ Party: [buyerParty()] }],
  };
  mutate?.(invoice);
  return { Invoice: [invoice] };
}

function partyOf(invoice: Record<string, unknown>, key: string): Record<string, unknown> {
  const side = invoice[key] as Array<{ Party: Array<Record<string, unknown>> }>;
  return side[0].Party[0];
}

function setIdent(party: Record<string, unknown>, scheme: string, value: string): void {
  const idents = party.PartyIdentification as Array<{ ID: Array<Record<string, unknown>> }>;
  const existing = idents.find((item) => item.ID[0]?.schemeID === scheme);
  if (existing) {
    existing.ID[0]._ = value;
    return;
  }
  idents.push(ident(scheme, value));
}

function removeIdent(party: Record<string, unknown>, scheme: string): void {
  const idents = party.PartyIdentification as Array<{ ID: Array<Record<string, unknown>> }>;
  party.PartyIdentification = idents.filter((item) => item.ID[0]?.schemeID !== scheme);
}

function setCountry(party: Record<string, unknown>, country: string, state = '17'): void {
  const addr = (party.PostalAddress as Array<Record<string, unknown>>)[0];
  addr.Country = [{ IdentificationCode: L(country) }];
  addr.CountrySubentityCode = L(state);
  if (country !== 'MYS') {
    addr.PostalZone = L('10001');
    addr.CityName = L('New York');
  }
}

function invoiceLine(classCode = '004'): Record<string, unknown> {
  return {
    ID: L('1'),
    Item: [
      {
        CommodityClassification: [{ ItemClassificationCode: [{ _: classCode, listID: 'CLASS' }] }],
      },
    ],
  };
}

function setLines(invoice: Record<string, unknown>, classCodes: string[]): void {
  invoice.InvoiceLine = classCodes.map((code, i) => {
    const line = invoiceLine(code);
    line.ID = L(String(i + 1));
    return line;
  });
}

function finding(
  rule: string,
  path: string,
  message: string,
  extra: { severity?: 'error' | 'warning'; docUrl?: string; lhdnCode?: string } = {},
): Finding {
  const result: Finding = {
    rule,
    severity: extra.severity ?? 'error',
    path,
    message,
    docUrl: extra.docUrl ?? CORE_FIELDS,
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

  it('returns no findings for a valid invoice', () => {
    expect(check(doc())).toEqual([]);
  });
});

describe('parties.tin-length', () => {
  it('accepts a TIN of 14 characters', () => {
    const findings = check(
      doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TIN', 'C1234567890120')),
    );
    expect(findings.filter((f) => f.rule === 'parties.tin-length')).toEqual([]);
  });

  it('errors when TIN is longer than 14 characters', () => {
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TIN', 'C12345678901230'))),
    ).toEqual([
      finding(
        'parties.tin-length',
        'Invoice/AccountingSupplierParty/Party/PartyIdentification[TIN]',
        'TIN exceeds maximum length of 14.',
      ),
    ]);
  });
});

describe('parties.tin-format', () => {
  it('accepts individual, non-individual, and general TINs', () => {
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingCustomerParty'), 'TIN', 'IG123456789'))),
    ).toEqual([]);
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TIN', 'CS1234567890'))),
    ).toEqual([]);
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TIN', 'FA1234567890'))),
    ).toEqual([]);
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TIN', 'EI12345678901'))),
    ).toEqual([]);
  });

  it('warns when TIN does not match the LHDN FAQ format', () => {
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TIN', 'C1234567891'))),
    ).toEqual([
      finding(
        'parties.tin-format',
        'Invoice/AccountingSupplierParty/Party/PartyIdentification[TIN]',
        'TIN does not match the LHDN FAQ format.',
        { severity: 'warning', docUrl: FAQ },
      ),
    ]);
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TIN', 'C01234567890'))),
    ).toEqual([
      finding(
        'parties.tin-format',
        'Invoice/AccountingSupplierParty/Party/PartyIdentification[TIN]',
        'TIN does not match the LHDN FAQ format.',
        { severity: 'warning', docUrl: FAQ },
      ),
    ]);
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TIN', 'XX1234567890'))),
    ).toEqual([
      finding(
        'parties.tin-format',
        'Invoice/AccountingSupplierParty/Party/PartyIdentification[TIN]',
        'TIN does not match the LHDN FAQ format.',
        { severity: 'warning', docUrl: FAQ },
      ),
    ]);
  });
});

describe('parties.id-length', () => {
  it('accepts NRIC/PASSPORT/ARMY up to 12, BRN up to 20, and NA for BRN/NRIC', () => {
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingCustomerParty'), 'NRIC', '123456789012'))),
    ).toEqual([]);
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'BRN', '12345678901234567890'))),
    ).toEqual([]);
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingCustomerParty'), 'NRIC', 'NA'))),
    ).toEqual([]);
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'BRN', 'NA'))),
    ).toEqual([]);
  });

  it('errors when NRIC, PASSPORT, ARMY, or BRN exceed their max length', () => {
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingCustomerParty'), 'NRIC', '1234567890123'))),
    ).toEqual([
      finding(
        'parties.id-length',
        'Invoice/AccountingCustomerParty/Party/PartyIdentification[NRIC]',
        'NRIC exceeds maximum length of 12.',
      ),
    ]);
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingCustomerParty'), 'PASSPORT', '1234567890123'))),
    ).toEqual([
      finding(
        'parties.id-length',
        'Invoice/AccountingCustomerParty/Party/PartyIdentification[PASSPORT]',
        'PASSPORT exceeds maximum length of 12.',
      ),
    ]);
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingCustomerParty'), 'ARMY', '1234567890123'))),
    ).toEqual([
      finding(
        'parties.id-length',
        'Invoice/AccountingCustomerParty/Party/PartyIdentification[ARMY]',
        'ARMY exceeds maximum length of 12.',
      ),
    ]);
    expect(
      check(
        doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'BRN', '123456789012345678901')),
      ),
    ).toEqual([
      finding(
        'parties.id-length',
        'Invoice/AccountingSupplierParty/Party/PartyIdentification[BRN]',
        'BRN exceeds maximum length of 20.',
      ),
    ]);
  });
});

describe('parties.sst', () => {
  it('accepts NA or 1-2 letter/digit/hyphen values totalling at most 35 characters', () => {
    expect(check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'SST', 'NA')))).toEqual(
      [],
    );
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'SST', 'W10-1234'))),
    ).toEqual([]);
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'SST', 'W10-1234;C12-5678'))),
    ).toEqual([]);
  });

  it('errors when SST is present and invalid', () => {
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'SST', 'W10@1234'))),
    ).toEqual([
      finding(
        'parties.sst',
        'Invoice/AccountingSupplierParty/Party/PartyIdentification[SST]',
        'SST registration number is invalid.',
        { lhdnCode: 'CF406' },
      ),
    ]);
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'SST', 'A;B;C'))),
    ).toEqual([
      finding(
        'parties.sst',
        'Invoice/AccountingSupplierParty/Party/PartyIdentification[SST]',
        'SST registration number is invalid.',
        { lhdnCode: 'CF406' },
      ),
    ]);
    expect(
      check(
        doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'SST', 'A'.repeat(36))),
      ),
    ).toEqual([
      finding(
        'parties.sst',
        'Invoice/AccountingSupplierParty/Party/PartyIdentification[SST]',
        'SST registration number is invalid.',
        { lhdnCode: 'CF406' },
      ),
    ]);
  });
});

describe('parties.ttx', () => {
  it('accepts NA or a letter/digit/hyphen value of at most 17 characters', () => {
    expect(check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TTX', 'NA')))).toEqual(
      [],
    );
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TTX', 'TTX-12345'))),
    ).toEqual([]);
  });

  it('errors with CF407 when TTX format is invalid and CF412 when it also exceeds 17 characters', () => {
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TTX', 'TTX_1'))),
    ).toEqual([
      finding(
        'parties.ttx',
        'Invoice/AccountingSupplierParty/Party/PartyIdentification[TTX]',
        'Tourism tax registration number is invalid.',
        { lhdnCode: 'CF407' },
      ),
    ]);
    expect(
      check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TTX', 'A'.repeat(18)))),
    ).toEqual([
      finding(
        'parties.ttx',
        'Invoice/AccountingSupplierParty/Party/PartyIdentification[TTX]',
        'Tourism tax registration number is invalid.',
        { lhdnCode: 'CF412' },
      ),
    ]);
  });
});

describe('parties.email', () => {
  it('accepts optional emails in basic format up to 320 characters', () => {
    expect(check(doc())).toEqual([]);
    expect(
      check(
        doc((inv) => {
          const contact = (
            partyOf(inv, 'AccountingSupplierParty').Contact as Array<Record<string, unknown>>
          )[0];
          delete contact.ElectronicMail;
          const buyerContact = (
            partyOf(inv, 'AccountingCustomerParty').Contact as Array<Record<string, unknown>>
          )[0];
          delete buyerContact.ElectronicMail;
        }),
      ),
    ).toEqual([]);
  });

  it('errors with CF400, CF401, or CF411', () => {
    const longValid = `${'a'.repeat(317)}@b.co`;
    expect(
      check(
        doc((inv) => {
          (
            partyOf(inv, 'AccountingSupplierParty').Contact as Array<Record<string, unknown>>
          )[0].ElectronicMail = L(longValid);
        }),
      ),
    ).toEqual([
      finding(
        'parties.email',
        'Invoice/AccountingSupplierParty/Party/Contact/ElectronicMail',
        'ElectronicMail exceeds maximum length of 320.',
        { lhdnCode: 'CF400' },
      ),
    ]);
    expect(
      check(
        doc((inv) => {
          (
            partyOf(inv, 'AccountingSupplierParty').Contact as Array<Record<string, unknown>>
          )[0].ElectronicMail = L('not-an-email');
        }),
      ),
    ).toEqual([
      finding(
        'parties.email',
        'Invoice/AccountingSupplierParty/Party/Contact/ElectronicMail',
        'ElectronicMail format is invalid.',
        { lhdnCode: 'CF401' },
      ),
    ]);
    expect(
      check(
        doc((inv) => {
          (
            partyOf(inv, 'AccountingSupplierParty').Contact as Array<Record<string, unknown>>
          )[0].ElectronicMail = L('a'.repeat(321));
        }),
      ),
    ).toEqual([
      finding(
        'parties.email',
        'Invoice/AccountingSupplierParty/Party/Contact/ElectronicMail',
        'ElectronicMail exceeds maximum length of 320 and format is invalid.',
        { lhdnCode: 'CF411' },
      ),
    ]);
  });
});

describe('parties.phone', () => {
  it('accepts supplier/buyer numbers of 8-20 digits with optional leading + and buyer NA', () => {
    expect(check(doc())).toEqual([]);
    expect(
      check(
        doc((inv) => {
          (partyOf(inv, 'AccountingCustomerParty').Contact as Array<Record<string, unknown>>)[0].Telephone =
            L('NA');
        }),
      ),
    ).toEqual([]);
  });

  it('errors with CF408, CF409, or CF410', () => {
    expect(
      check(
        doc((inv) => {
          (partyOf(inv, 'AccountingSupplierParty').Contact as Array<Record<string, unknown>>)[0].Telephone =
            L('1234567');
        }),
      ),
    ).toEqual([
      finding(
        'parties.phone',
        'Invoice/AccountingSupplierParty/Party/Contact/Telephone',
        'Telephone is shorter than 8 characters.',
        { lhdnCode: 'CF408' },
      ),
    ]);
    expect(
      check(
        doc((inv) => {
          (partyOf(inv, 'AccountingSupplierParty').Contact as Array<Record<string, unknown>>)[0].Telephone =
            L('123456789012345678901');
        }),
      ),
    ).toEqual([
      finding(
        'parties.phone',
        'Invoice/AccountingSupplierParty/Party/Contact/Telephone',
        'Telephone exceeds maximum length of 20.',
        { lhdnCode: 'CF409' },
      ),
    ]);
    expect(
      check(
        doc((inv) => {
          (partyOf(inv, 'AccountingSupplierParty').Contact as Array<Record<string, unknown>>)[0].Telephone =
            L('60-12345678');
        }),
      ),
    ).toEqual([
      finding(
        'parties.phone',
        'Invoice/AccountingSupplierParty/Party/Contact/Telephone',
        'Telephone contains characters other than digits and a leading +.',
        { lhdnCode: 'CF410' },
      ),
    ]);
  });
});

describe('parties.address-line', () => {
  it('accepts address lines of at most 150 characters', () => {
    expect(
      check(
        doc((inv) => {
          (
            partyOf(inv, 'AccountingSupplierParty').PostalAddress as Array<Record<string, unknown>>
          )[0].AddressLine = [{ Line: L('A'.repeat(150)) }];
        }),
      ),
    ).toEqual([]);
  });

  it('errors with CF345 for supplier and CF346 for buyer when a line exceeds 150 characters', () => {
    expect(
      check(
        doc((inv) => {
          (
            partyOf(inv, 'AccountingSupplierParty').PostalAddress as Array<Record<string, unknown>>
          )[0].AddressLine = [{ Line: L('A'.repeat(151)) }];
        }),
      ),
    ).toEqual([
      finding(
        'parties.address-line',
        'Invoice/AccountingSupplierParty/Party/PostalAddress/AddressLine[0]/Line',
        'Line exceeds maximum length of 150.',
        { lhdnCode: 'CF345' },
      ),
    ]);
    expect(
      check(
        doc((inv) => {
          (
            partyOf(inv, 'AccountingCustomerParty').PostalAddress as Array<Record<string, unknown>>
          )[0].AddressLine = [{ Line: L('B'.repeat(151)) }];
        }),
      ),
    ).toEqual([
      finding(
        'parties.address-line',
        'Invoice/AccountingCustomerParty/Party/PostalAddress/AddressLine[0]/Line',
        'Line exceeds maximum length of 150.',
        { lhdnCode: 'CF346' },
      ),
    ]);
  });
});

describe('parties.city', () => {
  it('accepts CityName of at most 50 characters', () => {
    expect(
      check(
        doc((inv) => {
          (
            partyOf(inv, 'AccountingSupplierParty').PostalAddress as Array<Record<string, unknown>>
          )[0].CityName = L('A'.repeat(50));
        }),
      ),
    ).toEqual([]);
  });

  it('errors when CityName exceeds 50 characters', () => {
    expect(
      check(
        doc((inv) => {
          (
            partyOf(inv, 'AccountingSupplierParty').PostalAddress as Array<Record<string, unknown>>
          )[0].CityName = L('A'.repeat(51));
        }),
      ),
    ).toEqual([
      finding(
        'parties.city',
        'Invoice/AccountingSupplierParty/Party/PostalAddress/CityName',
        'CityName exceeds maximum length of 50.',
        { lhdnCode: 'CF404' },
      ),
    ]);
  });
});

describe('parties.postcode', () => {
  it('accepts 1-5 digit MYS PostalZone and foreign PostalZone up to 50 characters', () => {
    expect(
      check(
        doc((inv) => {
          (
            partyOf(inv, 'AccountingSupplierParty').PostalAddress as Array<Record<string, unknown>>
          )[0].PostalZone = L('1');
        }),
      ),
    ).toEqual([]);
    expect(
      check(
        doc((inv) => {
          const addr = (
            partyOf(inv, 'AccountingCustomerParty').PostalAddress as Array<Record<string, unknown>>
          )[0];
          addr.Country = [{ IdentificationCode: L('SGP') }];
          addr.PostalZone = L('A'.repeat(50));
        }),
      ),
    ).toEqual([]);
  });

  it('accepts PostalZone NA for MYS when CountrySubentityCode is 17 (consolidated) and rejects NA otherwise', () => {
    expect(
      check(
        doc((inv) => {
          const addr = (
            partyOf(inv, 'AccountingCustomerParty').PostalAddress as Array<Record<string, unknown>>
          )[0];
          addr.CountrySubentityCode = L('17');
          addr.PostalZone = L('NA');
        }),
      ),
    ).toEqual([]);
    expect(
      check(
        doc((inv) => {
          const addr = (
            partyOf(inv, 'AccountingCustomerParty').PostalAddress as Array<Record<string, unknown>>
          )[0];
          addr.CountrySubentityCode = L('14');
          addr.PostalZone = L('NA');
        }),
      ),
    ).toEqual([
      finding(
        'parties.postcode',
        'Invoice/AccountingCustomerParty/Party/PostalAddress/PostalZone',
        'PostalZone must be 1-5 digits.',
        { lhdnCode: 'CF405' },
      ),
    ]);
  });

  it('errors when PostalZone is invalid', () => {
    expect(
      check(
        doc((inv) => {
          (
            partyOf(inv, 'AccountingSupplierParty').PostalAddress as Array<Record<string, unknown>>
          )[0].PostalZone = L('123456');
        }),
      ),
    ).toEqual([
      finding(
        'parties.postcode',
        'Invoice/AccountingSupplierParty/Party/PostalAddress/PostalZone',
        'PostalZone must be 1-5 digits.',
        { lhdnCode: 'CF405' },
      ),
    ]);
    expect(
      check(
        doc((inv) => {
          const addr = (
            partyOf(inv, 'AccountingCustomerParty').PostalAddress as Array<Record<string, unknown>>
          )[0];
          addr.Country = [{ IdentificationCode: L('SGP') }];
          addr.PostalZone = L('A'.repeat(51));
        }),
      ),
    ).toEqual([
      finding(
        'parties.postcode',
        'Invoice/AccountingCustomerParty/Party/PostalAddress/PostalZone',
        'PostalZone exceeds maximum length of 50.',
        { lhdnCode: 'CF405' },
      ),
    ]);
  });
});

function gtFinding(
  lhdnCode: string,
  path: string,
  message: string,
  severity: 'error' | 'warning' = 'error',
): Finding {
  return finding('parties.general-tin', path, message, { severity, docUrl: TAXPAYER, lhdnCode });
}

const SUPPLIER_TIN = 'Invoice/AccountingSupplierParty/Party/PartyIdentification[TIN]';
const BUYER_TIN = 'Invoice/AccountingCustomerParty/Party/PartyIdentification[TIN]';

describe('parties.general-tin', () => {
  describe('ERR208/ERR211', () => {
    it('errors ERR208 when supplier TIN is 020 and the buyer is not consolidated', () => {
      expect(
        check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TIN', 'EI00000000020'))),
      ).toEqual([
        gtFinding('ERR208', SUPPLIER_TIN, 'ERR208: General TIN 020 is for buyers only.'),
      ]);
    });

    it('errors ERR211 when supplier TIN is 020 on a consolidated invoice (buyer TIN 010)', () => {
      expect(
        check(
          doc((inv) => {
            setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TIN', 'EI00000000020');
            const buyer = partyOf(inv, 'AccountingCustomerParty');
            setIdent(buyer, 'TIN', 'EI00000000010');
            removeIdent(buyer, 'NRIC');
            setIdent(buyer, 'BRN', 'NA');
            setLines(inv, ['004']);
          }),
        ),
      ).toEqual([
        gtFinding(
          'ERR211',
          SUPPLIER_TIN,
          'ERR211: General TIN 020 is for buyers only and cannot be used on a consolidated invoice.',
        ),
      ]);
    });

    it('does not flag supplier TIN other than 020', () => {
      expect(check(doc())).toEqual([]);
      expect(
        check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TIN', 'EI00000000030'))),
      ).toEqual([]);
    });
  });

  describe('ERR229', () => {
    it('errors when buyer TIN is 030', () => {
      expect(
        check(
          doc((inv) => {
            const buyer = partyOf(inv, 'AccountingCustomerParty');
            setIdent(buyer, 'TIN', 'EI00000000030');
            removeIdent(buyer, 'NRIC');
            setIdent(buyer, 'PASSPORT', 'A12345678');
          }),
        ),
      ).toEqual([
        gtFinding('ERR229', BUYER_TIN, 'ERR229: General TIN 030 is for foreign suppliers only.'),
      ]);
    });

    it('does not flag buyer TIN 020', () => {
      expect(
        check(
          doc((inv) => {
            const buyer = partyOf(inv, 'AccountingCustomerParty');
            setIdent(buyer, 'TIN', 'EI00000000020');
            removeIdent(buyer, 'NRIC');
            setIdent(buyer, 'BRN', 'NA');
          }),
        ),
      ).toEqual([]);
    });
  });

  describe('ERR222', () => {
    it('errors when a General TIN other than 010 is combined with NRIC or ARMY', () => {
      expect(
        check(
          doc((inv) => {
            const buyer = partyOf(inv, 'AccountingCustomerParty');
            setIdent(buyer, 'TIN', 'EI00000000020');
          }),
        ),
      ).toEqual([
        gtFinding(
          'ERR222',
          BUYER_TIN,
          'ERR222: Only General TIN 010 is allowed with NRIC or ARMY identification.',
        ),
      ]);
      expect(
        check(
          doc((inv) => {
            const buyer = partyOf(inv, 'AccountingCustomerParty');
            setIdent(buyer, 'TIN', 'EI00000000040');
            removeIdent(buyer, 'NRIC');
            setIdent(buyer, 'ARMY', '123456789012');
            setIdent(buyer, 'BRN', 'NA');
          }),
        ),
      ).toEqual([
        gtFinding(
          'ERR222',
          BUYER_TIN,
          'ERR222: Only General TIN 010 is allowed with NRIC or ARMY identification.',
        ),
      ]);
    });

    it('does not flag TIN 020 with NRIC value NA', () => {
      expect(
        check(
          doc((inv) => {
            const buyer = partyOf(inv, 'AccountingCustomerParty');
            setIdent(buyer, 'TIN', 'EI00000000020');
            setIdent(buyer, 'NRIC', 'NA');
          }),
        ),
      ).toEqual([]);
    });

    it('does not flag General TIN 010 with NRIC, or another General TIN with BRN only', () => {
      expect(
        check(
          doc((inv) => {
            const buyer = partyOf(inv, 'AccountingCustomerParty');
            setIdent(buyer, 'TIN', 'EI00000000010');
            setLines(inv, ['004']);
          }),
        ),
      ).toEqual([]);
      expect(
        check(
          doc((inv) => {
            const buyer = partyOf(inv, 'AccountingCustomerParty');
            setIdent(buyer, 'TIN', 'EI00000000020');
            removeIdent(buyer, 'NRIC');
            setIdent(buyer, 'BRN', 'NA');
          }),
        ),
      ).toEqual([]);
    });
  });

  describe('ERR255', () => {
    it('errors when TIN is 040 and BRN is an actual value', () => {
      expect(
        check(doc((inv) => setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TIN', 'EI00000000040'))),
      ).toEqual([
        gtFinding('ERR255', SUPPLIER_TIN, 'ERR255: General TIN 040 requires BRN value NA.'),
      ]);
    });

    it('does not flag TIN 040 when BRN is NA (any case) or missing', () => {
      expect(
        check(
          doc((inv) => {
            const supplier = partyOf(inv, 'AccountingSupplierParty');
            setIdent(supplier, 'TIN', 'EI00000000040');
            setIdent(supplier, 'BRN', 'NA');
          }),
        ),
      ).toEqual([]);
      expect(
        check(
          doc((inv) => {
            const supplier = partyOf(inv, 'AccountingSupplierParty');
            setIdent(supplier, 'TIN', 'EI00000000040');
            setIdent(supplier, 'BRN', 'na');
          }),
        ),
      ).toEqual([]);
      expect(
        check(
          doc((inv) => {
            const supplier = partyOf(inv, 'AccountingSupplierParty');
            setIdent(supplier, 'TIN', 'EI00000000040');
            removeIdent(supplier, 'BRN');
            setIdent(supplier, 'PASSPORT', 'A12345678');
          }),
        ),
      ).toEqual([]);
    });
  });

  describe('ERR237', () => {
    it('errors when buyer TIN is 010 and BRN is an actual value', () => {
      expect(
        check(
          doc((inv) => {
            const buyer = partyOf(inv, 'AccountingCustomerParty');
            setIdent(buyer, 'TIN', 'EI00000000010');
            removeIdent(buyer, 'NRIC');
            setIdent(buyer, 'BRN', '201901234567');
          }),
        ),
      ).toEqual([
        gtFinding(
          'ERR237',
          BUYER_TIN,
          'ERR237: Buyer TIN EI00000000010 cannot be used with an actual BRN.',
        ),
      ]);
    });

    it('does not flag buyer TIN 010 when BRN is NA or missing', () => {
      expect(
        check(
          doc((inv) => {
            const buyer = partyOf(inv, 'AccountingCustomerParty');
            setIdent(buyer, 'TIN', 'EI00000000010');
            removeIdent(buyer, 'NRIC');
            setIdent(buyer, 'BRN', 'NA');
            setLines(inv, ['004']);
          }),
        ),
      ).toEqual([]);
      expect(
        check(
          doc((inv) => {
            const buyer = partyOf(inv, 'AccountingCustomerParty');
            setIdent(buyer, 'TIN', 'EI00000000010');
            setLines(inv, ['004']);
          }),
        ),
      ).toEqual([]);
    });
  });

  describe('ERR217', () => {
    it('errors when supplier TIN is 010 and BRN is an actual value', () => {
      expect(
        check(
          doc((inv) => {
            setIdent(partyOf(inv, 'AccountingSupplierParty'), 'TIN', 'EI00000000010');
            setLines(inv, ['004']);
          }),
        ),
      ).toEqual([
        gtFinding(
          'ERR217',
          SUPPLIER_TIN,
          'ERR217: Supplier TIN EI00000000010 cannot be used with an actual BRN.',
        ),
      ]);
    });

    it('does not flag supplier TIN 010 when BRN is NA', () => {
      expect(
        check(
          doc((inv) => {
            const supplier = partyOf(inv, 'AccountingSupplierParty');
            setIdent(supplier, 'TIN', 'EI00000000010');
            setIdent(supplier, 'BRN', 'NA');
            setLines(inv, ['004']);
          }),
        ),
      ).toEqual([]);
    });
  });

  describe('ERR236', () => {
    it('errors when TIN is 010, BRN or NRIC is NA, and a CLASS code is not 004', () => {
      expect(
        check(
          doc((inv) => {
            const buyer = partyOf(inv, 'AccountingCustomerParty');
            setIdent(buyer, 'TIN', 'EI00000000010');
            removeIdent(buyer, 'NRIC');
            setIdent(buyer, 'BRN', 'NA');
            setLines(inv, ['022']);
          }),
        ),
      ).toEqual([
        gtFinding(
          'ERR236',
          BUYER_TIN,
          'ERR236: General TIN 010 with BRN or NRIC value NA is only allowed when every CLASS classification code is 004.',
        ),
      ]);
      expect(
        check(
          doc((inv) => {
            const buyer = partyOf(inv, 'AccountingCustomerParty');
            setIdent(buyer, 'TIN', 'EI00000000010');
            setIdent(buyer, 'NRIC', 'na');
            setLines(inv, ['001', '004']);
          }),
        ),
      ).toEqual([
        gtFinding(
          'ERR236',
          BUYER_TIN,
          'ERR236: General TIN 010 with BRN or NRIC value NA is only allowed when every CLASS classification code is 004.',
        ),
      ]);
    });

    it('does not flag TIN 010 with BRN NA when every CLASS code is 004', () => {
      expect(
        check(
          doc((inv) => {
            const buyer = partyOf(inv, 'AccountingCustomerParty');
            setIdent(buyer, 'TIN', 'EI00000000010');
            removeIdent(buyer, 'NRIC');
            setIdent(buyer, 'BRN', 'NA');
            setLines(inv, ['004', '004']);
          }),
        ),
      ).toEqual([]);
    });
  });

  describe('ERR213', () => {
    it('warns when supplier TIN is 010 and supplier country is not MYS', () => {
      expect(
        check(
          doc((inv) => {
            const supplier = partyOf(inv, 'AccountingSupplierParty');
            setIdent(supplier, 'TIN', 'EI00000000010');
            setIdent(supplier, 'BRN', 'NA');
            setCountry(supplier, 'USA');
            setLines(inv, ['004']);
          }),
        ),
      ).toEqual([
        gtFinding(
          'ERR213',
          SUPPLIER_TIN,
          'ERR213: General TIN 010 is not applicable for a foreign supplier (inferred from supplier postal address country code not being MYS).',
          'warning',
        ),
      ]);
    });

    it('does not warn when supplier TIN is 010 and supplier country is MYS', () => {
      expect(
        check(
          doc((inv) => {
            const supplier = partyOf(inv, 'AccountingSupplierParty');
            setIdent(supplier, 'TIN', 'EI00000000010');
            setIdent(supplier, 'BRN', 'NA');
            setLines(inv, ['004']);
          }),
        ),
      ).toEqual([]);
    });
  });

  describe('ERR220', () => {
    it('warns on a self-billed document when supplier country is not MYS and supplier TIN is a General TIN other than 030', () => {
      expect(
        check(
          doc((inv) => {
            inv.InvoiceTypeCode = [{ _: '11', listVersionID: '1.1' }];
            const supplier = partyOf(inv, 'AccountingSupplierParty');
            setIdent(supplier, 'TIN', 'EI00000000040');
            setIdent(supplier, 'BRN', 'NA');
            setCountry(supplier, 'USA');
          }),
        ),
      ).toEqual([
        gtFinding(
          'ERR220',
          SUPPLIER_TIN,
          'ERR220: Only General TIN 030 is allowed for a foreign supplier on a self-billed document (inferred from supplier postal address country code not being MYS).',
          'warning',
        ),
      ]);
    });

    it('warns on a self-billed refund note (type 14) when supplier country is not MYS and supplier TIN is a General TIN other than 030', () => {
      expect(
        check(
          doc((inv) => {
            inv.InvoiceTypeCode = [{ _: '14', listVersionID: '1.1' }];
            const supplier = partyOf(inv, 'AccountingSupplierParty');
            setIdent(supplier, 'TIN', 'EI00000000040');
            setIdent(supplier, 'BRN', 'NA');
            setCountry(supplier, 'USA');
          }),
        ),
      ).toEqual([
        gtFinding(
          'ERR220',
          SUPPLIER_TIN,
          'ERR220: Only General TIN 030 is allowed for a foreign supplier on a self-billed document (inferred from supplier postal address country code not being MYS).',
          'warning',
        ),
      ]);
    });

    it('does not warn when a self-billed foreign supplier uses General TIN 030', () => {
      expect(
        check(
          doc((inv) => {
            inv.InvoiceTypeCode = [{ _: '11', listVersionID: '1.1' }];
            const supplier = partyOf(inv, 'AccountingSupplierParty');
            setIdent(supplier, 'TIN', 'EI00000000030');
            setIdent(supplier, 'BRN', 'NA');
            setCountry(supplier, 'USA');
          }),
        ),
      ).toEqual([]);
    });

    it('does not warn when a self-billed foreign supplier uses a non-general TIN', () => {
      expect(
        check(
          doc((inv) => {
            inv.InvoiceTypeCode = [{ _: '11', listVersionID: '1.1' }];
            const supplier = partyOf(inv, 'AccountingSupplierParty');
            setCountry(supplier, 'USA');
          }),
        ),
      ).toEqual([]);
    });
  });
});
