import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const OASIS = 'https://docs.oasis-open.org/ubl/os-UBL-2.1';
const OASIS_XSD = `${OASIS}/xsd`;
const INVOICE_URL = `${OASIS_XSD}/maindoc/UBL-Invoice-2.1.xsd`;
const CAC_URL = `${OASIS_XSD}/common/UBL-CommonAggregateComponents-2.1.xsd`;

const DEFAULT_XSD_DIR = '/workspace/myinvois-research/ubl';
const INVOICE_FILE = 'UBL-Invoice-2.1.xsd';
const CAC_FILE = 'UBL-CommonAggregateComponents-2.1.xsd';
const REF_RE = /^(cbc|cac|ext):[A-Za-z][A-Za-z0-9]*$/;
const TIMEOUT_MS = 30_000;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultOut = join(repoRoot, 'data', 'ubl-order.json');

function usage() {
  return `Usage: node scripts/gen-ubl-order.mjs [--download] [--xsd-dir DIR] [--invoice PATH] [--cac PATH] [--out PATH] [invoice.xsd cac.xsd]

Reads OASIS UBL 2.1 Invoice and CommonAggregateComponents XSDs and writes data/ubl-order.json.
Default XSD directory: ${DEFAULT_XSD_DIR}
Download URLs (with --download): ${INVOICE_URL} and ${CAC_URL}
`;
}

function parseArgs(argv) {
  let download = false;
  let xsdDir = process.env.UBL_XSD_DIR ?? DEFAULT_XSD_DIR;
  let invoicePath = process.env.UBL_INVOICE_XSD;
  let cacPath = process.env.UBL_CAC_XSD;
  let outPath = process.env.UBL_ORDER_OUT ?? defaultOut;
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--download') {
      download = true;
    } else if (arg === '--help' || arg === '-h') {
      return { help: true };
    } else if (arg === '--xsd-dir' || arg === '--invoice' || arg === '--cac' || arg === '--out') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new Error(`${arg} requires a path argument\n${usage()}`);
      }
      i += 1;
      if (arg === '--xsd-dir') xsdDir = value;
      else if (arg === '--invoice') invoicePath = value;
      else if (arg === '--cac') cacPath = value;
      else outPath = value;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}\n${usage()}`);
    } else {
      positionals.push(arg);
    }
  }

  if (positionals.length > 2) {
    throw new Error(`Unexpected extra arguments: ${positionals.slice(2).join(' ')}\n${usage()}`);
  }
  if (positionals[0] !== undefined) invoicePath = positionals[0];
  if (positionals[1] !== undefined) cacPath = positionals[1];

  invoicePath ??= join(xsdDir, INVOICE_FILE);
  cacPath ??= join(xsdDir, CAC_FILE);

  return { download, invoicePath, cacPath, outPath };
}

async function atomicWrite(destPath, content) {
  const tmpPath = `${destPath}.tmp`;
  await mkdir(dirname(destPath), { recursive: true });
  try {
    await writeFile(tmpPath, content);
    await rename(tmpPath, destPath);
  } catch (error) {
    try {
      await unlink(tmpPath);
    } catch (cleanupError) {
      if (
        cleanupError &&
        typeof cleanupError === 'object' &&
        'code' in cleanupError &&
        cleanupError.code !== 'ENOENT'
      ) {
        throw cleanupError;
      }
    }
    throw error;
  }
}

async function downloadTo(url, destPath) {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  const text = await response.text();
  if (!text.includes('<xsd:schema') && !text.includes('<schema')) {
    throw new Error(`${url} is not an XSD schema`);
  }
  await atomicWrite(destPath, text);
  return destPath;
}

function extractComplexTypes(xsd) {
  const types = {};
  const typeRe = /<xsd:complexType\s+name="([^"]+)">([\s\S]*?)<\/xsd:complexType>/g;
  for (const match of xsd.matchAll(typeRe)) {
    const name = match[1];
    const body = match[2];
    const seq = body.match(/<xsd:sequence>([\s\S]*?)<\/xsd:sequence>/);
    if (seq === null) continue;
    const children = [];
    for (const refMatch of seq[1].matchAll(/<xsd:element\s+ref="([^"]+)"/g)) {
      const ref = refMatch[1];
      if (!REF_RE.test(ref)) {
        throw new Error(`Unexpected sequence ref "${ref}" in ${name}`);
      }
      children.push(ref);
    }
    types[name] = children;
  }
  return types;
}

function extractCacElements(xsd) {
  const elements = {};
  const elRe = /<xsd:element\s+name="([^"]+)"\s+type="([^"]+)"/g;
  for (const match of xsd.matchAll(elRe)) {
    const name = match[1];
    const type = match[2];
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name) || !/^[A-Za-z][A-Za-z0-9]*$/.test(type)) {
      throw new Error(`Unexpected CAC element declaration ${name} type ${type}`);
    }
    elements[`cac:${name}`] = type;
  }
  return elements;
}

function sortKeys(record) {
  const out = {};
  for (const key of Object.keys(record).sort()) {
    out[key] = record[key];
  }
  return out;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
    return;
  }

  if (opts.help) {
    process.stdout.write(usage());
    return;
  }

  let invoicePath = opts.invoicePath;
  let cacPath = opts.cacPath;

  if (opts.download) {
    const cacheDir = join(tmpdir(), 'ubl-xsd-2.1');
    await mkdir(cacheDir, { recursive: true });
    invoicePath = await downloadTo(INVOICE_URL, join(cacheDir, INVOICE_FILE));
    cacPath = await downloadTo(CAC_URL, join(cacheDir, CAC_FILE));
    console.log(`downloaded ${INVOICE_FILE} and ${CAC_FILE} to ${cacheDir}`);
  } else {
    if (!existsSync(invoicePath)) {
      throw new Error(`Invoice XSD not found: ${invoicePath} (pass --download or --invoice)`);
    }
    if (!existsSync(cacPath)) {
      throw new Error(`CAC XSD not found: ${cacPath} (pass --download or --cac)`);
    }
  }

  const invoiceXsd = await readFile(invoicePath, 'utf8');
  const cacXsd = await readFile(cacPath, 'utf8');

  const invoiceTypes = extractComplexTypes(invoiceXsd);
  const cacTypes = extractComplexTypes(cacXsd);
  const invoice = invoiceTypes.InvoiceType;
  if (!Array.isArray(invoice) || invoice.length === 0) {
    throw new Error('InvoiceType sequence not found in Invoice XSD');
  }
  if (invoice[0] !== 'ext:UBLExtensions' || invoice[1] !== 'cbc:UBLVersionID') {
    throw new Error(
      `InvoiceType sequence does not start with ext:UBLExtensions, cbc:UBLVersionID (got ${invoice.slice(0, 4).join(', ')})`,
    );
  }

  const elements = extractCacElements(cacXsd);
  if (elements['cac:AccountingSupplierParty'] !== 'SupplierPartyType') {
    throw new Error('cac:AccountingSupplierParty must map to SupplierPartyType');
  }
  if (elements['cac:PostalAddress'] !== 'AddressType') {
    throw new Error('cac:PostalAddress must map to AddressType');
  }

  const types = sortKeys({ ...cacTypes, ...invoiceTypes });
  const data = {
    source: `${OASIS}/`,
    invoice,
    types,
    elements: sortKeys(elements),
  };

  const json = `${JSON.stringify(data, null, 2)}\n`;
  await atomicWrite(opts.outPath, json);
  console.log(
    `wrote ${opts.outPath}: Invoice sequence ${invoice.length}, ${Object.keys(types).length} types, ${Object.keys(elements).length} cac elements`,
  );
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
