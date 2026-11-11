import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STRUCTURE } from '../src/docs.js';
import { check } from '../src/rules-element-order.js';
import { validateJson, validateXml } from '../src/validate.js';
import { parseXml } from '../src/xml.js';

const INV = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
const CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
const CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
const EXT = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';

const NS = `xmlns="${INV}" xmlns:cac="${CAC}" xmlns:cbc="${CBC}"`;

function invoiceXml(body: string, attrs: string = NS): string {
  return `<Invoice ${attrs}>${body}</Invoice>`;
}

function orderFindings(xml: string) {
  return validateXml(xml).findings.filter((finding) => finding.rule === 'structure.element-order');
}

const ublOrder = JSON.parse(
  readFileSync(new URL('../data/ubl-order.json', import.meta.url), 'utf8'),
) as {
  source: string;
  invoice: string[];
  types: Record<string, string[]>;
  elements: Record<string, string>;
};

describe('data/ubl-order.json', () => {
  it('has an Invoice sequence starting with UBLExtensions and UBLVersionID', () => {
    expect(ublOrder.invoice.slice(0, 6)).toEqual([
      'ext:UBLExtensions',
      'cbc:UBLVersionID',
      'cbc:CustomizationID',
      'cbc:ProfileID',
      'cbc:ProfileExecutionID',
      'cbc:ID',
    ]);
    expect(ublOrder.invoice).toContain('cbc:IssueDate');
    expect(ublOrder.invoice).toContain('cac:AccountingSupplierParty');
    expect(ublOrder.invoice).toContain('cac:InvoiceLine');
    expect(ublOrder.types.InvoiceType).toEqual(ublOrder.invoice);
  });

  it('maps known cac aggregates to their types and sequences', () => {
    expect(ublOrder.elements['cac:AccountingSupplierParty']).toBe('SupplierPartyType');
    expect(ublOrder.elements['cac:PostalAddress']).toBe('AddressType');
    expect(ublOrder.elements['cac:Party']).toBe('PartyType');
    expect(ublOrder.elements['cac:TaxTotal']).toBe('TaxTotalType');
    expect(ublOrder.elements['cac:InvoiceLine']).toBe('InvoiceLineType');
    expect(ublOrder.elements['cac:LegalMonetaryTotal']).toBe('MonetaryTotalType');
    expect(ublOrder.types.PartyType?.indexOf('cac:PartyIdentification')).toBeLessThan(
      ublOrder.types.PartyType?.indexOf('cac:PostalAddress') ?? -1,
    );
    expect(ublOrder.types.TaxTotalType?.[0]).toBe('cbc:TaxAmount');
    expect(ublOrder.types.TaxTotalType).toContain('cac:TaxSubtotal');
    expect(ublOrder.types.AddressType).toContain('cbc:CityName');
    expect(ublOrder.types.AddressType?.indexOf('cbc:CityName')).toBeLessThan(
      ublOrder.types.AddressType?.indexOf('cac:AddressLine') ?? -1,
    );
  });

  it('notes the OASIS UBL 2.1 source', () => {
    expect(ublOrder.source).toContain('docs.oasis-open.org/ubl/os-UBL-2.1');
  });
});

