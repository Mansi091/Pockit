type RetryModule = {
  fetchGeminiWith503Retry: (
    send: () => Promise<Response>,
    options?: {
      maxRetries?: number;
      baseDelayMs?: number;
      maxDelayMs?: number;
      jitterMs?: number;
      random?: () => number;
      sleep?: (ms: number) => Promise<void>;
      onRetry?: (response: Response, attempt: number, retryInMs: number) => void | Promise<void>;
    },
  ) => Promise<{ response: Response; attempts: number }>;
  geminiErrorDiagnostics: (response: Response) => Promise<Record<string, unknown>>;
  geminiUnavailableResponse: () => Response;
  orderGeminiModels: (models: { name: string; supportedGenerationMethods?: string[] }[], limit?: number) => string[];
};

let edge: RetryModule;

beforeAll(() => {
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: { serve: jest.fn(), env: { get: jest.fn() } },
  });
  edge = require('../index') as RetryModule;
});

afterAll(() => {
  delete (globalThis as typeof globalThis & { Deno?: unknown }).Deno;
});

describe('scan-card Gemini resilience', () => {
  it('retries temporary 503s with bounded exponential backoff and jitter, then succeeds', async () => {
    const send = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'try again' } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'try again' } }), { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const delays: number[] = [];
    const retries = jest.fn();

    const result = await edge.fetchGeminiWith503Retry(send, {
      baseDelayMs: 100,
      maxDelayMs: 500,
      jitterMs: 100,
      random: () => 0.5,
      sleep: async (ms) => { delays.push(ms); },
      onRetry: retries,
    });

    expect(result.response.status).toBe(200);
    expect(result.attempts).toBe(3);
    expect(send).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([150, 250]);
    expect(retries).toHaveBeenCalledTimes(2);
  });

  it('stops after three total attempts when Gemini remains unavailable', async () => {
    const send = jest.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    const delays: number[] = [];

    const result = await edge.fetchGeminiWith503Retry(send, {
      sleep: async (ms) => { delays.push(ms); },
      random: () => 0,
    });

    expect(result.response.status).toBe(503);
    expect(result.attempts).toBe(3);
    expect(send).toHaveBeenCalledTimes(3);
    expect(delays).toHaveLength(2);
  });

  it('does not retry permanent errors or rate limits', async () => {
    const send = jest.fn().mockResolvedValue(new Response('{}', { status: 400 }));
    const result = await edge.fetchGeminiWith503Retry(send, { sleep: jest.fn() });

    expect(result.response.status).toBe(400);
    expect(result.attempts).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('logs only whitelisted, redacted Gemini error details', async () => {
    const response = new Response(JSON.stringify({
      error: {
        code: 503,
        status: 'UNAVAILABLE',
        message: 'key AIza123456789012345678901234567890 email jane@example.com phone +1 202-555-0123 Bearer secret-token ' + 'A'.repeat(100),
      },
      authorization: 'secret-token',
      image: 'sensitive-image-data',
    }), { status: 503, headers: { 'content-type': 'application/json' } });

    const details = await edge.geminiErrorDiagnostics(response);
    const serialized = JSON.stringify(details);

    expect(details.code).toBe(503);
    expect(details.providerStatus).toBe('UNAVAILABLE');
    expect(serialized).toContain('[REDACTED_API_KEY]');
    expect(serialized).toContain('[REDACTED_EMAIL]');
    expect(serialized).toContain('[REDACTED_NUMBER]');
    expect(serialized).toContain('Bearer [REDACTED]');
    expect(serialized).toContain('[REDACTED_BASE64]');
    expect(serialized).not.toContain('sensitive-image-data');
    expect(serialized).not.toContain('secret-token');
  });

  it('returns a clear temporary-unavailable response to the frontend', async () => {
    const response = edge.geminiUnavailableResponse();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe('gemini_unavailable');
    expect(body.error).toMatch(/temporarily unavailable/i);
  });

  it('falls back across stable models: newest Flash first, then older Flash, then Flash-Lite; never previews', () => {
    const gen = ['generateContent'];
    const order = edge.orderGeminiModels([
      { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: gen },
      { name: 'models/gemini-3.5-flash', supportedGenerationMethods: gen },
      { name: 'models/gemini-3.5-flash-preview-11-2026', supportedGenerationMethods: gen },
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: gen },
      { name: 'models/gemini-3.5-pro', supportedGenerationMethods: gen },
      { name: 'models/gemini-3.0-flash', supportedGenerationMethods: ['embedContent'] },
    ]);
    expect(order).toEqual(['models/gemini-3.5-flash', 'models/gemini-2.5-flash', 'models/gemini-2.5-flash-lite']);
  });
});
