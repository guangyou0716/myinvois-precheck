import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { run } from '../src/cli.js';

const PKG_VERSION = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

const VALID_1_1 = readFileSync(new URL('../fixtures/valid-invoice-1.1.json', import.meta.url), 'utf8');

const MINIMAL_INVOICE = JSON.stringify({
  Invoice: [{ InvoiceTypeCode: [{ _: '01', listVersionID: '1.1' }] }],
});

function fakeIo(files: Record<string, string> = {}) {
  let stdout = '';
  let stderr = '';
  return {
    stdout(s: string) {
      stdout += s;
    },
    stderr(s: string) {
      stderr += s;
    },
    readFile(p: string): string {
      if (!Object.hasOwn(files, p)) {
        throw new Error(`ENOENT: no such file or directory, open '${p}'`);
      }
      return files[p] as string;
    },
    get out() {
      return stdout;
    },
    get err() {
      return stderr;
    },
  };
}

describe('run', () => {
  it('prints help and exits 0 for --help', () => {
    const io = fakeIo();
    expect(run(['--help'], io)).toBe(0);
    expect(io.out).toContain('Usage: myinvois-precheck [--json] [--help] [--version] <file...>');
    expect(io.err).toBe('');
  });

  it('prints the package.json version and exits 0 for --version', () => {
    const io = fakeIo();
    expect(run(['--version'], io)).toBe(0);
    expect(io.out).toBe(`${PKG_VERSION}\n`);
    expect(io.err).toBe('');
  });

  it('exits 2 when no file is given', () => {
    const io = fakeIo();
    expect(run([], io)).toBe(2);
    expect(io.err).toContain('Missing file argument.');
    expect(io.err).toContain('Usage: myinvois-precheck');
  });

  it('exits 2 for an unknown option', () => {
    const io = fakeIo();
    expect(run(['--nope', 'a.json'], io)).toBe(2);
    expect(io.err).toContain('Unknown option: --nope');
  });

  it('exits 2 when a file cannot be read', () => {
    const io = fakeIo();
    expect(run(['missing.json'], io)).toBe(2);
    expect(io.err).toContain('Cannot read missing.json');
    expect(io.out).toBe('');
  });

  it('validates remaining files when one is unreadable and exits 2', () => {
    const io = fakeIo({
      'ok.json': VALID_1_1,
      'bad.json': '{}',
    });
    expect(run(['ok.json', 'missing.json', 'bad.json'], io)).toBe(2);
    expect(io.err).toContain('Cannot read missing.json');
    expect(io.out).toContain('ok.json  1.1  PASS');
    expect(io.out).toContain('bad.json  -  FAIL');
  });

  it('validates inline JSON and exits 1 on error findings', () => {
    const io = fakeIo({ 'inv.json': '{}' });
    expect(run(['inv.json'], io)).toBe(1);
    expect(io.out).toContain('inv.json  -  FAIL');
    expect(io.out).toContain('ERROR  structure.root');
    expect(io.out).toMatch(/error/);
  });

  it('exits 1 for a JSON parse failure', () => {
    const io = fakeIo({ 'bad.json': '{' });
    expect(run(['bad.json'], io)).toBe(1);
    expect(io.out).toContain('ERROR  structure.json-parse');
    expect(io.out).toContain('FAIL');
  });

  it('exits 0 for a valid invoice and prints PASS', () => {
    const io = fakeIo({ 'valid.json': VALID_1_1 });
    expect(run(['valid.json'], io)).toBe(0);
    expect(io.out).toContain('valid.json  1.1  PASS');
    expect(io.out).toContain('0 errors, 0 warnings');
  });

  it('does not fail on warnings', () => {
    const doc = JSON.parse(VALID_1_1) as Record<string, unknown>;
    doc._D = 'not-the-invoice-urn';
    const io = fakeIo({ 'warn.json': JSON.stringify(doc) });
    expect(run(['warn.json'], io)).toBe(0);
    expect(io.out).toContain('PASS');
    expect(io.out).toContain('WARN  structure.namespace');
  });

  it('prints a JSON object for --json with one file', () => {
    const io = fakeIo({ 'inv.json': MINIMAL_INVOICE });
    expect(run(['--json', 'inv.json'], io)).toBe(1);
    const parsed: unknown = JSON.parse(io.out);
    expect(parsed).toMatchObject({
      file: 'inv.json',
      ok: false,
      version: '1.1',
    });
    expect(parsed).toEqual(
      expect.objectContaining({
        errorCount: expect.any(Number),
        warningCount: expect.any(Number),
        findings: expect.any(Array),
      }),
    );
  });

  it('prints a JSON array for --json with multiple files', () => {
    const io = fakeIo({
      'a.json': MINIMAL_INVOICE,
      'b.json': '{}',
    });
    expect(run(['--json', 'a.json', 'b.json'], io)).toBe(1);
    const parsed: unknown = JSON.parse(io.out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toEqual([
      expect.objectContaining({ file: 'a.json', version: '1.1', ok: false }),
      expect.objectContaining({ file: 'b.json', ok: false }),
    ]);
  });

  it('prints text reports for multiple files and exits 1 if any has errors', () => {
    const io = fakeIo({
      'ok.json': VALID_1_1,
      'bad.json': '{}',
    });
    expect(run(['ok.json', 'bad.json'], io)).toBe(1);
    expect(io.out).toContain('ok.json  1.1  PASS');
    expect(io.out).toContain('bad.json  -  FAIL');
  });

  it('accepts --json after the file name', () => {
    const io = fakeIo({ 'inv.json': '{}' });
    expect(run(['inv.json', '--json'], io)).toBe(1);
    const parsed: unknown = JSON.parse(io.out);
    expect(parsed).toMatchObject({ file: 'inv.json', ok: false });
  });
});
