import { documentUrl, STRUCTURE } from './docs.js';
import type { Finding } from './types.js';
import { attr, children, first, text } from './ubl.js';

const INVOICE_URN = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';

const SUPPORTED_TYPES = new Set(['01', '02', '03', '04', '11', '12', '13', '14']);

const SUPPORTED_VERSIONS = new Set(['1.0', '1.1', '1.2', '1.3']);

/** v1.3 is maintained as v1.1 (digital signature); v1.2 is maintained as v1.0 (none). */
const SIGNATURE_REQUIRED_VERSIONS = new Set(['1.1', '1.3']);

const SVDP_VERSIONS = new Set(['1.2', '1.3']);

const SUPPORTED_TYPE_LIST =
  'Invoice (01), Credit Note (02), Debit Note (03), Refund Note (04), Self-billed Invoice (11), Self-billed Credit Note (12), Self-billed Debit Note (13), and Self-billed Refund Note (14)';

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

function attributePath(path: string, key: string): string {
  return path === '' ? key : `${path}@${key}`;
}

function childPath(path: string, key: string): string {
  return path === '' ? key : `${path}/${key}`;
}

/** UBL JSON attributes are string-valued keys other than `_`; child elements are arrays. */
function walkAttributeWhitespace(node: unknown, path: string, findings: Finding[]): void {
  if (!isRecord(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (key === '_') continue;
    if (typeof value === 'string') {
      if (value !== value.trim()) {
        findings.push({
          rule: 'structure.attribute-whitespace',
          severity: 'warning',
          path: attributePath(path, key),
          message:
            'Attribute value has surrounding whitespace that MyInvois may reject; it was checked as the trimmed value.',
          docUrl: STRUCTURE,
        });
      }
    } else if (Array.isArray(value)) {
      const next = childPath(path, key);
      for (const child of value) {
        walkAttributeWhitespace(child, next, findings);
      }
    }
  }
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
  } else {
    if (namespace) findings.push(namespace);

    const typeCode = text(invoice, 'InvoiceTypeCode');
    const listVersionID = attr(invoice, 'listVersionID', 'InvoiceTypeCode');
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
        message: `InvoiceTypeCode "${typeCode}" is not supported; only ${SUPPORTED_TYPE_LIST} are supported.`,
        docUrl,
      });
    }

    if (listVersionID === undefined || !SUPPORTED_VERSIONS.has(listVersionID)) {
      const detail =
        listVersionID === undefined
          ? 'InvoiceTypeCode listVersionID is missing'
          : `InvoiceTypeCode listVersionID "${listVersionID}" is not supported`;
      findings.push({
        rule: 'structure.version',
        severity: 'error',
        path: 'Invoice/InvoiceTypeCode/listVersionID',
        message: `${detail}.`,
        docUrl,
      });
    }

    // Presence only. v1.1 and v1.3 make Issuer's Digital Signature mandatory; it is not verified.
    if (listVersionID !== undefined && SIGNATURE_REQUIRED_VERSIONS.has(listVersionID)) {
      if (children(invoice, 'Signature').length === 0) {
        findings.push({
          rule: 'structure.signature',
          severity: 'error',
          path: 'Invoice/Signature',
          message: `Signature is missing. Version ${listVersionID} Issuer's Digital Signature is Mandatory [1-1].`,
          docUrl,
        });
      }
      if (children(invoice, 'UBLExtensions').length === 0) {
        findings.push({
          rule: 'structure.signature',
          severity: 'error',
          path: 'Invoice/UBLExtensions',
          message: `UBLExtensions is missing. Version ${listVersionID} Issuer's Digital Signature is Mandatory [1-1].`,
          docUrl,
        });
      }
    }

    if (listVersionID !== undefined && SVDP_VERSIONS.has(listVersionID)) {
      findings.push({
        rule: 'structure.svdp-version',
        severity: 'warning',
        path: 'Invoice/InvoiceTypeCode/listVersionID',
        message: `Document version ${listVersionID} is only for the e-Invoice Voluntary Disclosure (VD) Programme (SVDP) until 31 December 2027. Normal submissions should use 1.0 or 1.1.`,
        docUrl,
      });
    }
  }

  walkAttributeWhitespace(doc, '', findings);
  return findings;
}
