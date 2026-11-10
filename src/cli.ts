#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatJson, formatText } from './report.js';
import { validateJson } from './validate.js';
import type { ValidationResult } from './types.js';

export type CliIo = {
  stdout(s: string): void;
  stderr(s: string): void;
  readFile(p: string): string;
};

const USAGE = 'Usage: myinvois-precheck [--json] [--help] [--version] <file...>';

const HELP = `${USAGE}

Offline pre-submission checker for MyInvois Invoice, Credit Note, Debit Note, Refund Note, and self-billed types (01-04, 11-14) in UBL 2.1 JSON.

Options:
  --json      Print a JSON report (array when multiple files)
  --help      Show this help
  --version   Print the package version

Exit codes:
  0  no error findings (warnings allowed)
  1  one or more error findings
  2  usage error or unreadable file
`;

function packageVersion(): string {
  const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'version' in parsed &&
    typeof (parsed as { version: unknown }).version === 'string'
  ) {
    return (parsed as { version: string }).version;
  }
  throw new Error('package.json is missing a version string');
}

function isKnownFlag(arg: string): arg is '--json' | '--help' | '--version' {
  return arg === '--json' || arg === '--help' || arg === '--version';
}

export function run(
  argv: string[],
  io: { stdout(s: string): void; stderr(s: string): void; readFile(p: string): string },
): number {
  let jsonMode = false;
  let help = false;
  let version = false;
  const files: string[] = [];

  for (const arg of argv) {
    if (isKnownFlag(arg)) {
      if (arg === '--json') jsonMode = true;
      else if (arg === '--help') help = true;
      else version = true;
    } else if (arg.startsWith('-')) {
      io.stderr(`Unknown option: ${arg}\n${HELP}`);
      return 2;
    } else {
      files.push(arg);
    }
  }

  if (help) {
    io.stdout(HELP);
    return 0;
  }
  if (version) {
    io.stdout(`${packageVersion()}\n`);
    return 0;
  }
  if (files.length === 0) {
    io.stderr(`Missing file argument.\n${HELP}`);
    return 2;
  }

  const results: { file: string; result: ValidationResult }[] = [];
  let unreadable = false;
  for (const file of files) {
    let text: string;
    try {
      text = io.readFile(file);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      io.stderr(`Cannot read ${file}: ${detail}\n`);
      unreadable = true;
      continue;
    }
    results.push({ file, result: validateJson(text) });
  }

  if (jsonMode) {
    if (results.length === 1) {
      const only = results[0];
      io.stdout(formatJson(only.result, only.file));
    } else {
      const payload = results.map((item) => JSON.parse(formatJson(item.result, item.file)) as unknown);
      io.stdout(`${JSON.stringify(payload, null, 2)}\n`);
    }
  } else {
    for (let i = 0; i < results.length; i += 1) {
      const item = results[i];
      if (i > 0) io.stdout('\n');
      io.stdout(formatText(item.result, item.file));
    }
  }

  if (unreadable) return 2;
  return results.some((item) => !item.result.ok) ? 1 : 0;
}

function isEntryPoint(): boolean {
  const script = process.argv[1];
  if (script === undefined) return false;
  try {
    return realpathSync(script) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  const code = run(process.argv.slice(2), {
    stdout(s) {
      process.stdout.write(s);
    },
    stderr(s) {
      process.stderr.write(s);
    },
    readFile(p) {
      return readFileSync(p, 'utf8');
    },
  });
  process.exitCode = code;
}
