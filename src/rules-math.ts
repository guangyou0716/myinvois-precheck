import { MATH } from './docs.js';
import type { Finding } from './types.js';
import { attr, children, first, num, text } from './ubl.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// TODO: LHDN does not document a rounding tolerance.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mismatch(a: number, b: number): boolean {
  return Math.abs(a - b) > 0.005 + 1e-9;
}

function error(rule: string, path: string, message: string): Finding {
  return { rule, severity: 'error', path, message, docUrl: MATH };
}

function indexed(parent: string, name: string, index: number, total: number): string {
  return total > 1 ? `${parent}/${name}[${index}]` : `${parent}/${name}`;
}

function chargeIndicator(node: unknown): boolean | undefined {
  const el = first(node, 'ChargeIndicator');
  if (!isRecord(el)) return undefined;
  const value = el._;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function sumCharges(parent: unknown, isCharge: boolean): number {
  let sum = 0;
  for (const ac of children(parent, 'AllowanceCharge')) {
    if (chargeIndicator(ac) !== isCharge) continue;
    const amount = num(ac, 'Amount');
    if (amount !== undefined) sum += amount;
  }
  return sum;
}

function taxCategoryId(subtotal: unknown): string | undefined {
  return text(subtotal, 'TaxCategory', 'ID');
}

function sumDefined(values: Array<number | undefined>): number {
  let sum = 0;
  for (const value of values) {
    if (value !== undefined) sum += value;
  }
  return sum;
}

function lineTaxSubtotals(line: unknown): unknown[] {
  const result: unknown[] = [];
  for (const taxTotal of children(line, 'TaxTotal')) {
    result.push(...children(taxTotal, 'TaxSubtotal'));
  }
  return result;
}

function sumLineExtension(invoice: unknown): number {
  return sumDefined(children(invoice, 'InvoiceLine').map((line) => num(line, 'LineExtensionAmount')));
}

function sumLineTaxForCategory(invoice: unknown, categoryId: string): number {
  let sum = 0;
  for (const line of children(invoice, 'InvoiceLine')) {
    for (const sub of lineTaxSubtotals(line)) {
      if (taxCategoryId(sub) !== categoryId) continue;
      const amount = num(sub, 'TaxAmount');
      if (amount !== undefined) sum += amount;
    }
  }
  return sum;
}

function checkLines(invoice: unknown, findings: Finding[]): void {
  const lines = children(invoice, 'InvoiceLine');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const linePath = indexed('Invoice', 'InvoiceLine', i, lines.length);

    const quantity = num(line, 'InvoicedQuantity');
    const price = num(line, 'Price', 'PriceAmount');
    const subtotal = num(line, 'ItemPriceExtension', 'Amount');
    if (quantity !== undefined && price !== undefined && subtotal !== undefined) {
      const expected = price * quantity;
      if (mismatch(subtotal, expected)) {
        findings.push(
          error(
            'math.line-subtotal',
            `${linePath}/ItemPriceExtension/Amount`,
            `ItemPriceExtension/Amount ${subtotal} must equal Price/PriceAmount ${price} × InvoicedQuantity ${quantity} (${round2(expected)})`,
          ),
        );
      }
    }

    const lineTotal = num(line, 'LineExtensionAmount');
    if (lineTotal !== undefined && subtotal !== undefined) {
      const allowances = sumCharges(line, false);
      const charges = sumCharges(line, true);
      const expected = subtotal - allowances + charges;
      if (mismatch(lineTotal, expected)) {
        findings.push(
          error(
            'math.line-total-excl',
            `${linePath}/LineExtensionAmount`,
            `LineExtensionAmount ${lineTotal} must equal ItemPriceExtension/Amount ${subtotal} − allowances ${allowances} + charges ${charges} (${round2(expected)})`,
          ),
        );
      }
    }

    const lineTax = num(line, 'TaxTotal', 'TaxAmount');
    if (lineTax !== undefined) {
      const expected = sumDefined(lineTaxSubtotals(line).map((sub) => num(sub, 'TaxAmount')));
      if (mismatch(lineTax, expected)) {
        findings.push(
          error(
            'math.line-tax-total',
            `${linePath}/TaxTotal/TaxAmount`,
            `TaxTotal/TaxAmount ${lineTax} must equal the sum of TaxSubtotal/TaxAmount (${round2(expected)})`,
          ),
        );
      }
    }
  }
}

