import { extractContact } from '@/services/extractionService';
import { fixMisreadPlus } from '@/utils/phone';
import type { OcrResult } from '@/types/contact';

/** Real-world OCR mistakes (Everest card, 2026-11-19): "@" read as letters, "+" read as "4". */
const plain = (rows: string[]): OcrResult => ({ text: rows.join('\n'), lines: [] });

const everest = (emailLine: string, phoneLine = 'M +91 9867299476', web = 'www.everestind.com') =>
  extractContact(plain(['everest', 'Hemant Khurana', 'Managing Director & CEO', phoneLine, emailLine, web].filter(Boolean)));

describe('misread "@" in emails', () => {
  it.each([
    'E Hemant.Khuranaldeverestind.com', // @ → "ld"
    'E Hemant.Khuranadeverestind.com', //  @ → "d"
    'E Hemant. Khuranaldeverestind.com', // stray space after the dot
    'E: Hemant.Khurana(a)everestind.com', // @ → "(a)"
    'Hemant.Khuranaldeverestind.com', // no "E" label, but the website domain gives it away
  ])('rebuilds %s', (line) => {
    const { fields, lowConfidence } = everest(line);
    expect(fields.email).toBe('hemant.khurana@everestind.com');
    expect(fields.website).toBe('www.everestind.com');
    expect(lowConfidence).toContain('email'); // the user is asked to check it
  });

  it('works without a website line when the email is labelled', () => {
    const { fields } = everest('E Hemant.Khuranaldeverestind.com', 'M +91 9867299476', '');
    expect(fields.email).toBe('hemant.khurana@everestind.com');
    expect(fields.website).toBeNull();
  });

  it('handles initial + surname local parts', () => {
    const { fields } = everest('E hkhuranaldeverestind.com');
    expect(fields.email).toBe('hkhurana@everestind.com');
  });

  it('leaves correct emails and real subdomains alone', () => {
    expect(everest('E Hemant.Khurana@everestind.com').fields.email).toBe('hemant.khurana@everestind.com');
    const { fields } = everest('shop.everestind.com');
    expect(fields.email).toBeNull();
  });

  it('does not invent an email from an unlabelled unrelated domain', () => {
    const { fields } = extractContact(plain(['Hemant Khurana', 'CEO', 'www.everestind.com', 'partnersite.com']));
    expect(fields.email).toBeNull();
    expect(fields.website).toBe('www.everestind.com');
  });
});

describe('misread "+" in phone numbers', () => {
  it('fixes "491 9867299476" to +91', () => {
    expect(fixMisreadPlus('491 9867299476')).toBe('+91 98672 99476');
    const { fields } = everest('E Hemant.Khurana@everestind.com', 'M 491 9867299476');
    expect(fields.phone).toBe('+91 98672 99476');
  });

  it('leaves valid numbers alone', () => {
    expect(fixMisreadPlus('+91 98672 99476')).toBeNull();
    expect(fixMisreadPlus('98672 99476')).toBeNull();
    expect(fixMisreadPlus('020 2567 8900')).toBeNull();
    expect(fixMisreadPlus('44 20 7946 0958')).toBeNull(); // no leading 4-as-plus pattern that validates
  });
});
