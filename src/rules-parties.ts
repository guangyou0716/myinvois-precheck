import { CORE_FIELDS, FAQ, TAXPAYER } from './docs.js';
import type { Finding } from './types.js';
import { attr, children, first, text } from './ubl.js';

const NON_INDIVIDUAL_TIN_PREFIXES = ['C', 'CS', 'D', 'F', 'FA', 'PT', 'TA', 'TC', 'TN', 'TR', 'TP', 'J', 'LE'].sort(
  (a, b) => b.length - a.length,
);

const TIN_010 = 'EI00000000010';
const TIN_020 = 'EI00000000020';
const TIN_030 = 'EI00000000030';
const TIN_040 = 'EI00000000040';
const GENERAL_TIN = /^EI\d{11}$/;
const SELF_BILLED_TYPES = new Set(['11', '12', '13', '14']);
const RULE_GENERAL_TIN = 'parties.general-tin';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function push(
  findings: Finding[],
  rule: string,
  severity: Finding['severity'],
  path: string,
  message: string,
  docUrl: string,
  lhdnCode?: string,
): void {
  const finding: Finding = { rule, severity, path, message, docUrl };
  if (lhdnCode !== undefined) finding.lhdnCode = lhdnCode;
  findings.push(finding);
}

function tinFormatOk(tin: string): boolean {
  if (/^IG\d+$/.test(tin)) return true;
  // TODO: general TIN values come from the LHDN e-Invoice Specific Guideline, not the SDK
  if (/^EI\d{11}$/.test(tin)) return true;
  for (const prefix of NON_INDIVIDUAL_TIN_PREFIXES) {
    if (tin.startsWith(prefix)) {
      return /^[1-9]\d*0$/.test(tin.slice(prefix.length));
    }
  }
  return false;
}

function sstOk(value: string): boolean {
  if (value === 'NA') return true;
  if (value.length > 35) return false;
  const parts = value.split(';');
  if (parts.length > 2) return false;
  return parts.every((part) => part.length > 0 && /^[A-Za-z0-9-]+$/.test(part));
}

function emailFormatOk(value: string): boolean {
  if (value.includes(' ')) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return local.length > 0 && domain.length > 0 && domain.includes('.');
}

function checkIdentifications(findings: Finding[], party: unknown, basePath: string): void {
  for (const ident of children(party, 'PartyIdentification')) {
    const scheme = attr(ident, 'schemeID', 'ID');
    const value = text(ident, 'ID');
    if (scheme === undefined || value === undefined) continue;
    const path = `${basePath}/PartyIdentification[${scheme}]`;

    if (scheme === 'TIN') {
      if (value.length > 14) {
        push(
          findings,
          'parties.tin-length',
          'error',
          path,
          'TIN exceeds maximum length of 14.',
          CORE_FIELDS,
        );
      }
      if (!tinFormatOk(value)) {
        push(
          findings,
          'parties.tin-format',
          'warning',
          path,
          'TIN does not match the LHDN FAQ format.',
          FAQ,
        );
      }
      continue;
    }

    if (scheme === 'NRIC' || scheme === 'PASSPORT' || scheme === 'ARMY' || scheme === 'BRN') {
      const max = scheme === 'BRN' ? 20 : 12;
      const naAllowed = (scheme === 'BRN' || scheme === 'NRIC') && value === 'NA';
      if (!naAllowed && value.length > max) {
        push(
          findings,
          'parties.id-length',
          'error',
          path,
          `${scheme} exceeds maximum length of ${max}.`,
          CORE_FIELDS,
        );
      }
      continue;
    }

    if (scheme === 'SST' && !sstOk(value)) {
      push(
        findings,
        'parties.sst',
        'error',
        path,
        'SST registration number is invalid.',
        CORE_FIELDS,
        'CF406',
      );
      continue;
    }

    if (scheme === 'TTX' && value !== 'NA') {
      const charsetOk = /^[A-Za-z0-9-]+$/.test(value);
      if (!charsetOk || value.length > 17) {
        const overLength = value.length > 17;
        push(
          findings,
          'parties.ttx',
          'error',
          path,
          'Tourism tax registration number is invalid.',
          CORE_FIELDS,
          overLength ? 'CF412' : 'CF407',
        );
      }
    }
  }
}

function checkEmail(findings: Finding[], value: string, path: string): void {
  const tooLong = value.length > 320;
  const badFormat = !emailFormatOk(value);
  if (!tooLong && !badFormat) return;
  if (tooLong && badFormat) {
    push(
      findings,
      'parties.email',
      'error',
      path,
      'ElectronicMail exceeds maximum length of 320 and format is invalid.',
      CORE_FIELDS,
      'CF411',
    );
    return;
  }
  if (tooLong) {
    push(
      findings,
      'parties.email',
      'error',
      path,
      'ElectronicMail exceeds maximum length of 320.',
      CORE_FIELDS,
      'CF400',
    );
    return;
  }
  push(
    findings,
    'parties.email',
    'error',
    path,
    'ElectronicMail format is invalid.',
    CORE_FIELDS,
    'CF401',
  );
}

