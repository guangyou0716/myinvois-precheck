import { readFileSync } from 'node:fs';
import { STRUCTURE } from './docs.js';
import type { Finding } from './types.js';
import { CAC_NS, CBC_NS, EXT_NS, type XmlElement } from './xml.js';

type UblOrder = {
  invoice: string[];
  types: Record<string, string[]>;
  elements: Record<string, string>;
};

let cached: UblOrder | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function load(): UblOrder {
  if (cached) return cached;
  const raw = readFileSync(new URL('../data/ubl-order.json', import.meta.url), 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (
    !isRecord(parsed) ||
    !Array.isArray(parsed.invoice) ||
    !isRecord(parsed.types) ||
    !isRecord(parsed.elements)
  ) {
    throw new Error('data/ubl-order.json is missing invoice, types, or elements');
  }
  const types: Record<string, string[]> = {};
  for (const [name, seq] of Object.entries(parsed.types)) {
    if (!Array.isArray(seq) || seq.some((item) => typeof item !== 'string')) {
      throw new Error(`data/ubl-order.json types.${name} must be a string array`);
    }
    types[name] = seq as string[];
  }
  const elements: Record<string, string> = {};
  for (const [name, type] of Object.entries(parsed.elements)) {
    if (typeof type !== 'string') {
      throw new Error(`data/ubl-order.json elements.${name} must be a string`);
    }
    elements[name] = type;
  }
  const invoice = parsed.invoice.filter((item): item is string => typeof item === 'string');
  cached = { invoice, types, elements };
  return cached;
}

function canonicalName(el: XmlElement): string | undefined {
  if (el.namespaceURI === CBC_NS) return `cbc:${el.localName}`;
  if (el.namespaceURI === CAC_NS) return `cac:${el.localName}`;
  if (el.namespaceURI === EXT_NS) return `ext:${el.localName}`;
  return undefined;
}

function childPath(parent: string, name: string, index: number, total: number): string {
  return total > 1 ? `${parent}/${name}[${index}]` : `${parent}/${name}`;
}

function walk(el: XmlElement, typeName: string, path: string, findings: Finding[], data: UblOrder): void {
  const sequence = typeName === 'InvoiceType' ? data.invoice : data.types[typeName];
  if (sequence === undefined) return;

  const position = new Map<string, number>();
  for (const [i, name] of sequence.entries()) {
    position.set(name, i);
  }

  const knownChildren: Array<{ child: XmlElement; name: string }> = [];
  for (const child of el.children) {
    const name = canonicalName(child);
    if (name === undefined) continue;
    knownChildren.push({ child, name });
  }

  const totals = new Map<string, number>();
  for (const { name } of knownChildren) {
    totals.set(name, (totals.get(name) ?? 0) + 1);
  }

  let lastPos = -1;
  let lastName = '';
  let reported = false;
  const seen = new Map<string, number>();

  for (const { child, name } of knownChildren) {
    const pos = position.get(name);
    if (pos !== undefined) {
      if (!reported && lastPos >= 0 && pos < lastPos) {
        findings.push({
          rule: 'structure.element-order',
          severity: 'error',
          path,
          message: `Invalid child element: ${name} must come before ${lastName}.`,
          docUrl: STRUCTURE,
        });
        reported = true;
      }
      lastPos = pos;
      lastName = name;
    }

    const childType = data.elements[name];
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (childType !== undefined) {
      walk(child, childType, childPath(path, name, n, totals.get(name) ?? 1), findings, data);
    }
  }
}

/** XML-only: children of Invoice and cac aggregates must follow the UBL 2.1 xsd:sequence. */
export function check(root: XmlElement): Finding[] {
  const findings: Finding[] = [];
  if (root.localName !== 'Invoice') return findings;
  walk(root, 'InvoiceType', 'Invoice', findings, load());
  return findings;
}
