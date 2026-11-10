import { documentUrl } from './docs.js';
import type { Finding } from './types.js';
import { attr, children, first, text } from './ubl.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})?$/;

const AMOUNT_KEYS = new Set([
  'Amount',
  'PaidAmount',
  'PayableAmount',
  'PayableRoundingAmount',
  'PrepaidAmount',
  'PriceAmount',
  'TaxAmount',
  'TaxableAmount',
  'LineExtensionAmount',
  'TaxExclusiveAmount',
  'TaxInclusiveAmount',
  'AllowanceTotalAmount',
  'ChargeTotalAmount',
]);

const INDEXED = new Set([
  'InvoiceLine',
  'TaxSubtotal',
  'AllowanceCharge',
  'AddressLine',
  'CommodityClassification',
  'PartyIdentification',
  'PrepaidPayment',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const NOTE_TYPES = new Set(['02', '03', '04', '12', '13', '14']);
const ORIGINAL_REF_MAX = 26;

function countDigits(value: unknown): number {
  const s = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  let n = 0;
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') n += 1;
  }
  return n;
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

function requireValue(
  findings: Finding[],
  value: string | undefined,
  path: string,
  label: string,
  docUrl: string,
  options: { maxLength?: number; lhdnCode?: string; missingMessage?: string } = {},
): string | undefined {
  if (value === undefined || value === '') {
    push(
      findings,
      'required.missing',
      'error',
      path,
      options.missingMessage ?? `${label} is missing.`,
      docUrl,
      options.lhdnCode,
    );
    return undefined;
  }
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    push(
      findings,
      'required.max-length',
      'error',
      path,
      `${label} exceeds maximum length of ${options.maxLength}.`,
      docUrl,
    );
  }
  return value;
}

function isRegScheme(scheme: string | undefined): boolean {
  return scheme === 'NRIC' || scheme === 'BRN' || scheme === 'PASSPORT' || scheme === 'ARMY';
}

function checkParty(
  findings: Finding[],
  party: unknown,
  basePath: string,
  docUrl: string,
  supplier: boolean,
): void {
  requireValue(
    findings,
    text(party, 'PartyLegalEntity', 'RegistrationName'),
    `${basePath}/PartyLegalEntity/RegistrationName`,
    'RegistrationName',
    docUrl,
    { maxLength: 300 },
  );

  const idents = children(party, 'PartyIdentification');
  let hasTin = false;
  let hasReg = false;
  for (const ident of idents) {
    const scheme = attr(ident, 'schemeID', 'ID');
    const idVal = text(ident, 'ID');
    const present = idVal !== undefined && idVal !== '';
    if (scheme === 'TIN' && present) hasTin = true;
    if (isRegScheme(scheme) && present) hasReg = true;
  }
  if (!hasTin) {
    requireValue(
      findings,
      undefined,
      `${basePath}/PartyIdentification[TIN]`,
      'PartyIdentification with schemeID TIN',
      docUrl,
    );
  }
  if (!hasReg) {
    requireValue(
      findings,
      undefined,
      `${basePath}/PartyIdentification`,
      'PartyIdentification with schemeID NRIC, BRN, PASSPORT, or ARMY',
      docUrl,
    );
  }

  const address = first(party, 'PostalAddress');
  requireValue(
    findings,
    text(address, 'AddressLine', 'Line'),
    `${basePath}/PostalAddress/AddressLine[0]/Line`,
    'Line',
    docUrl,
  );
  requireValue(
    findings,
    text(address, 'CityName'),
    `${basePath}/PostalAddress/CityName`,
    'CityName',
    docUrl,
  );
  requireValue(
    findings,
    text(address, 'CountrySubentityCode'),
    `${basePath}/PostalAddress/CountrySubentityCode`,
    'CountrySubentityCode',
    docUrl,
  );
  requireValue(
    findings,
    text(address, 'Country', 'IdentificationCode'),
    `${basePath}/PostalAddress/Country/IdentificationCode`,
    'IdentificationCode',
    docUrl,
  );
  requireValue(
    findings,
    text(party, 'Contact', 'Telephone'),
    `${basePath}/Contact/Telephone`,
    'Telephone',
    docUrl,
  );

  if (supplier) {
    requireValue(
      findings,
      text(party, 'IndustryClassificationCode'),
      `${basePath}/IndustryClassificationCode`,
      'IndustryClassificationCode',
      docUrl,
    );
    const msicName = attr(party, 'name', 'IndustryClassificationCode');
    const trimmedName = typeof msicName === 'string' ? msicName.trim() : msicName;
    requireValue(
      findings,
      trimmedName === '' ? undefined : trimmedName,
      `${basePath}/IndustryClassificationCode/name`,
      'IndustryClassificationCode name',
      docUrl,
      { maxLength: 300 },
    );
  }
}

function checkExemption(
  findings: Finding[],
  subtotal: unknown,
  subPath: string,
  docUrl: string,
): void {
  if (text(subtotal, 'TaxCategory', 'ID') !== 'E') return;
  const reason = text(subtotal, 'TaxCategory', 'TaxExemptionReason');
  const path = `${subPath}/TaxCategory/TaxExemptionReason`;
  if (reason === undefined || reason === '') {
    push(
      findings,
      'required.exemption-reason',
      'warning',
      path,
      'Mandatory if tax exemption is applicable',
      docUrl,
    );
  } else if (reason.length > 300) {
    push(
      findings,
      'required.exemption-reason',
      'error',
      path,
      'TaxExemptionReason exceeds maximum length of 300.',
      docUrl,
    );
  }
}

function checkTaxTotals(
  findings: Finding[],
  parent: unknown,
  parentPath: string,
  docUrl: string,
  requireSubtotalAmount: boolean,
): void {
  const totals = children(parent, 'TaxTotal');
  if (totals.length === 0) {
    requireValue(
      findings,
      undefined,
      `${parentPath}/TaxTotal/TaxAmount`,
      'TaxAmount',
      docUrl,
    );
    requireValue(
      findings,
      undefined,
      `${parentPath}/TaxTotal/TaxSubtotal`,
      'TaxSubtotal',
      docUrl,
    );
    return;
  }

  for (const [ti, total] of totals.entries()) {
    const totalPath = totals.length > 1 ? `${parentPath}/TaxTotal[${ti}]` : `${parentPath}/TaxTotal`;
    requireValue(findings, text(total, 'TaxAmount'), `${totalPath}/TaxAmount`, 'TaxAmount', docUrl);

    const subtotals = children(total, 'TaxSubtotal');
    if (subtotals.length === 0) {
      requireValue(findings, undefined, `${totalPath}/TaxSubtotal`, 'TaxSubtotal', docUrl);
      continue;
    }

    for (const [si, sub] of subtotals.entries()) {
      const subPath = `${totalPath}/TaxSubtotal[${si}]`;
      if (requireSubtotalAmount) {
        requireValue(findings, text(sub, 'TaxAmount'), `${subPath}/TaxAmount`, 'TaxAmount', docUrl);
      }
      requireValue(
        findings,
        text(sub, 'TaxCategory', 'ID'),
        `${subPath}/TaxCategory/ID`,
        'ID',
        docUrl,
      );
      checkExemption(findings, sub, subPath, docUrl);
    }
  }
}

function checkLine(
  findings: Finding[],
  line: unknown,
  basePath: string,
  docUrl: string,
): void {
  requireValue(findings, text(line, 'ID'), `${basePath}/ID`, 'ID', docUrl);
  requireValue(
    findings,
    text(line, 'Item', 'Description'),
    `${basePath}/Item/Description`,
    'Description',
    docUrl,
    { maxLength: 300 },
  );

  const classifications = children(first(line, 'Item'), 'CommodityClassification');
  const hasClass = classifications.some((c) => {
    const code = text(c, 'ItemClassificationCode');
    return (
      attr(c, 'listID', 'ItemClassificationCode') === 'CLASS' &&
      code !== undefined &&
      code !== ''
    );
  });
  if (!hasClass) {
    requireValue(
      findings,
      undefined,
      `${basePath}/Item/CommodityClassification/ItemClassificationCode[CLASS]`,
      'ItemClassificationCode with listID CLASS',
      docUrl,
    );
  }

  requireValue(
    findings,
    text(line, 'Price', 'PriceAmount'),
    `${basePath}/Price/PriceAmount`,
    'PriceAmount',
    docUrl,
  );
  requireValue(
    findings,
    text(line, 'ItemPriceExtension', 'Amount'),
    `${basePath}/ItemPriceExtension/Amount`,
    'Amount',
    docUrl,
  );
  requireValue(
    findings,
    text(line, 'LineExtensionAmount'),
    `${basePath}/LineExtensionAmount`,
    'LineExtensionAmount',
    docUrl,
  );
  checkTaxTotals(findings, line, basePath, docUrl, false);
}

function checkOriginalReference(
  findings: Finding[],
  invoice: unknown,
  typeCode: string | undefined,
  docUrl: string,
): void {
  if (typeCode === undefined || !NOTE_TYPES.has(typeCode)) return;

  const billings = children(invoice, 'BillingReference');
  const targets: Array<{
    billingIndex: number;
    refIndex: number;
    ref: unknown;
    refCount: number;
  }> = [];
  for (const [bi, billing] of billings.entries()) {
    const refs = children(billing, 'InvoiceDocumentReference');
    for (const [ri, ref] of refs.entries()) {
      targets.push({ billingIndex: bi, refIndex: ri, ref, refCount: refs.length });
    }
  }

  if (targets.length === 0) {
    push(
      findings,
      'required.original-reference',
      'warning',
      'Invoice/BillingReference/InvoiceDocumentReference',
      'Original e-Invoice reference is expected for credit, debit, and refund notes.',
      docUrl,
    );
    return;
  }

  for (const target of targets) {
    const billingPath =
      billings.length > 1
        ? `Invoice/BillingReference[${target.billingIndex}]`
        : 'Invoice/BillingReference';
    const refPath =
      target.refCount > 1
        ? `${billingPath}/InvoiceDocumentReference[${target.refIndex}]`
        : `${billingPath}/InvoiceDocumentReference`;

    const uuid = text(target.ref, 'UUID');
    const id = text(target.ref, 'ID');

    if (uuid === undefined || uuid === '') {
      push(
        findings,
        'required.original-reference',
        'error',
        `${refPath}/UUID`,
        'UUID is missing. Original e-Invoice reference UUID and ID are both required.',
        docUrl,
      );
    } else if (uuid.length > ORIGINAL_REF_MAX) {
      push(
        findings,
        'required.original-reference',
        'error',
        `${refPath}/UUID`,
        `UUID exceeds maximum length of ${ORIGINAL_REF_MAX}.`,
        docUrl,
      );
    }

    if (id === undefined || id === '') {
      push(
        findings,
        'required.original-reference',
        'error',
        `${refPath}/ID`,
        'ID is missing. Original e-Invoice reference UUID and ID are both required.',
        docUrl,
      );
    } else if (id.length > ORIGINAL_REF_MAX) {
      push(
        findings,
        'required.original-reference',
        'error',
        `${refPath}/ID`,
        `ID exceeds maximum length of ${ORIGINAL_REF_MAX}.`,
        docUrl,
      );
    }
  }
}

function walkAmounts(node: unknown, path: string, findings: Finding[], docUrl: string): void {
  if (!isRecord(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (!Array.isArray(value)) continue;
    const indexed = INDEXED.has(key);
    value.forEach((child, i) => {
      const childPath = indexed ? `${path}/${key}[${i}]` : `${path}/${key}`;
      if (AMOUNT_KEYS.has(key) && isRecord(child) && child._ !== undefined && child._ !== null && child._ !== '') {
        if (countDigits(child._) > 26) {
          push(
            findings,
            'required.amount-length',
            'error',
            childPath,
            `${key} has more than 26 digits.`,
            docUrl,
          );
        }
      }
      walkAmounts(child, childPath, findings, docUrl);
    });
  }
}

export function check(doc: unknown): Finding[] {
  const invoice = first(doc, 'Invoice');
  if (!isRecord(invoice)) return [];

  const findings: Finding[] = [];
  const typeCode = text(invoice, 'InvoiceTypeCode');
  const docUrl = documentUrl(typeCode, attr(invoice, 'listVersionID', 'InvoiceTypeCode'));

  requireValue(findings, text(invoice, 'ID'), 'Invoice/ID', 'ID', docUrl, { maxLength: 50 });

  const issueDate = requireValue(
    findings,
    text(invoice, 'IssueDate'),
    'Invoice/IssueDate',
    'IssueDate',
    docUrl,
  );
  if (issueDate !== undefined && !DATE_RE.test(issueDate)) {
    push(findings, 'required.format', 'error', 'Invoice/IssueDate', 'IssueDate must be YYYY-MM-DD.', docUrl);
  }

  const issueTime = requireValue(
    findings,
    text(invoice, 'IssueTime'),
    'Invoice/IssueTime',
    'IssueTime',
    docUrl,
    { missingMessage: 'IssueTime is missing. LHDN expects UTC.' },
  );
  if (issueTime !== undefined && !TIME_RE.test(issueTime)) {
    push(
      findings,
      'required.format',
      'error',
      'Invoice/IssueTime',
      'IssueTime must be HH:MM:SS with optional Z or ±HH:MM. LHDN expects UTC.',
      docUrl,
    );
  }

  requireValue(
    findings,
    text(invoice, 'DocumentCurrencyCode'),
    'Invoice/DocumentCurrencyCode',
    'DocumentCurrencyCode',
    docUrl,
    { lhdnCode: 'CF378' },
  );

  checkOriginalReference(findings, invoice, typeCode, docUrl);

  const supplier = first(invoice, 'AccountingSupplierParty');
  if (!isRecord(supplier)) {
    requireValue(
      findings,
      undefined,
      'Invoice/AccountingSupplierParty',
      'AccountingSupplierParty',
      docUrl,
    );
  } else {
    checkParty(
      findings,
      first(supplier, 'Party'),
      'Invoice/AccountingSupplierParty/Party',
      docUrl,
      true,
    );
  }

  const buyer = first(invoice, 'AccountingCustomerParty');
  if (!isRecord(buyer)) {
    requireValue(
      findings,
      undefined,
      'Invoice/AccountingCustomerParty',
      'AccountingCustomerParty',
      docUrl,
    );
  } else {
    checkParty(
      findings,
      first(buyer, 'Party'),
      'Invoice/AccountingCustomerParty/Party',
      docUrl,
      false,
    );
  }

  checkTaxTotals(findings, invoice, 'Invoice', docUrl, true);

  const monetary = first(invoice, 'LegalMonetaryTotal');
  requireValue(
    findings,
    text(monetary, 'TaxExclusiveAmount'),
    'Invoice/LegalMonetaryTotal/TaxExclusiveAmount',
    'TaxExclusiveAmount',
    docUrl,
  );
  requireValue(
    findings,
    text(monetary, 'TaxInclusiveAmount'),
    'Invoice/LegalMonetaryTotal/TaxInclusiveAmount',
    'TaxInclusiveAmount',
    docUrl,
  );
  requireValue(
    findings,
    text(monetary, 'PayableAmount'),
    'Invoice/LegalMonetaryTotal/PayableAmount',
    'PayableAmount',
    docUrl,
  );

  const lines = children(invoice, 'InvoiceLine');
  if (lines.length === 0) {
    requireValue(findings, undefined, 'Invoice/InvoiceLine', 'InvoiceLine', docUrl);
  } else {
    lines.forEach((line, i) => checkLine(findings, line, `Invoice/InvoiceLine[${i}]`, docUrl));
  }

  walkAmounts(invoice, 'Invoice', findings, docUrl);
  return findings;
}