function checkPhone(findings: Finding[], value: string, path: string, allowNA: boolean): void {
  if (allowNA && value === 'NA') return;
  if (value.length < 8) {
    push(
      findings,
      'parties.phone',
      'error',
      path,
      'Telephone is shorter than 8 characters.',
      CORE_FIELDS,
      'CF408',
    );
  } else if (value.length > 20) {
    push(
      findings,
      'parties.phone',
      'error',
      path,
      'Telephone exceeds maximum length of 20.',
      CORE_FIELDS,
      'CF409',
    );
  }
  if (!/^\+?\d+$/.test(value)) {
    push(
      findings,
      'parties.phone',
      'error',
      path,
      'Telephone contains characters other than digits and a leading +.',
      CORE_FIELDS,
      'CF410',
    );
  }
}

function checkAddress(findings: Finding[], party: unknown, basePath: string, supplier: boolean): void {
  const address = first(party, 'PostalAddress');
  const lines = children(address, 'AddressLine');
  for (const [i, lineNode] of lines.entries()) {
    const line = text(lineNode, 'Line');
    if (line !== undefined && line.length > 150) {
      push(
        findings,
        'parties.address-line',
        'error',
        `${basePath}/PostalAddress/AddressLine[${i}]/Line`,
        'Line exceeds maximum length of 150.',
        CORE_FIELDS,
        supplier ? 'CF345' : 'CF346',
      );
    }
  }

  const city = text(address, 'CityName');
  if (city !== undefined && city.length > 50) {
    push(
      findings,
      'parties.city',
      'error',
      `${basePath}/PostalAddress/CityName`,
      'CityName exceeds maximum length of 50.',
      CORE_FIELDS,
      'CF404',
    );
  }

  const zone = text(address, 'PostalZone');
  if (zone !== undefined) {
    const country = text(address, 'Country', 'IdentificationCode');
    const mys = country === 'MYS';
    const state = text(address, 'CountrySubentityCode');
    // inv11.txt line 761: address line may be "NA"; other fields except state may be NA.
    // inv11.txt line 801: consolidated submission uses State code 17 (Not Applicable).
    const consolidatedNa = zone === 'NA' && state === '17';
    const ok = consolidatedNa || (mys ? /^\d{1,5}$/.test(zone) : zone.length <= 50);
    if (!ok) {
      push(
        findings,
        'parties.postcode',
        'error',
        `${basePath}/PostalAddress/PostalZone`,
        mys ? 'PostalZone must be 1-5 digits.' : 'PostalZone exceeds maximum length of 50.',
        CORE_FIELDS,
        'CF405',
      );
    }
  }
}

function checkParty(findings: Finding[], party: unknown, basePath: string, supplier: boolean): void {
  if (!isRecord(party)) return;
  checkIdentifications(findings, party, basePath);

  const email = text(party, 'Contact', 'ElectronicMail');
  if (email !== undefined) {
    checkEmail(findings, email, `${basePath}/Contact/ElectronicMail`);
  }

  const phone = text(party, 'Contact', 'Telephone');
  if (phone !== undefined) {
    checkPhone(findings, phone, `${basePath}/Contact/Telephone`, !supplier);
  }

  checkAddress(findings, party, basePath, supplier);
}

function partyTin(party: unknown): string | undefined {
  for (const ident of children(party, 'PartyIdentification')) {
    if (attr(ident, 'schemeID', 'ID') === 'TIN') return text(ident, 'ID');
  }
  return undefined;
}

function partyId(party: unknown, scheme: string): string | undefined {
  for (const ident of children(party, 'PartyIdentification')) {
    if (attr(ident, 'schemeID', 'ID') === scheme) return text(ident, 'ID');
  }
  return undefined;
}

function isNaId(value: string | undefined): boolean {
  return value !== undefined && value.trim().toUpperCase() === 'NA';
}

function isActualId(value: string | undefined): boolean {
  if (value === undefined) return false;
  const trimmed = value.trim();
  return trimmed !== '' && trimmed.toUpperCase() !== 'NA';
}

function isGeneralTin(tin: string | undefined): tin is string {
  return tin !== undefined && GENERAL_TIN.test(tin);
}

function isForeignCountry(country: string | undefined): boolean {
  return country !== undefined && country !== 'MYS';
}

function hasNon004Class(invoice: unknown): boolean {
  for (const line of children(invoice, 'InvoiceLine')) {
    const classifications = children(first(line, 'Item'), 'CommodityClassification');
    for (const node of classifications) {
      if (attr(node, 'listID', 'ItemClassificationCode') !== 'CLASS') continue;
      const code = text(node, 'ItemClassificationCode');
      if (code !== undefined && code !== '004') return true;
    }
  }
  return false;
}

