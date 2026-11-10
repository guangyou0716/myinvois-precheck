import { hasCode, type CodeTable } from './codes.js';
import { CODE } from './docs.js';
import type { Finding } from './types.js';
import { attr, children, first, text } from './ubl.js';

const STATE_01_16 = new Set([
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function indexed(parent: string, name: string, index: number, total: number): string {
  return total > 1 ? `${parent}/${name}[${index}]` : `${parent}/${name}`;
}

function currencyIdOf(node: Record<string, unknown>): string | undefined {
  const value = node.currencyID;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (typeof value === 'number') return String(value);
  return undefined;
}

function notInTable(label: string, value: string, table: CodeTable): string {
  return `${label} "${value}" is not in ${table}.`;
}

function invalidCode(
  findings: Finding[],
  rule: string,
  path: string,
  message: string,
  lhdnCode = 'CV302',
  severity: Finding['severity'] = 'error',
): void {
  findings.push({ rule, severity, path, message, lhdnCode, docUrl: CODE });
}

function checkTable(
  findings: Finding[],
  value: string | undefined,
  table: CodeTable,
  rule: string,
  path: string,
  label: string,
): void {
  if (value === undefined) return;
  if (hasCode(table, value)) return;
  invalidCode(findings, rule, path, notInTable(label, value, table));
}

function walkCurrencyIds(node: unknown, path: string, findings: Finding[]): void {
  if (!isRecord(node)) return;
  const currencyID = currencyIdOf(node);
  if (currencyID !== undefined && !hasCode('CurrencyCodes', currencyID)) {
    invalidCode(
      findings,
      'codes.currency',
      path,
      notInTable('currencyID', currencyID, 'CurrencyCodes'),
    );
  }
  for (const [key, value] of Object.entries(node)) {
    if (!Array.isArray(value)) continue;
    for (let i = 0; i < value.length; i++) {
      const child = value[i];
      if (!isRecord(child)) continue;
      walkCurrencyIds(child, indexed(path, key, i, value.length), findings);
    }
  }
}

function checkState(
  findings: Finding[],
  state: string | undefined,
  country: string | undefined,
  path: string,
): void {
  if (state === undefined) return;
  if (country === 'MYS') {
    if (!hasCode('StateCodes', state)) {
      invalidCode(findings, 'codes.state', path, notInTable('CountrySubentityCode', state, 'StateCodes'));
      return;
    }
    if (state === '17') {
      invalidCode(
        findings,
        'codes.state',
        path,
        'State Code 17 should be used for Consolidated e-Invoice and non-Malaysian address only',
        'CV317',
        'warning',
      );
    }
    return;
  }
  if (STATE_01_16.has(state)) {
    invalidCode(
      findings,
      'codes.state',
      path,
      `CountrySubentityCode "${state}" is a Malaysian state code and cannot be used when country is not MYS.`,
      'CV316',
    );
  }
}

function checkAddress(findings: Finding[], party: unknown, basePath: string): void {
  const address = first(party, 'PostalAddress');
  const country = text(address, 'Country', 'IdentificationCode');
  checkTable(
    findings,
    country,
    'CountryCodes',
    'codes.country',
    `${basePath}/PostalAddress/Country/IdentificationCode`,
    'IdentificationCode',
  );
  checkState(
    findings,
    text(address, 'CountrySubentityCode'),
    country,
    `${basePath}/PostalAddress/CountrySubentityCode`,
  );
}

function checkTaxCategories(findings: Finding[], parent: unknown, parentPath: string): void {
  const totals = children(parent, 'TaxTotal');
  for (let ti = 0; ti < totals.length; ti++) {
    const totalPath = indexed(parentPath, 'TaxTotal', ti, totals.length);
    const subtotals = children(totals[ti], 'TaxSubtotal');
    for (let si = 0; si < subtotals.length; si++) {
      const subPath = indexed(totalPath, 'TaxSubtotal', si, subtotals.length);
      checkTable(
        findings,
        text(subtotals[si], 'TaxCategory', 'ID'),
        'TaxTypes',
        'codes.tax-type',
        `${subPath}/TaxCategory/ID`,
        'TaxCategory/ID',
      );
    }
  }
}

function checkLine(findings: Finding[], line: unknown, basePath: string): void {
  const unitCode = attr(line, 'unitCode', 'InvoicedQuantity');
  const trimmedUnit = typeof unitCode === 'string' ? unitCode.trim() : unitCode;
  checkTable(
    findings,
    trimmedUnit === '' ? undefined : trimmedUnit,
    'UnitTypes',
    'codes.unit',
    `${basePath}/InvoicedQuantity/unitCode`,
    'unitCode',
  );

  checkTable(
    findings,
    text(line, 'Item', 'OriginCountry', 'IdentificationCode'),
    'CountryCodes',
    'codes.country',
    `${basePath}/Item/OriginCountry/IdentificationCode`,
    'IdentificationCode',
  );

  const classifications = children(first(line, 'Item'), 'CommodityClassification');
  for (let i = 0; i < classifications.length; i++) {
    const node = classifications[i];
    if (attr(node, 'listID', 'ItemClassificationCode') !== 'CLASS') continue;
    const classPath = `${indexed(basePath + '/Item', 'CommodityClassification', i, classifications.length)}/ItemClassificationCode[CLASS]`;
    checkTable(
      findings,
      text(node, 'ItemClassificationCode'),
      'ClassificationCodes',
      'codes.classification',
      classPath,
      'ItemClassificationCode',
    );
  }

  checkTaxCategories(findings, line, basePath);
}

export function check(doc: unknown): Finding[] {
  const invoice = first(doc, 'Invoice');
  if (!isRecord(invoice)) return [];

  const findings: Finding[] = [];

  checkTable(
    findings,
    text(invoice, 'InvoiceTypeCode'),
    'EInvoiceTypes',
    'codes.invoice-type',
    'Invoice/InvoiceTypeCode',
    'InvoiceTypeCode',
  );

  checkTable(
    findings,
    text(invoice, 'DocumentCurrencyCode'),
    'CurrencyCodes',
    'codes.currency',
    'Invoice/DocumentCurrencyCode',
    'DocumentCurrencyCode',
  );
  checkTable(
    findings,
    text(invoice, 'TaxCurrencyCode'),
    'CurrencyCodes',
    'codes.currency',
    'Invoice/TaxCurrencyCode',
    'TaxCurrencyCode',
  );
  walkCurrencyIds(invoice, 'Invoice', findings);

  const supplier = first(invoice, 'AccountingSupplierParty', 'Party');
  checkTable(
    findings,
    text(supplier, 'IndustryClassificationCode'),
    'MSICSubCategoryCodes',
    'codes.msic',
    'Invoice/AccountingSupplierParty/Party/IndustryClassificationCode',
    'IndustryClassificationCode',
  );
  checkAddress(findings, supplier, 'Invoice/AccountingSupplierParty/Party');
  checkAddress(
    findings,
    first(invoice, 'AccountingCustomerParty', 'Party'),
    'Invoice/AccountingCustomerParty/Party',
  );

  const deliveries = children(invoice, 'Delivery');
  for (let i = 0; i < deliveries.length; i++) {
    checkAddress(
      findings,
      first(deliveries[i], 'DeliveryParty'),
      `${indexed('Invoice', 'Delivery', i, deliveries.length)}/DeliveryParty`,
    );
  }

  const payments = children(invoice, 'PaymentMeans');
  for (let i = 0; i < payments.length; i++) {
    checkTable(
      findings,
      text(payments[i], 'PaymentMeansCode'),
      'PaymentMethods',
      'codes.payment-method',
      `${indexed('Invoice', 'PaymentMeans', i, payments.length)}/PaymentMeansCode`,
      'PaymentMeansCode',
    );
  }

  checkTaxCategories(findings, invoice, 'Invoice');

  const lines = children(invoice, 'InvoiceLine');
  for (let i = 0; i < lines.length; i++) {
    checkLine(findings, lines[i], indexed('Invoice', 'InvoiceLine', i, lines.length));
  }

  return findings;
}
