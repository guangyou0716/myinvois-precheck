import { CORE_FIELDS, FAQ } from './docs.js';
import type { Finding } from './types.js';
import { attr, children, first, text } from './ubl.js';

const NON_INDIVIDUAL_TIN_PREFIXES = ['C', 'CS', 'D', 'F', 'FA', 'PT', 'TA', 'TC', 'TN', 'TR', 'TP', 'J', 'LE'].sort(
  (a, b) => b.length - a.length,
);

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
    const ok = mys ? /^\d{1,5}$/.test(zone) : zone.length <= 50;
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
  return findings;
}
