# myinvois-precheck

myinvois-precheck is a free, offline, stateless pre-submission checker (CLI and TypeScript library) for Malaysia MyInvois e-Invoices in LHDN’s UBL 2.1 JSON format. It covers Invoice (`01`), Credit Note (`02`), Debit Note (`03`), and Refund Note (`04`) for document versions `1.0` and `1.1`. It makes no network calls, uses no credentials, and never submits a document.

**This project is not affiliated with, endorsed by, or connected to Lembaga Hasil Dalam Negeri Malaysia (LHDN/HASiL). Passing this check does not guarantee that MyInvois will accept the document. The official MyInvois validators are authoritative.**

## Usage

The package is private and is not published to npm. Build from this repository:

```bash
npm ci && npm run build
node dist/cli.js invoice.json
```

Pass `--json` for JSON output. Pass more than one file to check several invoices in one run:

```bash
node dist/cli.js --json invoice.json another.json
```

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | No errors (warnings are allowed) |
| 1 | Errors found |
| 2 | Usage error or unreadable file |

Library:

```js
import { validateJson } from './dist/index.js';
```

## What it checks

Each finding cites the matching LHDN SDK page: validator error pages under [document validation rules](https://sdk.myinvois.hasil.gov.my/documentvalidationrules/), the [Invoice](https://sdk.myinvois.hasil.gov.my/documents/invoice-v1-1/), [Credit Note](https://sdk.myinvois.hasil.gov.my/documents/credit-v1-1/), [Debit Note](https://sdk.myinvois.hasil.gov.my/documents/debit-v1-1/), or [Refund Note](https://sdk.myinvois.hasil.gov.my/documents/refund-v1-1/) v1.0 / v1.1 data-structure pages, or the [mathematical mappings](https://sdk.myinvois.hasil.gov.my/mathematical-mappings/) page.

| Group | Description | LHDN codes |
|-------|-------------|------------|
| structure | JSON root with a non-empty `Invoice` array; UBL markers `_D` / `_A` / `_B`; `InvoiceTypeCode` `01` / `02` / `03` / `04`; `listVersionID` `1.0` or `1.1`; `Signature` and `UBLExtensions` present on v1.1 | — |
| required | Mandatory invoice, party, tax, monetary-total, and line fields; original e-Invoice reference (`UUID` and `ID`) on credit, debit, and refund notes; `IssueDate` / `IssueTime` format; max lengths; amount values limited to 26 digits; tax exemption reason when tax type is `E` | CF378 |
| parties | Supplier and buyer TIN length and FAQ format; NRIC / PASSPORT / ARMY / BRN length; SST and tourism tax (TTX) format; email and phone; address line, city, and postcode | CF345, CF346, CF400, CF401, CF404–CF412 |
| codes | Invoice type, currency, country, state, tax type, MSIC, classification, unit, and payment method against LHDN code tables; Malaysian state codes on non-`MYS` addresses | CV302, CV316, CV317 |
| currency | Amount `currencyID` vs document (and tax) currency; tax amounts must use `TaxCurrencyCode` when it is present; `TaxCurrencyCode` is document currency or `MYR`; `SourceCurrencyCode` matches document currency; exchange rate when document currency is not `MYR` | DC501, DC502, DC510, DC512 |
| math | Line and invoice arithmetic against LHDN mathematical mappings (price × quantity, allowances/charges, tax sums, payable amount) | none published |

Where LHDN publishes an error code, a finding includes it: CF345, CF346, CF378, CF400, CF401, CF404–CF412, CV302, CV316, CV317, DC501, DC502, DC510, DC512. Math rules have no published LHDN error code.

TIN pattern check (`parties.tin-format`) is a **warning**, based on the [LHDN SDK FAQ](https://sdk.myinvois.hasil.gov.my/faq/): prefix `IG` for individuals; `C`, `CS`, `D`, `F`, `FA`, `PT`, `TA`, `TC`, `TN`, `TR`, `TP`, `J`, `LE` for non-individuals; no leading zero after the prefix; non-individual TINs end in `0`. General TINs `EI` + 11 digits are accepted.

## What it does NOT check

- Digital signature validity (presence only, for v1.1)
- Whether TIN / BRN / NRIC actually exist or match (Taxpayer Validator needs LHDN systems)
- Referenced documents
- Duplicate detection
- Issuance date/time window
- Self-billed types (`11`–`14`)
- Versions 1.2 / 1.3 (SVDP)
- XML documents (planned)
- Document size limit
- Tax rate × taxable amount
- “Total taxable amount per tax type” formula
- The XML element-order structure rule

## Known TODOs / uncertainties

- Rounding tolerance for arithmetic is not documented by LHDN. This tool rounds to 2 decimals and uses tolerance `0.005`.
- General TIN values (`EI` + 11 digits) come from the LHDN e-Invoice Specific Guideline rather than the SDK.
- State code `17` on a Malaysian address is a warning unless the buyer TIN is the consolidated general TIN `EI00000000010`.
- Official LHDN JSON samples use placeholder values (for example `"Supplier's TIN"`) and inconsistent amounts, so they fail this checker by design.
- Project fixtures are synthetic: `valid-invoice-1.0.json`, `valid-invoice-1.1.json`, `valid-credit-note-1.1.json`, `valid-debit-note-1.1.json`, `valid-refund-note-1.1.json`, `valid-foreign-currency-1.1.json`, `valid-consolidated-1.1.json`, `valid-exemption-1.1.json`, and `invalid-*.json`.

## Code tables

`data/codes/*.json` are verbatim copies of LHDN’s public code tables from [https://sdk.myinvois.hasil.gov.my/codes/](https://sdk.myinvois.hasil.gov.my/codes/). Refresh with `npm run fetch-codes` (a dev-only network script). Downloaded 2026-11-10.

## Development

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs on Node 20 and 22.

Code in this repository was written and reviewed by Grok CLI.

## License

MIT (see [LICENSE](LICENSE)).
