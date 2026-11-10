import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateDocument } from '../src/validate.js';

const fixturesDir = new URL('../fixtures/', import.meta.url);

const VALID_FILES = new Set([
  'valid-invoice-1.1.json',
  'valid-invoice-1.0.json',
  'valid-credit-note-1.1.json',
  'valid-debit-note-1.1.json',
  'valid-refund-note-1.1.json',
  'valid-self-billed-invoice-1.1.json',
  'valid-self-billed-credit-note-1.1.json',
  'valid-foreign-currency-1.1.json',
  'valid-consolidated-1.1.json',
  'valid-exemption-1.1.json',
]);

const INVALID_RULE_PREFIX: Record<string, string> = {
  'invalid-missing-fields.json': 'required.',
  'invalid-codes.json': 'codes.',
  'invalid-math.json': 'math.',
  'invalid-parties.json': 'parties.',
};

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(name, fixturesDir), 'utf8')) as unknown;
}

function hasErrorFromPrefix(
  errors: { rule: string }[],
  prefix: string,
): boolean {
  const family = prefix.endsWith('.') ? prefix.slice(0, -1) : prefix;
  return errors.some((finding) => finding.rule === family || finding.rule.startsWith(prefix));
}

describe('fixtures', () => {
  const files = readdirSync(fixturesDir)
    .filter((name) => name.endsWith('.json'))
    .sort();

  it('loads every file in fixtures/', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toEqual(expect.arrayContaining([...VALID_FILES, ...Object.keys(INVALID_RULE_PREFIX)]));
  });

  for (const file of files) {
    it(file, () => {
      const result = validateDocument(loadFixture(file));
      const errors = result.findings.filter((finding) => finding.severity === 'error');
      const findingsMsg = JSON.stringify(result.findings, null, 2);

      if (VALID_FILES.has(file)) {
        const warnings = result.findings.filter((finding) => finding.severity === 'warning');
        expect(result.ok, findingsMsg).toBe(true);
        expect(errors, findingsMsg).toHaveLength(0);
        expect(warnings, findingsMsg).toHaveLength(0);
        return;
      }

      expect(result.ok).toBe(false);

      const prefix = INVALID_RULE_PREFIX[file];
      if (prefix !== undefined) {
        expect(hasErrorFromPrefix(errors, prefix), findingsMsg).toBe(true);
      }
    });
  }
});
