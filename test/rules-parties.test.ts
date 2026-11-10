import { describe, expect, it } from 'vitest';
import { CORE_FIELDS, FAQ } from '../src/docs.js';
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