function checkTotals(invoice: unknown, findings: Finding[]): void {
  const monetary = first(invoice, 'LegalMonetaryTotal');
  const lineNet = num(monetary, 'LineExtensionAmount');
  const lineNetSum = sumLineExtension(invoice);

  if (lineNet !== undefined) {
    if (mismatch(lineNet, lineNetSum)) {
      findings.push(
        error(
          'math.total-net',
          'Invoice/LegalMonetaryTotal/LineExtensionAmount',
          `LineExtensionAmount ${lineNet} must equal the sum of InvoiceLine/LineExtensionAmount (${round2(lineNetSum)})`,
        ),
      );
    }
  }

  const allowanceTotal = num(monetary, 'AllowanceTotalAmount');
  const allowanceSum = sumCharges(invoice, false);
  if (allowanceTotal !== undefined) {
    if (mismatch(allowanceTotal, allowanceSum)) {
      findings.push(
        error(
          'math.total-discount',
          'Invoice/LegalMonetaryTotal/AllowanceTotalAmount',
          `AllowanceTotalAmount ${allowanceTotal} must equal the sum of invoice-level allowance Amount (${round2(allowanceSum)})`,
        ),
      );
    }
  }

  const chargeTotal = num(monetary, 'ChargeTotalAmount');
  const chargeSum = sumCharges(invoice, true);
  if (chargeTotal !== undefined) {
    if (mismatch(chargeTotal, chargeSum)) {
      findings.push(
        error(
          'math.total-charge',
          'Invoice/LegalMonetaryTotal/ChargeTotalAmount',
          `ChargeTotalAmount ${chargeTotal} must equal the sum of invoice-level charge Amount (${round2(chargeSum)})`,
        ),
      );
    }
  }

  const taxExclusive = num(monetary, 'TaxExclusiveAmount');
  if (taxExclusive !== undefined) {
    const net = lineNet !== undefined ? lineNet : lineNetSum;
    const expected = net - (allowanceTotal ?? 0) + (chargeTotal ?? 0);
    if (mismatch(taxExclusive, expected)) {
      findings.push(
        error(
          'math.total-excl',
          'Invoice/LegalMonetaryTotal/TaxExclusiveAmount',
          `TaxExclusiveAmount ${taxExclusive} must equal ${lineNet !== undefined ? 'LineExtensionAmount' : 'the sum of InvoiceLine/LineExtensionAmount'} − AllowanceTotalAmount + ChargeTotalAmount (${round2(expected)})`,
        ),
      );
    }
  }

  const taxInclusive = num(monetary, 'TaxInclusiveAmount');
  const invoiceTax = num(invoice, 'TaxTotal', 'TaxAmount');
  const taxAmountCurrency = attr(invoice, 'currencyID', 'TaxTotal', 'TaxAmount');
  const inclusiveCurrency = attr(monetary, 'currencyID', 'TaxInclusiveAmount');
  const mixedTaxCurrency =
    taxAmountCurrency !== undefined &&
    inclusiveCurrency !== undefined &&
    taxAmountCurrency !== inclusiveCurrency;
  if (
    taxInclusive !== undefined &&
    taxExclusive !== undefined &&
    invoiceTax !== undefined &&
    !mixedTaxCurrency
  ) {
    const expected = taxExclusive + invoiceTax;
    if (mismatch(taxInclusive, expected)) {
      findings.push(
        error(
          'math.total-incl',
          'Invoice/LegalMonetaryTotal/TaxInclusiveAmount',
          `TaxInclusiveAmount ${taxInclusive} must equal TaxExclusiveAmount ${taxExclusive} + TaxTotal/TaxAmount ${invoiceTax} (${round2(expected)})`,
        ),
      );
    }
  }

  const payable = num(monetary, 'PayableAmount');
  if (payable !== undefined && taxInclusive !== undefined) {
    const prepaid = num(invoice, 'PrepaidPayment', 'PaidAmount') ?? 0;
    const rounding = num(monetary, 'PayableRoundingAmount') ?? 0;
    const expected = taxInclusive - prepaid + rounding;
    if (mismatch(payable, expected)) {
      findings.push(
        error(
          'math.total-payable',
          'Invoice/LegalMonetaryTotal/PayableAmount',
          `PayableAmount ${payable} must equal TaxInclusiveAmount ${taxInclusive} − PrepaidPayment/PaidAmount ${prepaid} + PayableRoundingAmount ${rounding} (${round2(expected)})`,
        ),
      );
    }
  }
}

function checkTax(invoice: unknown, findings: Finding[]): void {
  const taxTotal = first(invoice, 'TaxTotal');
  const subtotals = children(taxTotal, 'TaxSubtotal');

  for (let i = 0; i < subtotals.length; i++) {
    const sub = subtotals[i];
    const categoryId = taxCategoryId(sub);
    const taxAmount = num(sub, 'TaxAmount');
    if (categoryId === undefined || taxAmount === undefined) continue;
    const expected = sumLineTaxForCategory(invoice, categoryId);
    if (mismatch(taxAmount, expected)) {
      findings.push(
        error(
          'math.tax-per-type',
          `${indexed('Invoice/TaxTotal', 'TaxSubtotal', i, subtotals.length)}/TaxAmount`,
          `TaxAmount ${taxAmount} for TaxCategory/ID "${categoryId}" must equal the sum of line TaxSubtotal/TaxAmount for the same tax type (${round2(expected)})`,
        ),
      );
    }
  }

  const invoiceTax = num(invoice, 'TaxTotal', 'TaxAmount');
  if (invoiceTax !== undefined) {
    const expected = sumDefined(subtotals.map((sub) => num(sub, 'TaxAmount')));
    if (mismatch(invoiceTax, expected)) {
      findings.push(
        error(
          'math.tax-total',
          'Invoice/TaxTotal/TaxAmount',
          `TaxTotal/TaxAmount ${invoiceTax} must equal the sum of TaxSubtotal/TaxAmount (${round2(expected)})`,
        ),
      );
    }
  }
}

export function check(doc: unknown): Finding[] {
  const invoice = first(doc, 'Invoice');
  if (!isRecord(invoice)) return [];

  const findings: Finding[] = [];
  checkLines(invoice, findings);
  checkTotals(invoice, findings);
  checkTax(invoice, findings);
  // TODO: "Total taxable amount per tax type" formula is not checked.
  // TODO: tax rate × taxable amount is not checked (LHDN allows fixed-rate and the 17 Jul 2026 note says exempt TaxAmount need not be 0).
  return findings;
}
