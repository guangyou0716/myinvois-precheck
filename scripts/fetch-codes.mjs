import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAMES = [
  'StateCodes',
  'CurrencyCodes',
  'CountryCodes',
  'TaxTypes',
  'ClassificationCodes',
  'MSICSubCategoryCodes',
  'EInvoiceTypes',
  'PaymentMethods',
  'UnitTypes',
];

const BASE = 'https://sdk.myinvois.hasil.gov.my/files';
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'codes');

await mkdir(outDir, { recursive: true });

let failed = false;

for (const name of NAMES) {
  const url = `${BASE}/${name}.json`;
  const destPath = join(outDir, `${name}.json`);
  const tmpPath = join(outDir, `${name}.json.tmp`);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      throw new Error(`${url} returned HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`${name} is not a non-empty JSON array`);
    }

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (item === null || typeof item !== 'object' || Array.isArray(item) || !Object.hasOwn(item, 'Code')) {
        throw new Error(`${name}[${i}] is missing a "Code" key`);
      }
    }

    await writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
    await rename(tmpPath, destPath);
    console.log(`${name}: ${data.length} codes`);
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${name}: ${message}`);
    try {
      await unlink(tmpPath);
    } catch (cleanupError) {
      if (cleanupError && typeof cleanupError === 'object' && 'code' in cleanupError && cleanupError.code !== 'ENOENT') {
        throw cleanupError;
      }
    }
  }
}

if (failed) {
  process.exitCode = 1;
}
