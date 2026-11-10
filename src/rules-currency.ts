import { CURRENCY, INVOICE_V1_0, INVOICE_V1_1 } from './docs.js';
import type { Finding } from './types.js';
import { attr, first, num, text } from './ubl.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invoiceDocUrl(invoice: unknown): string {
  return attr(invoice, 'listVersionID', 'InvoiceTypeCode') === '1.0' ? INVOICE_V1_0 : INVOICE_V1_1;
}

function currencyIdOf(node: Record<string, unknown>): string | undefined {
  const value = node.currencyID;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function isTaxAmountPath(path: string): boolean {
  return /\/Tax(?:Total|Subtotal)(?:\[\d+\])?\/TaxAmount$/.test(path);
}

function checkAmountCurrency(
  node: Record<string, unknown>,
  path: string,
  docCurrency: string | undefined,
  taxCurrency: string | undefined,
  findings: Finding[],
): void {
  const currencyID = currencyIdOf(node);

  if (isTaxAmountPath(path) && taxCurrency !== undefined) {
    if (currencyID === taxCurrency) return;
    findings.push({
      rule: 'currency.tax-amount-currency',
      severity: 'error',
      path,
      message: `currencyID "${currencyID ?? ''}" must equal TaxCurrencyCode "${taxCurrency}"`,
      lhdnCode: 'DC501',
      docUrl: CURRENCY,
    });
    return;
  }

  if (currencyID !== undefined && currencyID === docCurrency) return;
  findings.push({
    rule: 'currency.amount-currency',
    severity: 'error',
    path,
    message: `currencyID "${currencyID ?? ''}" must equal DocumentCurrencyCode "${docCurrency ?? ''}"`,
    lhdnCode: 'DC502',
    docUrl: CURRENCY,
  });
}

function walkAmounts(
  node: unknown,
  path: string,
  docCurrency: string | undefined,
  taxCurrency: string | undefined,
  findings: Finding[],
): void {
  if (!isRecord(node)) return;
  if ('currencyID' in node) {
    checkAmountCurrency(node, path, docCurrency, taxCurrency, findings);
  }
  for (const [key, value] of Object.entries(node)) {
    if (!Array.isArray(value)) continue;
    const useIndex = value.length > 1;
    for (let i = 0; i < value.length; i++) {
      const child = value[i];
      if (!isRecord(child)) continue;
      const childPath = useIndex ? `${path}/${key}[${i}]` : `${path}/${key}`;
      walkAmounts(child, childPath, docCurrency, taxCurrency, findings);
    }
  }
}

export function check(doc: unknown): Finding[] {
  const invoice = first(doc, 'Invoice');
  if (!isRecord(invoice)) return [];

  const findings: Finding[] = [];
  const docCurrency = text(invoice, 'DocumentCurrencyCode');
  const taxCurrency = text(invoice, 'TaxCurrencyCode');

  if (docCurrency) {
    walkAmounts(invoice, 'Invoice', docCurrency, taxCurrency, findings);
  }

  if (taxCurrency !== undefined && taxCurrency !== docCurrency && taxCurrency !== 'MYR') {
    findings.push({
      rule: 'currency.tax-currency',
      severity: 'error',
      path: 'Invoice/TaxCurrencyCode',
      message: `TaxCurrencyCode "${taxCurrency}" must equal DocumentCurrencyCode "${docCurrency ?? ''}" or "MYR"`,
      lhdnCode: 'DC512',
      docUrl: CURRENCY,
    });
  }

  const sourceCurrency = text(invoice, 'TaxExchangeRate', 'SourceCurrencyCode');
  if (docCurrency && sourceCurrency !== undefined && sourceCurrency !== docCurrency) {
    findings.push({
      rule: 'currency.source-currency',
      severity: 'error',
      path: 'Invoice/TaxExchangeRate/SourceCurrencyCode',
      message: `SourceCurrencyCode "${sourceCurrency}" must equal DocumentCurrencyCode "${docCurrency ?? ''}"`,
      lhdnCode: 'DC510',
      docUrl: CURRENCY,
    });
  }

  if (docCurrency && docCurrency !== 'MYR') {
    const rate = num(invoice, 'TaxExchangeRate', 'CalculationRate');
    if (rate === undefined || rate <= 0) {
      findings.push({
        rule: 'currency.exchange-rate',
        severity: 'error',
        path: 'Invoice/TaxExchangeRate/CalculationRate',
        message: 'Currency Exchange Rate (CalculationRate) is mandatory and must be greater than 0 when DocumentCurrencyCode is not MYR',
        docUrl: invoiceDocUrl(invoice),
      });
    }
    const target = text(invoice, 'TaxExchangeRate', 'TargetCurrencyCode');
    if (target !== undefined && target !== 'MYR') {
      findings.push({
        rule: 'currency.exchange-rate',
        severity: 'error',
        path: 'Invoice/TaxExchangeRate/TargetCurrencyCode',
        message: 'TaxExchangeRate/TargetCurrencyCode must be "MYR" when DocumentCurrencyCode is not MYR',
        docUrl: invoiceDocUrl(invoice),
      });
    }
  }

  return findings;
}
