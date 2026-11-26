import { requireSupabase } from '@/lib/supabase';
import { prepareImage, ImagePreparationError } from '@/web/overrides/services/imageService';
import { recognizeText } from '@/web/overrides/services/ocrService';

jest.mock('@/config/env', () => ({ isSupabaseConfigured: true }));
jest.mock('@/lib/supabase', () => ({ requireSupabase: jest.fn() }));
jest.mock('@/web/overrides/services/imageService', () => {
  class MockImagePreparationError extends Error {
    stage: string;
    constructor(stageName: string, message: string) {
      super(message);
      this.stage = stageName;
    }
  }
  return { ImagePreparationError: MockImagePreparationError, prepareImage: jest.fn() };
});

const jpeg = `data:image/jpeg;base64,${'A'.repeat(128)}`;
const mockInvoke = jest.fn();

describe('web OCR image normalization and response handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prepareImage as jest.Mock).mockResolvedValue({ uri: jpeg, width: 1200, height: 800 });
    (requireSupabase as jest.Mock).mockReturnValue({ functions: { invoke: mockInvoke } });
  });

  it('normalizes a picker blob URL to JPEG before invoking scan-card', async () => {
    mockInvoke.mockResolvedValue({ data: { lines: ['Ada Lovelace'], fields: { personName: 'Ada Lovelace' } }, error: null });

    const result = await recognizeText('blob:https://pockit-theta.vercel.app/photo-id');

    expect(prepareImage).toHaveBeenCalledWith('blob:https://pockit-theta.vercel.app/photo-id', {
      maxDimension: 2000,
      compress: 0.88,
      maxBase64Length: 5_500_000,
    });
    expect(mockInvoke).toHaveBeenCalledWith('scan-card', {
      body: { image: 'A'.repeat(128), mimeType: 'image/jpeg' },
    });
    expect(result.fields?.personName).toBe('Ada Lovelace');
  });

  it('does not silently pass an undecodable HEIC/blob URL to Supabase', async () => {
    (prepareImage as jest.Mock).mockRejectedValue(
      new ImagePreparationError('decoding', 'Safari could not open this photo. Export it as JPEG.'),
    );

    await expect(recognizeText('blob:picker-photo')).rejects.toThrow('Export it as JPEG');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('identifies expired Supabase authentication separately', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { context: { status: 401 } } });

    await expect(recognizeText('blob:picker-photo')).rejects.toThrow('Sign in again');
  });

  it('passes multiple phone numbers and labeled addresses to the review fields', async () => {
    const phones = [{ raw: '+1 212 555 0100', label: 'office', extension: '42' }];
    const addresses = [{ label: 'branch', fullAddress: '10 Main St, New York', city: 'New York', state: 'NY', country: 'US', postalCode: '10001' }];
    mockInvoke.mockResolvedValue({ data: { lines: ['Contact'], fields: { phones, addresses } }, error: null });

    const result = await recognizeText('blob:picker-photo');

    expect(result.fields?.phones).toEqual(phones);
    expect(result.fields?.addresses).toEqual(addresses);
  });

  it('keeps multiple emails and websites in the review-screen field values', async () => {
    mockInvoke.mockResolvedValue({
      data: { lines: [], fields: { email: 'ada@example.com, hello@example.com', website: 'example.com, example.org' } },
      error: null,
    });

    const result = await recognizeText('blob:picker-photo');

    expect(result.fields?.email).toBe('ada@example.com, hello@example.com');
    expect(result.fields?.website).toBe('example.com, example.org');
  });
});
