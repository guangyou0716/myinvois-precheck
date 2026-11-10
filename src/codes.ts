import { readFileSync } from 'node:fs';

export type CodeTable =
  | 'StateCodes'
  | 'CurrencyCodes'
  | 'CountryCodes'
  | 'TaxTypes'
  | 'ClassificationCodes'
  | 'MSICSubCategoryCodes'
  | 'EInvoiceTypes'
  | 'PaymentMethods'
  | 'UnitTypes';

const cache = new Map<CodeTable, Set<string>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function load(table: CodeTable): Set<string> {
  const cached = cache.get(table);
  if (cached) return cached;

  const raw = readFileSync(new URL(`../data/codes/${table}.json`, import.meta.url), 'utf8');
  const parsed: unknown = JSON.parse(raw);
  const codes = new Set<string>();
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (isRecord(item) && typeof item.Code === 'string') codes.add(item.Code);
    }
  }
  cache.set(table, codes);
  return codes;
}

export function hasCode(table: CodeTable, code: string): boolean {
  return load(table).has(code);
}
