import { documentUrl, STRUCTURE } from './docs.js';
import type { Finding } from './types.js';
import { attr, children, first, text } from './ubl.js';

const INVOICE_URN = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';

const SVDP_LIMIT = 'versions 1.2/1.3 (SVDP) are not supported yet';

const SUPPORTED_TYPES = new Set(['01', '02', '03', '04']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function markerPresent(doc: Record<string, unknown>, key: string): boolean {
  const value = doc[key];
  return typeof value === 'string' && value.trim() !== '';
}

function namespaceFinding(doc: Record<string, unknown>): Finding | undefined {
  const problems: string[] = [];
  if (doc._D !== INVOICE_URN) problems.push(`_D must be ${INVOICE_URN}`);
  if (!markerPresent(doc, '_A')) problems.push('_A is missing');
  if (!markerPresent(doc, '_B')) problems.push('_B is missing');
  if (problems.length === 0) return undefined;

  const path = doc._D !== INVOICE_URN ? '_D' : !markerPresent(doc, '_A') ? '_A' : '_B';
  return {
    rule: 'structure.namespace',
    severity: 'warning',
    path,
    message: `Top-level UBL namespaces are incomplete: ${problems.join('; ')}.`,
    docUrl: STRUCTURE,
  };
}

export function check(doc: unknown): Finding[] {
  const findings: Finding[] = [];

  if (!isRecord(doc)) {
    findings.push({
      rule: 'structure.root',
      severity: 'error',
      path: 'Invoice',
      message:
        'Document must be a JSON object with a non-empty Invoice array (Invoice[0] must be an object).',
      docUrl: STRUCTURE,
    });
    return findings;
  }

  const namespace = namespaceFinding(doc);
  const invoice = first(doc, 'Invoice');
  if (!isRecord(invoice)) {
    findings.push({
      rule: 'structure.root',
      severity: 'error',
      path: 'Invoice',
      message: 'Invoice[0] must be an object in a non-empty Invoice array.',
      docUrl: STRUCTURE,
    });
    if (namespace) findings.push(namespace);
    return findings;
  }

  if (namespace) findings.push(namespace);

  const typeCode = text(invoice, 'InvoiceTypeCode');
  const listVersionID = attr(invoice, 'listVersionID', 'InvoiceTypeCode')?.trim();
  const docUrl = documentUrl(typeCode, listVersionID);

  if (typeCode === undefined) {
    findings.push({
      rule: 'structure.type-code',
      severity: 'error',
      path: 'Invoice/InvoiceTypeCode',
      message: 'InvoiceTypeCode is missing.',
      docUrl,
    });
  } else if (!SUPPORTED_TYPES.has(typeCode)) {
    findings.push({
      rule: 'structure.type-code',
      severity: 'error',
      path: 'Invoice/InvoiceTypeCode',
      message: `InvoiceTypeCode "${typeCode}" is not supported; only Invoice (01), Credit Note (02), Debit Note (03), and Refund Note (04) are supported (self-billed types 11-14 not yet).`,
      docUrl,
    });
  }

  if (listVersionID !== '1.0' && listVersionID !== '1.1') {
    const detail =
      listVersionID === undefined
        ? 'InvoiceTypeCode listVersionID is missing'
        : `InvoiceTypeCode listVersionID "${listVersionID}" is not supported`;
    findings.push({
      rule: 'structure.version',
      severity: 'error',
      path: 'Invoice/InvoiceTypeCode/listVersionID',
      message: `${detail}; ${SVDP_LIMIT}.`,
      docUrl,
    });
  }

  // Presence only. v1.1 makes Issuer's Digital Signature mandatory; it is not verified.
  if (listVersionID === '1.1') {
    if (children(invoice, 'Signature').length === 0) {
      findings.push({
        rule: 'structure.signature',
        severity: 'error',
        path: 'Invoice/Signature',
        message: "Signature is missing. Version 1.1 Issuer's Digital Signature is Mandatory [1-1].",
        docUrl,
      });
    }
    if (children(invoice, 'UBLExtensions').length === 0) {
      findings.push({
        rule: 'structure.signature',
        severity: 'error',
        path: 'Invoice/UBLExtensions',
        message:
          "UBLExtensions is missing. Version 1.1 Issuer's Digital Signature is Mandatory [1-1].",
        docUrl,
      });
    }
  }

  return findings;
}
