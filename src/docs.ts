export const STRUCTURE =
  'https://sdk.myinvois.hasil.gov.my/documentvalidationrules/structure-validator-error/';
export const CORE_FIELDS =
  'https://sdk.myinvois.hasil.gov.my/documentvalidationrules/core-fields-validator-error/';
export const CODE =
  'https://sdk.myinvois.hasil.gov.my/documentvalidationrules/code-validator-error/';
export const CURRENCY =
  'https://sdk.myinvois.hasil.gov.my/documentvalidationrules/currency-validator-error/';
export const TAXPAYER =
  'https://sdk.myinvois.hasil.gov.my/documentvalidationrules/taxpayer-validator-error/';
export const INVOICE_V1_0 = 'https://sdk.myinvois.hasil.gov.my/documents/invoice-v1-0/';
export const INVOICE_V1_1 = 'https://sdk.myinvois.hasil.gov.my/documents/invoice-v1-1/';
export const INVOICE_V1_2 = 'https://sdk.myinvois.hasil.gov.my/documents/invoice-v1-2/';
export const INVOICE_V1_3 = 'https://sdk.myinvois.hasil.gov.my/documents/invoice-v1-3/';
export const CREDIT_V1_0 = 'https://sdk.myinvois.hasil.gov.my/documents/credit-v1-0/';
export const CREDIT_V1_1 = 'https://sdk.myinvois.hasil.gov.my/documents/credit-v1-1/';
export const CREDIT_V1_2 = 'https://sdk.myinvois.hasil.gov.my/documents/credit-v1-2/';
export const CREDIT_V1_3 = 'https://sdk.myinvois.hasil.gov.my/documents/credit-v1-3/';
export const DEBIT_V1_0 = 'https://sdk.myinvois.hasil.gov.my/documents/debit-v1-0/';
export const DEBIT_V1_1 = 'https://sdk.myinvois.hasil.gov.my/documents/debit-v1-1/';
export const DEBIT_V1_2 = 'https://sdk.myinvois.hasil.gov.my/documents/debit-v1-2/';
export const DEBIT_V1_3 = 'https://sdk.myinvois.hasil.gov.my/documents/debit-v1-3/';
export const REFUND_V1_0 = 'https://sdk.myinvois.hasil.gov.my/documents/refund-v1-0/';
export const REFUND_V1_1 = 'https://sdk.myinvois.hasil.gov.my/documents/refund-v1-1/';
export const REFUND_V1_2 = 'https://sdk.myinvois.hasil.gov.my/documents/refund-v1-2/';
export const REFUND_V1_3 = 'https://sdk.myinvois.hasil.gov.my/documents/refund-v1-3/';
export const SELF_BILLED_INVOICE_V1_0 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-invoice-v1-0/';
export const SELF_BILLED_INVOICE_V1_1 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-invoice-v1-1/';
export const SELF_BILLED_INVOICE_V1_2 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-invoice-v1-2/';
export const SELF_BILLED_INVOICE_V1_3 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-invoice-v1-3/';
export const SELF_BILLED_CREDIT_V1_0 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-credit-v1-0/';
export const SELF_BILLED_CREDIT_V1_1 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-credit-v1-1/';
export const SELF_BILLED_CREDIT_V1_2 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-credit-v1-2/';
export const SELF_BILLED_CREDIT_V1_3 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-credit-v1-3/';
export const SELF_BILLED_DEBIT_V1_0 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-debit-v1-0/';
export const SELF_BILLED_DEBIT_V1_1 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-debit-v1-1/';
export const SELF_BILLED_DEBIT_V1_2 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-debit-v1-2/';
export const SELF_BILLED_DEBIT_V1_3 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-debit-v1-3/';
export const SELF_BILLED_REFUND_V1_0 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-refund-v1-0/';
export const SELF_BILLED_REFUND_V1_1 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-refund-v1-1/';
export const SELF_BILLED_REFUND_V1_2 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-refund-v1-2/';
export const SELF_BILLED_REFUND_V1_3 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-refund-v1-3/';
export const MATH = 'https://sdk.myinvois.hasil.gov.my/mathematical-mappings/';
export const CODES = 'https://sdk.myinvois.hasil.gov.my/codes/';
export const FAQ = 'https://sdk.myinvois.hasil.gov.my/faq/';

type VersionPages = { v10: string; v11: string; v12: string; v13: string };

const INVOICE_PAGES: VersionPages = {
  v10: INVOICE_V1_0,
  v11: INVOICE_V1_1,
  v12: INVOICE_V1_2,
  v13: INVOICE_V1_3,
};

const DATA_STRUCTURE_PAGES: Record<string, VersionPages> = {
  '01': INVOICE_PAGES,
  '02': { v10: CREDIT_V1_0, v11: CREDIT_V1_1, v12: CREDIT_V1_2, v13: CREDIT_V1_3 },
  '03': { v10: DEBIT_V1_0, v11: DEBIT_V1_1, v12: DEBIT_V1_2, v13: DEBIT_V1_3 },
  '04': { v10: REFUND_V1_0, v11: REFUND_V1_1, v12: REFUND_V1_2, v13: REFUND_V1_3 },
  '11': {
    v10: SELF_BILLED_INVOICE_V1_0,
    v11: SELF_BILLED_INVOICE_V1_1,
    v12: SELF_BILLED_INVOICE_V1_2,
    v13: SELF_BILLED_INVOICE_V1_3,
  },
  '12': {
    v10: SELF_BILLED_CREDIT_V1_0,
    v11: SELF_BILLED_CREDIT_V1_1,
    v12: SELF_BILLED_CREDIT_V1_2,
    v13: SELF_BILLED_CREDIT_V1_3,
  },
  '13': {
    v10: SELF_BILLED_DEBIT_V1_0,
    v11: SELF_BILLED_DEBIT_V1_1,
    v12: SELF_BILLED_DEBIT_V1_2,
    v13: SELF_BILLED_DEBIT_V1_3,
  },
  '14': {
    v10: SELF_BILLED_REFUND_V1_0,
    v11: SELF_BILLED_REFUND_V1_1,
    v12: SELF_BILLED_REFUND_V1_2,
    v13: SELF_BILLED_REFUND_V1_3,
  },
};

/** Data-structure page for this document type and version. Unknown types fall back to Invoice; unknown versions cite v1.1. */
export function documentUrl(
  typeCode: string | undefined,
  listVersionID: string | undefined,
): string {
  const pages =
    (typeCode !== undefined ? DATA_STRUCTURE_PAGES[typeCode] : undefined) ?? INVOICE_PAGES;
  if (listVersionID === '1.0') return pages.v10;
  if (listVersionID === '1.2') return pages.v12;
  if (listVersionID === '1.3') return pages.v13;
  return pages.v11;
}
