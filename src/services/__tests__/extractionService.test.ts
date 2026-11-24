import { extractContact } from '@/services/extractionService';
import type { OcrLine, OcrResult } from '@/types/contact';

/** Builds an OcrResult; `h` is the text height in px (bigger = larger font on the card). */
function card(rows: (string | [string, number])[]): OcrResult {
  const lines: OcrLine[] = rows.map((r, i) => {
    const [text, h] = typeof r === 'string' ? [r, 20] : r;
    return { text, frame: { left: 40, top: 40 + i * 50, width: text.length * 12, height: h } };
  });
  return { text: lines.map((l) => l.text).join('\n'), lines };
}
const plain = (text: string): OcrResult => ({ text, lines: [] });

describe('extractContact', () => {
  it('handles company-on-top layout with size information', () => {
    const { fields } = extractContact(
      card([
        ['NIMBUS TECHNOLOGIES PVT. LTD.', 34],
        ['Priya Sharma', 48],
        ['Senior Product Manager', 22],
        'M: +91 98765 43210',
        'T: 020 2567 8900',
        'priya.sharma@nimbustech.in',
        'www.nimbustech.in',
        '4th Floor, Tech Park, Baner, Pune 411045',
      ]),
    );
    expect(fields.personName).toBe('Priya Sharma');
    expect(fields.companyName).toBe('NIMBUS TECHNOLOGIES PVT. LTD.');
    expect(fields.designation).toBe('Senior Product Manager');
    expect(fields.phone).toBe('+91 98765 43210, 020 2567 8900');
    expect(fields.email).toBe('priya.sharma@nimbustech.in');
    expect(fields.website).toBe('www.nimbustech.in');
    expect(fields.address).toContain('Pune 411045');
  });

  it('does not assume the first line is the company (name-first layout, no positions)', () => {
    const { fields } = extractContact(
      plain(
        [
          'RAHUL MEHTA',
          'Regional Sales Head',
          'Apex Logistics',
          'Mob: 9123456789 | rahul.mehta@apexlogistics.com',
          'Andheri East, Mumbai - 400069',
        ].join('\n'),
      ),
    );
    expect(fields.personName).toBe('Rahul Mehta');
    expect(fields.designation).toBe('Regional Sales Head');
    expect(fields.companyName).toBe('Apex Logistics');
    expect(fields.phone).toBe('9123456789');
    expect(fields.email).toBe('rahul.mehta@apexlogistics.com');
    expect(fields.address).toContain('400069');
  });

  it('splits "Name, Designation" lines and leaves company blank when there is none', () => {
    const { fields } = extractContact(
      plain(['David Fernandes, Freelance Consultant', '+91 90000 11122', 'davidf@gmail.com', 'Panaji, Goa'].join('\n')),
    );
    expect(fields.personName).toBe('David Fernandes');
    expect(fields.designation).toBe('Freelance Consultant');
    expect(fields.companyName).toBeNull();
    expect(fields.address).toBe('Panaji, Goa');
  });

  it('repairs common OCR glitches in emails and websites', () => {
    const { fields } = extractContact(
      plain(['Ananya Iyer', 'UX Designer', 'E: ananya @ nimbustech . in', 'W: www. nimbustech.in'].join('\n')),
    );
    expect(fields.email).toBe('ananya@nimbustech.in');
    expect(fields.website).toBe('www.nimbustech.in');
    expect(fields.personName).toBe('Ananya Iyer');
  });

  it('collects multiple phone numbers and emails, puts mobiles first, fax last (typed as fax)', () => {
    const { fields } = extractContact(
      plain(
        [
          'Kiran Rao',
          'Director',
          'Tel: 022 4000 1234 / 022 4000 5678',
          'Fax: 022 4000 9999',
          'Mobile: 98200 12345',
          'kiran@raoassociates.in, info@raoassociates.in',
        ].join('\n'),
      ),
    );
    // Fax numbers are kept now (savable, type Fax) — always after the callable numbers.
    expect(fields.phone).toBe('98200 12345, 022 4000 1234, 022 4000 5678, 022 4000 9999');
    expect(fields.phones!.map((p) => p.label)).toEqual(['mobile', 'landline', 'landline', 'fax']);
    expect(fields.email).toBe('kiran@raoassociates.in, info@raoassociates.in');
  });

  it('handles a US-style card', () => {
    const { fields } = extractContact(
      card([
        ['Acme Corp', 30],
        ['John A. Smith', 40],
        'Chief Executive Officer',
        '1200 Market Street, Suite 400',
        'San Francisco, CA 94103',
        '(415) 555-0142',
        'john.smith@acmecorp.com',
      ]),
    );
    expect(fields.personName).toBe('John A. Smith');
    expect(fields.companyName).toBe('Acme Corp');
    expect(fields.designation).toBe('Chief Executive Officer');
    expect(fields.phone).toBe('(415) 555-0142');
    expect(fields.address).toBe('1200 Market Street, Suite 400, San Francisco, CA 94103');
  });

  it('does not invent fields from unreadable text', () => {
    const { fields } = extractContact(plain('~~ ,. ;; \n ii\n'));
    expect(fields).toEqual({
      personName: '',
      companyName: null,
      designation: null,
      phone: null,
      email: null,
      website: null,
      address: null,
      phones: [],
      addresses: [],
    });
  });

  it('does not treat dates or PIN codes as phone numbers', () => {
    const { fields } = extractContact(plain(['Meera Nair', 'Valid till 12/05/2027', 'Kochi 682016'].join('\n')));
    expect(fields.phone).toBeNull();
  });

  it('flags an uncertain name for review', () => {
    // Two equally plausible names, no email/designation evidence.
    const { fields, lowConfidence } = extractContact(plain(['Arjun Kapoor', 'Neha Gupta'].join('\n')));
    expect(fields.personName).not.toBe('');
    expect(lowConfidence).toContain('personName');
  });

  it('uses layout and email evidence to identify a name generically', () => {
    const { fields, lowConfidence } = extractContact(
      card([
        ['Global Sample Industries Pvt. Ltd.', 30],
        ['Alex Morgan', 44],
        ['Managing Director', 24],
        'alex.morgan@globalsample.com',
        'www.globalsample.com',
      ]),
    );
    expect(fields.personName).toBe('Alex Morgan');
    expect(fields.companyName).toBe('Global Sample Industries Pvt. Ltd.');
    expect(fields.designation).toBe('Managing Director');
    expect(lowConfidence).not.toContain('personName');
  });
});
