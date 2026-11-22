const mockScan = jest.fn();
jest.mock('react-native-document-scanner-plugin', () => ({ __esModule: true, default: { scanDocument: (...a: unknown[]) => mockScan(...a) } }));
jest.mock('@/lib/runtime', () => ({ isExpoGo: false }));

import { Image, TurboModuleRegistry } from 'react-native';
import { isDocumentScannerAvailable, scanCardAutomatically, scanCardsAutomatically, ScannerUnavailableError } from '@/services/documentScannerService';

describe('documentScannerService', () => {
  beforeEach(() => {
    mockScan.mockReset();
    jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue({} as never);
    jest.spyOn(Image, 'getSize').mockImplementation((_uri, ok) => ok(1600, 1000));
  });
  afterEach(() => jest.restoreAllMocks());

  it('is unavailable when the native module is missing (Expo Go)', async () => {
    jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue(null);
    expect(isDocumentScannerAvailable()).toBe(false);
    await expect(scanCardAutomatically()).rejects.toBeInstanceOf(ScannerUnavailableError);
  });

  it('returns the cropped card image with its size', async () => {
    mockScan.mockResolvedValue({ status: 'success', scannedImages: ['file:///cache/card.jpg'] });
    await expect(scanCardAutomatically()).resolves.toEqual({ uri: 'file:///cache/card.jpg', width: 1600, height: 1000 });
    expect(mockScan).toHaveBeenCalledWith({ maxNumDocuments: 1, croppedImageQuality: 95 });
  });

  it('returns null when the user cancels', async () => {
    mockScan.mockResolvedValue({ status: 'cancel' });
    await expect(scanCardAutomatically()).resolves.toBeNull();
  });

  it('turns scanner failures (e.g. no Play services) into ScannerUnavailableError so the UI offers manual crop', async () => {
    mockScan.mockRejectedValue(new Error('Google Play services not available'));
    await expect(scanCardAutomatically()).rejects.toThrow('Google Play services not available');
    await expect(scanCardAutomatically()).rejects.toBeInstanceOf(ScannerUnavailableError);
  });

  it('batch mode returns every scanned card, in order', async () => {
    mockScan.mockResolvedValue({ status: 'success', scannedImages: ['file:///a.jpg', 'file:///b.jpg', 'file:///c.jpg'] });
    const cards = await scanCardsAutomatically(20);
    expect(cards.map((c) => c.uri)).toEqual(['file:///a.jpg', 'file:///b.jpg', 'file:///c.jpg']);
    expect(mockScan).toHaveBeenCalledWith({ maxNumDocuments: 20, croppedImageQuality: 95 });
  });

  it('batch mode returns [] on cancel', async () => {
    mockScan.mockResolvedValue({ status: 'cancel' });
    await expect(scanCardsAutomatically(20)).resolves.toEqual([]);
  });
});
