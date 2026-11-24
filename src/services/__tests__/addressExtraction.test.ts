import { groupAddresses, parseAddressParts, readAddressLabel, summariseAddresses } from '@/services/addressExtraction';
import { extractContact } from '@/services/extractionService';
import type { OcrResult } from '@/types/contact';

const plain = (rows: string[]): OcrResult => ({ text: rows.join('\n'), lines: [] });
const lines = (rows: string[]) => rows.map((text, idx) => ({ idx, text }));

describe('1. One address', () => {
  it('keeps the full address and reads PIN, city, state, country', () => {
    const [a, ...rest] = groupAddresses(
      lines(['Opp. Railway Station, Dewas - 455 001', '(Madhya Pradesh) INDIA']),
    );
    expect(rest).toEqual([]);
    expect(a).toMatchObject({
      label: 'other',
      fullAddress: 'Opp. Railway Station, Dewas - 455 001, (Madhya Pradesh) INDIA',
      postalCode: '455001',
      city: 'Dewas',
      state: 'Madhya Pradesh',
      country: 'India',
    });
  });
});

describe('2. Two labelled addresses (registered office + factory)', () => {
  it('splits them and keeps each label', () => {
    const out = groupAddresses(
      lines([
        'Regd. Office: 401, Lodha Supremus, Lower Parel, Mumbai 400013',
        'Factory: Plot 22, MIDC Chakan, Pune 410501, Maharashtra',
      ]),
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ label: 'registered', postalCode: '400013', city: 'Mumbai' });
    expect(out[0]!.fullAddress).toBe('401, Lodha Supremus, Lower Parel, Mumbai 400013'); // label words removed
    expect(out[1]).toMatchObject({ label: 'factory', postalCode: '410501', city: 'Pune', state: 'Maharashtra', country: 'India' });
  });

  it('a label on its own line starts a block for the lines below it', () => {
    const out = groupAddresses(lines(['Registered Office:', '12 MG Road', 'Bengaluru 560001', 'Works -', 'Survey No. 4, Hosur 635109']));
    expect(out.map((a) => a.label)).toEqual(['registered', 'factory']);
    expect(out[0]!.fullAddress).toBe('12 MG Road, Bengaluru 560001');
  });
});

describe('3. Three or more addresses', () => {
  it('keeps every block, no limit', () => {
    const out = groupAddresses(
      lines([
        'Regd. Office: 5 Park Street, Kolkata 700016',
        'Corporate Office: Tower B, DLF Cyber City, Gurugram 122002',
        'Branch Office: 3rd Floor, Anna Salai, Chennai 600002',
        'Warehouse: Gala 7, Bhiwandi 421302',
      ]),
    );
    expect(out.map((a) => a.label)).toEqual(['registered', 'corporate', 'branch', 'warehouse']);
    expect(out.map((a) => a.postalCode)).toEqual(['700016', '122002', '600002', '421302']);
  });
});

describe('4–5. Addresses without labels', () => {
  it('two addresses separated by other text become two "Other" addresses', () => {
    const out = groupAddresses([
      { idx: 3, text: '14 Residency Road' },
      { idx: 4, text: 'Bengaluru 560025' },
      { idx: 7, text: '22 Linking Road' },
      { idx: 8, text: 'Mumbai 400050' },
    ]);
    expect(out.map((a) => [a.label, a.postalCode])).toEqual([
      ['other', '560025'],
      ['other', '400050'],
    ]);
  });

  it('two addresses back to back are split at the second PIN', () => {
    const out = groupAddresses(lines(['12 MG Road, Pune 411001', '5 FC Road, Pune 411004']));
    expect(out).toHaveLength(2);
  });
});

describe('6. Incomplete addresses', () => {
  it('kept as printed, nothing invented', () => {
    const [a] = groupAddresses(lines(['Near Bus Stand, Shivaji Nagar']));
    expect(a).toMatchObject({ fullAddress: 'Near Bus Stand, Shivaji Nagar', postalCode: null, city: null, state: null, country: null });
  });

  it('flagged for the user to check', () => {
    const { lowConfidence } = extractContact(plain(['Ravi Kumar', 'Sales Head', 'Near Bus Stand, Shivaji Nagar, Opp. Market']));
    expect(lowConfidence).toContain('address');
  });
});

describe('7. Duplicate addresses', () => {
  it('the same address printed twice is kept once', () => {
    const out = groupAddresses([
      { idx: 1, text: '12 MG Road, Pune 411001' },
      { idx: 5, text: '12 MG Road, Pune - 411001' },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('labels are not invented from job titles or street names', () => {
  it.each(['Branch Manager', 'Factory Head', 'Plant Engineer', 'Works Supervisor'])('"%s" is not an address label', (t) => {
    expect(readAddressLabel(t)).toBeNull();
  });
  it('"Office No. 12, Shivaji Road" is a street, not an "Office" label', () => {
    expect(readAddressLabel('Office No. 12, Shivaji Road')).toBeNull();
  });
  it('"Branches in Pune" is not a label', () => {
    expect(readAddressLabel('Branches in Pune, Mumbai')).toBeNull();
  });
});

describe('international formats', () => {
  it('US ZIP with state code', () => {
    expect(parseAddressParts('1200 Market Street, Suite 400, San Francisco, CA 94103')).toMatchObject({
      postalCode: '94103',
      state: 'CA',
      city: 'San Francisco',
    });
  });
});

describe('whole card: phones, emails and websites never end up in an address', () => {
  it('two addresses + numbers + email on one card', () => {
    const { fields } = extractContact(
      plain([
        'Sunil Mehta',
        'Managing Director',
        'Mehta Engineering Pvt. Ltd.',
        'Regd. Office: 401, Lodha Supremus, Lower Parel, Mumbai 400013',
        'Tel: +91 22 4000 1234  Fax: +91 22 4000 9999',
        'Factory: Plot 22, MIDC Chakan, Pune 410501',
        'sunil@mehtaeng.in  www.mehtaeng.in',
      ]),
    );
    expect(fields.addresses!.map((a) => a.label)).toEqual(['registered', 'factory']);
    for (const a of fields.addresses!) {
      expect(a.fullAddress).not.toMatch(/4000 1234|4000 9999|Tel|Fax|@|www/);
    }
    expect(fields.address).toBe(summariseAddresses(fields.addresses!));
    expect(fields.phones!.map((p) => p.label)).toEqual(['landline', 'fax']);
  });
});
