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
export const CREDIT_V1_0 = 'https://sdk.myinvois.hasil.gov.my/documents/credit-v1-0/';
export const CREDIT_V1_1 = 'https://sdk.myinvois.hasil.gov.my/documents/credit-v1-1/';
export const DEBIT_V1_0 = 'https://sdk.myinvois.hasil.gov.my/documents/debit-v1-0/';
export const DEBIT_V1_1 = 'https://sdk.myinvois.hasil.gov.my/documents/debit-v1-1/';
export const REFUND_V1_0 = 'https://sdk.myinvois.hasil.gov.my/documents/refund-v1-0/';
export const REFUND_V1_1 = 'https://sdk.myinvois.hasil.gov.my/documents/refund-v1-1/';
export const SELF_BILLED_INVOICE_V1_0 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-invoice-v1-0/';
export const SELF_BILLED_INVOICE_V1_1 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-invoice-v1-1/';
export const SELF_BILLED_CREDIT_V1_0 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-credit-v1-0/';
export const SELF_BILLED_CREDIT_V1_1 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-credit-v1-1/';
export const SELF_BILLED_DEBIT_V1_0 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-debit-v1-0/';
export const SELF_BILLED_DEBIT_V1_1 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-debit-v1-1/';
export const SELF_BILLED_REFUND_V1_0 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-refund-v1-0/';
export const SELF_BILLED_REFUND_V1_1 =
  'https://sdk.myinvois.hasil.gov.my/documents/self-billed-refund-v1-1/';
export const MATH = 'https://sdk.myinvois.hasil.gov.my/mathematical-mappings/';
export const CODES = 'https://sdk.myinvois.hasil.gov.my/codes/';
export const FAQ = 'https://sdk.myinvois.hasil.gov.my/faq/';

const INVOICE_PAGES = { v10: INVOICE_V1_0, v11: INVOICE_V1_1 };

const DATA_STRUCTURE_PAGES: Record<string, { v10: string; v11: string }> = {
  '01': INVOICE_PAGES,
  '02': { v10: CREDIT_V1_0, v11: CREDIT_V1_1 },
  '03': { v10: DEBIT_V1_0, v11: DEBIT_V1_1 },
  '04': { v10: REFUND_V1_0, v11: REFUND_V1_1 },
  '11': { v10: SELF_BILLED_INVOICE_V1_0, v11: SELF_BILLED_INVOICE_V1_1 },
  '12': { v10: SELF_BILLED_CREDIT_V1_0, v11: SELF_BILLED_CREDIT_V1_1 },
  '13': { v10: SELF_BILLED_DEBIT_V1_0, v11: SELF_BILLED_DEBIT_V1_1 },
  '14': { v10: SELF_BILLED_REFUND_V1_0, v11: SELF_BILLED_REFUND_V1_1 },
};

/** Data-structure page for this document type and version. Unknown types fall back to Invoice; unknown versions cite v1.1. */
export function documentUrl(
  typeCode: string | undefined,
  listVersionID: string | undefined,
): string {
  const pages =
    (typeCode !== undefined ? DATA_STRUCTURE_PAGES[typeCode] : undefined) ?? INVOICE_PAGES;
  return listVersionID === '1.0' ? pages.v10 : pages.v11;
}
