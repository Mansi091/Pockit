import { ImagePreparationError, prepareImage } from '@/web/overrides/services/imageService';

describe('web image normalization', () => {
  let canvasFactory: jest.Mock;
  let drawImage: jest.Mock;
  let encoder: jest.Mock;

  beforeEach(() => {
    drawImage = jest.fn();
    encoder = jest.fn(() => `data:image/jpeg;base64,${'A'.repeat(32)}`);
    canvasFactory = jest.fn(() => ({
      width: 0,
      height: 0,
      getContext: () => ({ translate: jest.fn(), rotate: jest.fn(), drawImage }),
      toDataURL: encoder,
    }));
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        Image: class {
          naturalWidth = 4000;
          naturalHeight = 3000;
          onload?: () => void;
          onerror?: () => void;
          decoding = '';
          crossOrigin?: string;
          set src(_value: string) { queueMicrotask(() => this.onload?.()); }
        },
      },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: canvasFactory },
    });
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { document?: unknown }).document;
  });

  it('turns a blob URL into a bounded JPEG and bakes in requested rotation', async () => {
    const result = await prepareImage('blob:iphone-photo', { maxDimension: 2000, rotate: 90 });

    expect(result.uri).toMatch(/^data:image\/jpeg;base64,/);
    expect(result.width).toBe(1500);
    expect(result.height).toBe(2000);
    expect(drawImage).toHaveBeenCalled();
  });

  it('fails clearly when Safari cannot decode a HEIC/HEIF photo', async () => {
    class UndecodableImage {
      naturalWidth = 0;
      naturalHeight = 0;
      onload?: () => void;
      onerror?: () => void;
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    }
    Object.defineProperty(window, 'Image', { configurable: true, value: UndecodableImage });

    await expect(prepareImage('blob:iphone-heic')).rejects.toMatchObject({
      name: 'ImagePreparationError',
      stage: 'decoding',
      message: expect.stringContaining('export or share it as JPEG'),
    });
    expect(canvasFactory).not.toHaveBeenCalled();
  });

  it('rejects invalid JPEG encoder output instead of returning a raw URI', async () => {
    encoder.mockReturnValue('data:,');

    await expect(prepareImage('blob:photo')).rejects.toBeInstanceOf(ImagePreparationError);
  });

  it('reduces quality or dimensions until the JPEG fits the request budget', async () => {
    encoder.mockReturnValueOnce(`data:image/jpeg;base64,${'A'.repeat(12)}`);
    encoder.mockReturnValue(`data:image/jpeg;base64,${'B'.repeat(6)}`);

    const result = await prepareImage('blob:large-photo', { maxBase64Length: 8 });

    expect(result.uri.slice(result.uri.indexOf(',') + 1).length).toBeLessThanOrEqual(8);
    expect(encoder).toHaveBeenCalledTimes(2);
  });
});
