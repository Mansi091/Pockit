jest.mock('@/lib/supabase', () => ({ requireSupabase: jest.fn() }));

import { contactsToCsv, EXPORT_HEADERS, exportFileName, groupByCategory, UNCATEGORISED, type SharedContact } from '@/services/teamService';

const contact = (over: Partial<SharedContact> = {}): SharedContact => ({
  id: 'c1',
  ownerId: 'u1',
  personName: 'Hemant Khurana',
  companyName: 'Everest Industries',
  designation: 'CEO',
  website: 'everestind.com',
  phones: [
    { label: 'mobile', number: '+91 98672 99476' },
    { label: 'fax', number: '+91 22 4000 9999' },
  ],
  emails: ['hemant@everestind.com'],
  addresses: [{ label: 'registered', fullAddress: '5 Park Street, Kolkata 700016' }],
  events: ['Pune Expo 2026'],
  categories: [{ id: 'k1', name: 'Clients', color: '#2563EB' }],
  savedAt: '2026-11-24T10:00:00.000Z',
  ...over,
});

const rows = (csv: string) => csv.replace(/^﻿/, '').split('\r\n');

describe('team export (CSV for Excel)', () => {
  it('starts with a BOM and a header row', () => {
    const csv = contactsToCsv([], () => 'x');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(rows(csv)).toEqual([EXPORT_HEADERS.join(',')]);
  });

  it('one row per contact with the employee who shared it', () => {
    const [, row] = rows(contactsToCsv([contact()], () => 'Priya Sharma'));
    expect(row).toBe(
      'Hemant Khurana,Everest Industries,Mobile: +91 98672 99476; Fax: +91 22 4000 9999,hemant@everestind.com,everestind.com,"Registered office: 5 Park Street, Kolkata 700016",Clients,CEO,Pune Expo 2026,2026-11-24,Priya Sharma',
    );
  });

  it('columns follow the dashboard order: name, company, number, email, website, address', () => {
    expect(EXPORT_HEADERS.slice(0, 6)).toEqual(['Name', 'Company', 'Contact number', 'Email', 'Website', 'Address']);
  });

  it('phone cells never start with "+" (Excel would treat them as formulas)', () => {
    const [, row] = rows(contactsToCsv([contact()], () => 'A'));
    expect(row!.split(',')[2]!.startsWith('Mobile:')).toBe(true);
  });

  it('quotes commas, quotes and line breaks', () => {
    const [, row] = rows(contactsToCsv([contact({ personName: 'Rao, "Ravi"\nK', phones: [], addresses: [], events: [] })], () => 'A'));
    expect(row).toContain('"Rao, ""Ravi""\nK"');
  });

  it('neutralises formula injection', () => {
    const [, row] = rows(contactsToCsv([contact({ personName: '=HYPERLINK("http://evil")', phones: [], addresses: [], events: [] })], () => '@me'));
    expect(row!.endsWith(",'@me")).toBe(true);
    expect(row).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  it('groups shared contacts by category: biggest first, "No category" last, a contact can be in two', () => {
    const clients = { id: 'a', name: 'Clients', color: '#111111' };
    const vendors = { id: 'b', name: 'Vendors', color: '#222222' };
    const clientsOfOtherMember = { id: 'z', name: 'clients ', color: '#333333' }; // same name, other person
    const groups = groupByCategory([
      contact({ id: '1', categories: [vendors] }),
      contact({ id: '2', categories: [clients, vendors] }),
      contact({ id: '3', categories: [clientsOfOtherMember] }),
      contact({ id: '4', categories: [] }),
    ]);
    expect(groups.map((g) => [g.name, g.contacts.map((c) => c.id)])).toEqual([
      ['Clients', ['2', '3']],
      ['Vendors', ['1', '2']],
      [UNCATEGORISED, ['4']],
    ]);
  });

  it('file names are safe', () => {
    expect(exportFileName('SFM / Supreme Facility', 'Mansii Madgule')).toMatch(/^SFM-Supreme-Facility-Mansii-Madgule-shared-contacts-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
