/** Convert UBL 2.1 XML into the JSON shape the existing rules consume. */

export const XML_MAX_DEPTH = 200;

export const CAC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
export const CBC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
export const EXT_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';

const PREDEFINED_ENTITIES: Record<string, string> = Object.assign(Object.create(null), {
  lt: '<',
  gt: '>',
  amp: '&',
  apos: "'",
  quot: '"',
});

export class XmlParseError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(`XML parse error at line ${line}: ${message}`);
    this.name = 'XmlParseError';
    this.line = line;
  }
}

type XmlAttr = { name: string; value: string };

export type XmlElement = {
  qName: string;
  localName: string;
  prefix: string;
  namespaceURI: string;
  attrs: XmlAttr[];
  children: XmlElement[];
  text: string;
  line: number;
};

function localNameOf(qName: string): { prefix: string; localName: string } {
  const colon = qName.indexOf(':');
  if (colon <= 0) return { prefix: '', localName: qName };
  return { prefix: qName.slice(0, colon), localName: qName.slice(colon + 1) };
}

function isNameStart(c: string): boolean {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_' || c === ':';
}

function isNameChar(c: string): boolean {
  return isNameStart(c) || (c >= '0' && c <= '9') || c === '-' || c === '.';
}

function isHexDigit(c: string): boolean {
  return (c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f');
}

function isWhite(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r';
}

function isXmlnsAttr(qName: string): boolean {
  return qName === 'xmlns' || qName.startsWith('xmlns:');
}

class Reader {
  private readonly src: string;
  private i = 0;
  private line = 1;

  constructor(text: string) {
    let src = text.startsWith('\uFEFF') ? text.slice(1) : text;
    src = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    this.src = src;
  }

  eof(): boolean {
    return this.i >= this.src.length;
  }

  peek(): string {
    return this.src[this.i] ?? '';
  }

  startsWith(s: string): boolean {
    return this.src.startsWith(s, this.i);
  }

  startsWithIgnoreCase(s: string): boolean {
    return this.src.slice(this.i, this.i + s.length).toLowerCase() === s.toLowerCase();
  }

  fail(message: string): never {
    throw new XmlParseError(message, this.line);
  }

  next(): string {
    if (this.eof()) this.fail('unexpected end of file');
    const c = this.src[this.i] as string;
    this.i += 1;
    if (c === '\n') this.line += 1;
    return c;
  }

  consume(s: string): void {
    if (!this.startsWith(s)) this.fail(`expected "${s}"`);
    for (let n = 0; n < s.length; n += 1) this.next();
  }

  skipWs(): void {
    while (!this.eof() && isWhite(this.peek())) this.next();
  }

  skipUntil(delimiter: string, what: string): string {
    const startLine = this.line;
    const found = this.src.indexOf(delimiter, this.i);
    if (found < 0) {
      this.line = startLine;
      this.fail(`unclosed ${what}`);
    }
    const content = this.src.slice(this.i, found);
    this.i = found + delimiter.length;
    for (const c of content) {
      if (c === '\n') this.line += 1;
    }
    return content;
  }

  parseName(): string {
    if (this.eof() || !isNameStart(this.peek())) this.fail('expected a name');
    const start = this.i;
    this.next();
    while (!this.eof() && isNameChar(this.peek())) this.next();
    return this.src.slice(start, this.i);
  }

  parseEntity(): string {
    this.consume('&');
    if (this.peek() === '#') {
      this.next();
      let hex = false;
      if (this.peek() === 'x' || this.peek() === 'X') {
        hex = true;
        this.next();
      }
      const start = this.i;
      if (hex) {
        while (!this.eof() && isHexDigit(this.peek())) this.next();
      } else {
        while (!this.eof() && this.peek() >= '0' && this.peek() <= '9') this.next();
      }
      if (this.i === start) this.fail('empty character reference');
      if (this.peek() !== ';') this.fail('unterminated character reference');
      const digits = this.src.slice(start, this.i);
      this.next();
      const code = Number.parseInt(digits, hex ? 16 : 10);
      if (
        !Number.isFinite(code) ||
        code < 1 ||
        code > 0x10ffff ||
        (code >= 0xd800 && code <= 0xdfff)
      ) {
        this.fail(`invalid character reference ${hex ? '&#x' : '&#'}${digits};`);
      }
      return String.fromCodePoint(code);
    }

    const start = this.i;
    if (this.eof() || !isNameStart(this.peek())) this.fail('unterminated entity reference');
    this.next();
    while (!this.eof() && isNameChar(this.peek()) && this.peek() !== ':') this.next();
    if (this.peek() !== ';') this.fail('unterminated entity reference');
    const name = this.src.slice(start, this.i);
    this.next();
    const resolved = PREDEFINED_ENTITIES[name];
    if (resolved === undefined) this.fail(`unknown entity &${name};`);
    return resolved;
  }

  parseQuoted(): string {
    const q = this.peek();
    if (q !== '"' && q !== "'") this.fail('attribute value must be quoted');
    this.next();
    let value = '';
    while (!this.eof() && this.peek() !== q) {
      const c = this.peek();
      if (c === '<') this.fail('"<" is not allowed in an attribute value');
      if (c === '&') value += this.parseEntity();
      else value += this.next();
    }
    if (this.peek() !== q) this.fail('unclosed attribute value');
    this.next();
    return value;
  }

  parseAttrs(): XmlAttr[] {
    const attrs: XmlAttr[] = [];
    const seen = new Set<string>();
    for (;;) {
      this.skipWs();
      if (this.eof()) this.fail('unclosed start tag');
      const c = this.peek();
      if (c === '>' || this.startsWith('/>')) break;
      if (!isNameStart(c)) this.fail('malformed attribute');
      const name = this.parseName();
      this.skipWs();
      if (this.peek() !== '=') this.fail(`attribute ${name} is missing a value`);
      this.next();
      this.skipWs();
      const value = this.parseQuoted();
      if (seen.has(name)) this.fail(`duplicate attribute ${name}`);
      seen.add(name);
      attrs.push({ name, value });
    }
    return attrs;
  }

  rejectDeclarations(): void {
    if (this.startsWithIgnoreCase('<!DOCTYPE')) {
      this.fail('<!DOCTYPE> is not allowed');
    }
    if (this.startsWithIgnoreCase('<!ENTITY')) {
      this.fail('<!ENTITY> is not allowed');
    }
  }

  skipComment(): void {
    this.consume('<!--');
    const content = this.skipUntil('-->', 'comment');
    if (content.includes('--')) this.fail('comment contains "--"');
  }

  skipPi(): void {
    this.consume('<?');
    this.skipUntil('?>', 'processing instruction');
  }

  parseCdata(): string {
    this.consume('<![CDATA[');
    return this.skipUntil(']]>', 'CDATA');
  }

  skipMisc(): void {
    for (;;) {
      this.skipWs();
      if (this.startsWith('<!--')) {
        this.skipComment();
        continue;
      }
      if (this.startsWith('<?')) {
        this.skipPi();
        continue;
      }
      this.rejectDeclarations();
      break;
    }
  }

  parseText(): string {
    let out = '';
    while (!this.eof() && this.peek() !== '<') {
      if (this.peek() === '&') out += this.parseEntity();
      else out += this.next();
    }
    return out;
  }

  parseElement(depth: number): XmlElement {
    if (depth > XML_MAX_DEPTH) this.fail(`nesting exceeds maximum depth of ${XML_MAX_DEPTH}`);
    const line = this.line;
    this.consume('<');
    if (this.peek() === '/') this.fail('unexpected end tag');
    const qName = this.parseName();
    const { prefix, localName } = localNameOf(qName);
    this.skipWs();
    const attrs = this.parseAttrs();
    this.skipWs();
    if (this.startsWith('/>')) {
      this.consume('/>');
      return { qName, localName, prefix, namespaceURI: '', attrs, children: [], text: '', line };
    }
    if (this.peek() !== '>') this.fail(`malformed start tag <${qName}>`);
    this.next();

    const children: XmlElement[] = [];
    const texts: string[] = [];
    for (;;) {
      if (this.eof()) this.fail(`unclosed tag <${qName}>`);
      if (this.startsWith('</')) break;
      if (this.startsWith('<!--')) {
        this.skipComment();
        continue;
      }
      if (this.startsWith('<?')) {
        this.skipPi();
        continue;
      }
      if (this.startsWith('<![CDATA[')) {
        texts.push(this.parseCdata());
        continue;
      }
      this.rejectDeclarations();
      if (this.startsWith('<!')) this.fail('unsupported markup declaration');
      if (this.peek() === '<') {
        children.push(this.parseElement(depth + 1));
        continue;
      }
      texts.push(this.parseText());
    }

    this.consume('</');
    const endName = this.parseName();
    this.skipWs();
    if (this.peek() !== '>') this.fail(`malformed end tag </${endName}>`);
    this.next();
    if (endName !== qName) this.fail(`mismatched tag </${endName}> (expected </${qName}>)`);

    const joined = texts.join('');
    const text = children.length === 0 ? joined : joined.trim() === '' ? '' : joined;
    return { qName, localName, prefix, namespaceURI: '', attrs, children, text, line };
  }
}

function resolveNamespaces(el: XmlElement, parent: Map<string, string>): void {
  const ns = new Map(parent);
  for (const [prefix, uri] of xmlnsMap(el)) ns.set(prefix, uri);
  el.namespaceURI = ns.get(el.prefix) ?? '';
  for (const child of el.children) resolveNamespaces(child, ns);
}

function xmlnsMap(el: XmlElement): Map<string, string> {
  const map = new Map<string, string>();
  for (const attr of el.attrs) {
    if (attr.name === 'xmlns') map.set('', attr.value);
    else if (attr.name.startsWith('xmlns:')) map.set(attr.name.slice('xmlns:'.length), attr.value);
  }
  return map;
}

/** Null-prototype record so names like `__proto__` are own enumerable data properties. */
function emptyNode(): Record<string, unknown> {
  return Object.create(null) as Record<string, unknown>;
}

function convertElement(el: XmlElement): Record<string, unknown> {
  const obj = emptyNode();
  for (const attr of el.attrs) {
    if (isXmlnsAttr(attr.name)) continue;
    const { localName } = localNameOf(attr.name);
    obj[localName] = attr.value;
  }
  if (el.children.length === 0) {
    obj._ = el.text;
  } else {
    if (el.text !== '') obj._ = el.text;
    for (const child of el.children) {
      const list = obj[child.localName];
      const converted = convertElement(child);
      if (Array.isArray(list)) list.push(converted);
      else obj[child.localName] = [converted];
    }
  }
  return obj;
}

/** Parse XML into an element tree with namespace URIs resolved. JSON-shape conversion is separate. */
export function parseXml(text: string): XmlElement {
  const reader = new Reader(text);
  reader.skipMisc();
  if (reader.eof()) reader.fail('missing root element');
  reader.rejectDeclarations();
  if (reader.peek() !== '<') reader.fail('expected a root element');

  const root = reader.parseElement(1);
  reader.skipMisc();
  if (!reader.eof()) reader.fail('unexpected content after the root element');
  resolveNamespaces(root, new Map());
  return root;
}

/** Convert a parsed Invoice element tree into the JSON shape the existing rules consume. */
export function xmlElementToUbl(root: XmlElement): unknown {
  if (root.localName !== 'Invoice') {
    throw new XmlParseError(`root element must be Invoice, got ${root.localName}`, root.line);
  }

  const ns = xmlnsMap(root);
  const result = emptyNode();

  const defaultNs = ns.get('');
  const prefixedRootNs = root.prefix !== '' ? ns.get(root.prefix) : undefined;
  const documentNs = defaultNs ?? prefixedRootNs;
  if (documentNs !== undefined) result._D = documentNs;

  for (const uri of ns.values()) {
    if (uri === CAC_NS) result._A = CAC_NS;
    if (uri === CBC_NS) result._B = CBC_NS;
  }

  result.Invoice = [convertElement(root)];
  return result;
}

export function xmlToUbl(text: string): unknown {
  return xmlElementToUbl(parseXml(text));
}