describe('structure.element-order', () => {
  it('reports one error when IssueDate appears before ID', () => {
    const xml = invoiceXml(
      `<cbc:IssueDate>2024-07-23</cbc:IssueDate><cbc:ID>x</cbc:ID><cbc:InvoiceTypeCode listVersionID="1.0">01</cbc:InvoiceTypeCode>`,
    );
    const findings = orderFindings(xml);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      rule: 'structure.element-order',
      severity: 'error',
      path: 'Invoice',
      message: 'Invalid child element: cbc:ID must come before cbc:IssueDate.',
      docUrl: STRUCTURE,
    });
    expect(findings[0]?.message).toContain('Invalid child element');
  });

  it('reports a swapped PostalAddress child with the parent path', () => {
    const xml = readFileSync(new URL('../fixtures/order-swapped-address.xml', import.meta.url), 'utf8');
    const findings = orderFindings(xml);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: 'structure.element-order',
      severity: 'error',
      path: 'Invoice/cac:AccountingSupplierParty/cac:Party/cac:PostalAddress',
      docUrl: STRUCTURE,
    });
    expect(findings[0]?.message).toContain('Invalid child element');
    expect(findings[0]?.message).toContain('cbc:CityName');
    expect(findings[0]?.message).toContain('cac:AddressLine');
  });

  it('reports a swapped TaxTotal child with the parent path', () => {
    const xml = invoiceXml(`
      <cbc:ID>x</cbc:ID>
      <cbc:IssueDate>2024-07-23</cbc:IssueDate>
      <cbc:InvoiceTypeCode listVersionID="1.0">01</cbc:InvoiceTypeCode>
      <cac:TaxTotal>
        <cac:TaxSubtotal>
          <cbc:TaxAmount currencyID="MYR">1</cbc:TaxAmount>
        </cac:TaxSubtotal>
        <cbc:TaxAmount currencyID="MYR">1</cbc:TaxAmount>
      </cac:TaxTotal>
    `);
    const findings = orderFindings(xml);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: 'structure.element-order',
      severity: 'error',
      path: 'Invoice/cac:TaxTotal',
      message: 'Invalid child element: cbc:TaxAmount must come before cac:TaxSubtotal.',
      docUrl: STRUCTURE,
    });
  });

  it('skips unknown elements instead of flagging them', () => {
    const xml = invoiceXml(`
      <cbc:ID>x</cbc:ID>
      <cbc:NotInTheSchema>skip me</cbc:NotInTheSchema>
      <foo:Whatever xmlns:foo="urn:example:foo">also skip</foo:Whatever>
      <cbc:IssueDate>2024-07-23</cbc:IssueDate>
      <cbc:InvoiceTypeCode listVersionID="1.0">01</cbc:InvoiceTypeCode>
    `);
    expect(orderFindings(xml)).toEqual([]);
  });

  it('matches by namespace URI when prefixes differ', () => {
    const xml = `<inv:Invoice xmlns:inv="${INV}" xmlns:agg="${CAC}" xmlns:bas="${CBC}">
      <bas:IssueDate>2024-07-23</bas:IssueDate>
      <bas:ID>x</bas:ID>
      <bas:InvoiceTypeCode listVersionID="1.0">01</bas:InvoiceTypeCode>
    </inv:Invoice>`;
    const findings = orderFindings(xml);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      path: 'Invoice',
      message: 'Invalid child element: cbc:ID must come before cbc:IssueDate.',
    });
  });

  it('accepts ext:UBLExtensions by namespace even without the ext prefix', () => {
    const xml = invoiceXml(`
      <UBLExtensions xmlns="${EXT}"></UBLExtensions>
      <cbc:ID>x</cbc:ID>
      <cbc:IssueDate>2024-07-23</cbc:IssueDate>
      <cbc:InvoiceTypeCode listVersionID="1.0">01</cbc:InvoiceTypeCode>
    `);
    expect(orderFindings(xml)).toEqual([]);
  });

  it('allows repeated siblings in a row', () => {
    const xml = invoiceXml(`
      <cbc:ID>x</cbc:ID>
      <cbc:IssueDate>2024-07-23</cbc:IssueDate>
      <cbc:InvoiceTypeCode listVersionID="1.0">01</cbc:InvoiceTypeCode>
      <cac:InvoiceLine>
        <cbc:ID>1</cbc:ID>
        <cbc:LineExtensionAmount currencyID="MYR">1</cbc:LineExtensionAmount>
        <cac:Item><cbc:Description>a</cbc:Description></cac:Item>
      </cac:InvoiceLine>
      <cac:InvoiceLine>
        <cbc:ID>2</cbc:ID>
        <cbc:LineExtensionAmount currencyID="MYR">1</cbc:LineExtensionAmount>
        <cac:Item><cbc:Description>b</cbc:Description></cac:Item>
      </cac:InvoiceLine>
    `);
    expect(orderFindings(xml)).toEqual([]);
  });

  it('never attaches the rule to JSON input', () => {
    const json = readFileSync(new URL('../fixtures/valid-invoice-1.1.json', import.meta.url), 'utf8');
    expect(validateJson(json).findings.some((finding) => finding.rule === 'structure.element-order')).toBe(
      false,
    );
    const scrambled = JSON.stringify({
      _D: INV,
      _A: CAC,
      _B: CBC,
      Invoice: [
        {
          IssueDate: [{ _: '2024-07-23' }],
          ID: [{ _: 'x' }],
          InvoiceTypeCode: [{ _: '01', listVersionID: '1.0' }],
        },
      ],
    });
    expect(
      validateJson(scrambled).findings.some((finding) => finding.rule === 'structure.element-order'),
    ).toBe(false);
  });
});

describe('XML fixtures and samples have zero element-order findings', () => {
  const fixtureDir = new URL('../fixtures/', import.meta.url);
  const fixtureXml = readdirSync(fixtureDir)
    .filter((name) => name.endsWith('.xml') && !name.includes('swapped'))
    .sort();

  it.each(fixtureXml)('fixtures/%s', (name) => {
    const xml = readFileSync(new URL(name, fixtureDir), 'utf8');
    expect(orderFindings(xml), name).toEqual([]);
  });

  const sampleDir = new URL('./samples/', import.meta.url);
  const sampleXml = readdirSync(sampleDir)
    .filter((name) => name.endsWith('.xml'))
    .sort();

  it.each(sampleXml)('test/samples/%s', (name) => {
    const xml = readFileSync(new URL(name, sampleDir), 'utf8');
    expect(orderFindings(xml), name).toEqual([]);
  });

  const researchDir = '/workspace/myinvois-research/samples';
  if (existsSync(researchDir)) {
    const researchXml = readdirSync(researchDir)
      .filter((name) => name.endsWith('.xml'))
      .sort();
    it.each(researchXml)('research samples/%s', (name) => {
      const xml = readFileSync(`${researchDir}/${name}`, 'utf8');
      expect(orderFindings(xml), name).toEqual([]);
    });
  }

  it('check() on parseXml agrees with validateXml for the valid order fixture', () => {
    const xml = readFileSync(new URL('../fixtures/order-valid.xml', import.meta.url), 'utf8');
    expect(check(parseXml(xml))).toEqual([]);
    expect(orderFindings(xml)).toEqual([]);
  });
});