function generalTinFinding(
  findings: Finding[],
  lhdnCode: string,
  path: string,
  message: string,
  severity: Finding['severity'] = 'error',
): void {
  push(findings, RULE_GENERAL_TIN, severity, path, message, TAXPAYER, lhdnCode);
}

function checkGeneralTin(findings: Finding[], invoice: Record<string, unknown>): void {
  const supplier = first(invoice, 'AccountingSupplierParty', 'Party');
  const buyer = first(invoice, 'AccountingCustomerParty', 'Party');
  const supplierPath = 'Invoice/AccountingSupplierParty/Party/PartyIdentification[TIN]';
  const buyerPath = 'Invoice/AccountingCustomerParty/Party/PartyIdentification[TIN]';
  const supplierTin = partyTin(supplier);
  const buyerTin = partyTin(buyer);
  const typeCode = text(invoice, 'InvoiceTypeCode');
  const selfBilled = typeCode !== undefined && SELF_BILLED_TYPES.has(typeCode);
  const supplierCountry = text(supplier, 'PostalAddress', 'Country', 'IdentificationCode');
  const supplierForeign = isForeignCountry(supplierCountry);
  const non004 = hasNon004Class(invoice);

  if (supplierTin === TIN_020) {
    if (buyerTin === TIN_010) {
      generalTinFinding(
        findings,
        'ERR211',
        supplierPath,
        'ERR211: General TIN 020 is for buyers only and cannot be used on a consolidated invoice.',
      );
    } else {
      generalTinFinding(
        findings,
        'ERR208',
        supplierPath,
        'ERR208: General TIN 020 is for buyers only.',
      );
    }
  }

  if (buyerTin === TIN_030) {
    generalTinFinding(
      findings,
      'ERR229',
      buyerPath,
      'ERR229: General TIN 030 is for foreign suppliers only.',
    );
  }

  checkGeneralTinParty(findings, supplier, supplierPath, supplierTin, non004);
  checkGeneralTinParty(findings, buyer, buyerPath, buyerTin, non004);

  if (buyerTin === TIN_010 && isActualId(partyId(buyer, 'BRN'))) {
    generalTinFinding(
      findings,
      'ERR237',
      buyerPath,
      'ERR237: Buyer TIN EI00000000010 cannot be used with an actual BRN.',
    );
  }

  if (supplierTin === TIN_010 && isActualId(partyId(supplier, 'BRN'))) {
    generalTinFinding(
      findings,
      'ERR217',
      supplierPath,
      'ERR217: Supplier TIN EI00000000010 cannot be used with an actual BRN.',
    );
  }

  if (supplierTin === TIN_010 && supplierForeign) {
    generalTinFinding(
      findings,
      'ERR213',
      supplierPath,
      'ERR213: General TIN 010 is not applicable for a foreign supplier (inferred from supplier postal address country code not being MYS).',
      'warning',
    );
  }

  if (selfBilled && supplierForeign && isGeneralTin(supplierTin) && supplierTin !== TIN_030) {
    generalTinFinding(
      findings,
      'ERR220',
      supplierPath,
      'ERR220: Only General TIN 030 is allowed for a foreign supplier on a self-billed document (inferred from supplier postal address country code not being MYS).',
      'warning',
    );
  }
}

function checkGeneralTinParty(
  findings: Finding[],
  party: unknown,
  path: string,
  tin: string | undefined,
  non004: boolean,
): void {
  if (!isGeneralTin(tin)) return;

  if (tin !== TIN_010 && (isActualId(partyId(party, 'NRIC')) || isActualId(partyId(party, 'ARMY')))) {
    generalTinFinding(
      findings,
      'ERR222',
      path,
      'ERR222: Only General TIN 010 is allowed with NRIC or ARMY identification.',
    );
  }

  if (tin === TIN_040 && isActualId(partyId(party, 'BRN'))) {
    generalTinFinding(
      findings,
      'ERR255',
      path,
      'ERR255: General TIN 040 requires BRN value NA.',
    );
  }

  if (tin === TIN_010 && non004 && (isNaId(partyId(party, 'BRN')) || isNaId(partyId(party, 'NRIC')))) {
    generalTinFinding(
      findings,
      'ERR236',
      path,
      'ERR236: General TIN 010 with BRN or NRIC value NA is only allowed when every CLASS classification code is 004.',
    );
  }
}

export function check(doc: unknown): Finding[] {
  const invoice = first(doc, 'Invoice');
  if (!isRecord(invoice)) return [];

  const findings: Finding[] = [];
  checkParty(
    findings,
    first(invoice, 'AccountingSupplierParty', 'Party'),
    'Invoice/AccountingSupplierParty/Party',
    true,
  );
  checkParty(
    findings,
    first(invoice, 'AccountingCustomerParty', 'Party'),
    'Invoice/AccountingCustomerParty/Party',
    false,
  );
  checkGeneralTin(findings, invoice);
  return findings;
}
