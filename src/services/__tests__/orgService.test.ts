jest.mock('@/lib/supabase', () => ({ requireSupabase: jest.fn() }));
jest.mock('@/database/db', () => ({ getDb: jest.fn(), getCurrentUserId: jest.fn() }));
jest.mock('@/services/syncService', () => ({ requestSync: jest.fn() }));

import { normaliseInviteCode, validateDisplayName, validateInviteCode, validateOrgName } from '@/services/orgService';

describe('company form validation', () => {
  it('accepts 8-character invite codes typed any way', () => {
    expect(normaliseInviteCode(' 7f3a-9c21 ')).toBe('7F3A9C21');
    expect(validateInviteCode('7f3a 9c21')).toBeNull();
    expect(validateInviteCode('ABC')).toMatch(/8/);
  });

  it('checks company and display names', () => {
    expect(validateOrgName('A')).toMatch(/company name/);
    expect(validateOrgName('Supreme Facility')).toBeNull();
    expect(validateOrgName('x'.repeat(81))).toMatch(/80/);
    expect(validateDisplayName('  ')).toMatch(/name/);
    expect(validateDisplayName('Mansi')).toBeNull();
  });
});
