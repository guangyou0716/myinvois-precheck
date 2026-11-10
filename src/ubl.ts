/** JSON UBL: each element is an array of objects; leaf text is "_" and attributes are siblings. */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `node[name]` when it is an array, otherwise []. */
export function children(node: unknown, name: string): unknown[] {
  if (!isRecord(node)) return [];
  const value = node[name];
  return Array.isArray(value) ? (value as unknown[]) : [];
}

/** Walks `names`, taking the first element of each child array. */
export function first(node: unknown, ...names: string[]): unknown {
  let current: unknown = node;
  for (const name of names) {
    const list = children(current, name);
    if (list.length === 0) return undefined;
    current = list[0];
  }
  return current;
}

function leafValue(node: unknown): unknown {
  if (!isRecord(node)) return undefined;
  return node._;
}

export function text(node: unknown, ...names: string[]): string | undefined {
  const value = leafValue(first(node, ...names));
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return undefined;
}

export function num(node: unknown, ...names: string[]): number | undefined {
  const value = leafValue(first(node, ...names));
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function attr(node: unknown, attrName: string, ...names: string[]): string | undefined {
  const target = first(node, ...names);
  if (!isRecord(target)) return undefined;
  const value = target[attrName];
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}
