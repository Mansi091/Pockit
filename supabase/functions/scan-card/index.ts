// Pockit — Edge Function `scan-card` (used by the WEB app; phones read cards on-device).
//
// POST { image: <base64 JPEG/PNG, no data: prefix>, mimeType: "image/jpeg" }
//   → { lines: string[], fields: { personName, companyName, designation, phone, email, website, address,
//                                    phones: [{ raw, label, extension }], addresses: [{ label, fullAddress, city, state, country, postalCode }] } }
//
// Security
//   • Only signed-in Pockit users: the caller's access token is checked with Supabase Auth.
//   • The Gemini key is read from the function's secrets (GEMINI_API_KEY). It never
//     reaches the browser. Optional secret GEMINI_MODEL pins a model; otherwise the
//     newest stable "gemini-<version>-flash" model your key can use is picked.
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → Via editor,
// name it `scan-card`, paste this file, Deploy. Then Edge Functions → Secrets → GEMINI_API_KEY.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const API = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_BASE64 = 6_000_000; // ≈4.5 MB image
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const GEMINI_503_MAX_RETRIES = 2; // 3 attempts total
const GEMINI_RETRY_BASE_MS = 300;
const GEMINI_RETRY_MAX_MS = 1_000;
const GEMINI_RETRY_JITTER_MS = 250;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MAX_MODELS = 3; // the newest model is often overloaded (503): fall back to up to 2 others

let cachedModels: string[] | null = null;

/**
 * Stable Gemini models to try, best first: every "gemini-<v>-flash" (newest
 * first), then "gemini-<v>-flash-lite" (newest first). Previews/experiments are
 * never used. Pure, so it can be unit-tested.
 */
export function orderGeminiModels(models: { name: string; supportedGenerationMethods?: string[] }[], limit = MAX_MODELS): string[] {
  return models
    .map((m) => {
      const hit = /^models\/gemini-(\d+(?:\.\d+)?)-flash(-lite)?$/.exec(m.name);
      return hit && m.supportedGenerationMethods?.includes('generateContent')
        ? { name: m.name, version: Number(hit[1]), lite: !!hit[2] }
        : null;
    })
    .filter((x): x is { name: string; version: number; lite: boolean } => !!x)
    .sort((a, b) => Number(a.lite) - Number(b.lite) || b.version - a.version)
    .slice(0, limit)
    .map((x) => x.name);
}

/**
 * Models to try for this request. GEMINI_MODEL (if set) goes first; the
 * automatic list follows it as a fallback so one overloaded model never
 * stops card reading.
 */
async function pickModels(key: string): Promise<string[]> {
  const pinnedRaw = Deno.env.get('GEMINI_MODEL');
  const pinned = pinnedRaw ? (pinnedRaw.startsWith('models/') ? pinnedRaw : `models/${pinnedRaw}`) : null;
  if (!cachedModels) {
    try {
      const res = await fetch(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
      if (!res.ok) throw new Error(`Could not list Gemini models (${res.status}). Check GEMINI_API_KEY.`);
      const { models = [] } = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      cachedModels = orderGeminiModels(models);
    } catch (e) {
      if (!pinned) throw e;
      cachedModels = [];
    }
  }
  const list = pinned ? [pinned, ...cachedModels.filter((m) => m !== pinned)] : cachedModels;
  if (!list.length) throw new Error('No stable Gemini Flash model is available for this key. Set the GEMINI_MODEL secret.');
  return list.slice(0, MAX_MODELS);
}

const PROMPT = `You are reading a photo of a business card (possibly both sides, possibly rotated).
Return JSON only, following the schema.
- "lines": every line of text exactly as printed, top to bottom.
- Fields: copy values EXACTLY as printed. Never guess or invent. Use "" when a field is not on the card.
- personName: the person's name only (no title like "Mr."), not the company.
- companyName: the organisation's name.
- designation: the job title.
- phones: EVERY number on the card, including fax numbers, each as its own item:
    number    = digits as printed INCLUDING any country/area code (e.g. "+91-44 42235400"); leave out
                notes like "(D)" and the extension.
    type      = what the card calls it: "mobile", "landline" (Tel/Ph/Board), "office", "direct" (D/Direct),
                "fax", "whatsapp", or "" when the card gives no label. Do not guess.
    extension = digits after "Ext"/"Extn"/"x", else "".
  "Fax: 228747, 227343" with one shared prefix = two numbers: write the second one in full with the same prefix.
- emails: every email address.
- websites: every website/URL, each as its own string and without "Website:" labels.
- addresses: EVERY separate postal address on the card, each as its own item (do not merge them):
    label       = "registered", "corporate", "head", "branch", "regional", "factory" (also works/plant),
                  "warehouse", "office", "home", or "other" when the card does not say.
    fullAddress = the complete address on one line, parts separated by ", ", without the label words.
    city, state, country, postalCode = only when printed on the card, else "".`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    lines: { type: 'ARRAY', items: { type: 'STRING' } },
    personName: { type: 'STRING' },
    companyName: { type: 'STRING' },
    designation: { type: 'STRING' },
    phones: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { number: { type: 'STRING' }, type: { type: 'STRING' }, extension: { type: 'STRING' } },
        required: ['number', 'type', 'extension'],
      },
    },
    emails: { type: 'ARRAY', items: { type: 'STRING' } },
    website: { type: 'STRING' },
    websites: { type: 'ARRAY', items: { type: 'STRING' } },
    addresses: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          fullAddress: { type: 'STRING' },
          city: { type: 'STRING' },
          state: { type: 'STRING' },
          country: { type: 'STRING' },
          postalCode: { type: 'STRING' },
        },
        required: ['label', 'fullAddress', 'city', 'state', 'country', 'postalCode'],
      },
    },
  },
  required: ['lines', 'personName', 'companyName', 'designation', 'phones', 'emails', 'website', 'websites', 'addresses'],
};

const PHONE_TYPES = ['mobile', 'landline', 'office', 'direct', 'fax', 'whatsapp'];
const ADDRESS_LABELS = ['registered', 'corporate', 'head', 'branch', 'regional', 'factory', 'warehouse', 'office', 'home', 'other'];

export interface GeminiRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (response: Response, attempt: number, retryInMs: number) => void | Promise<void>;
}

/** Retry only temporary Gemini 503s, with a hard cap of 3 total requests. */
export async function fetchGeminiWith503Retry(
  send: () => Promise<Response>,
  options: GeminiRetryOptions = {},
): Promise<{ response: Response; attempts: number }> {
  const maxRetries = Math.max(0, Math.min(2, options.maxRetries ?? GEMINI_503_MAX_RETRIES));
  const baseDelayMs = options.baseDelayMs ?? GEMINI_RETRY_BASE_MS;
  const maxDelayMs = options.maxDelayMs ?? GEMINI_RETRY_MAX_MS;
  const jitterMs = options.jitterMs ?? GEMINI_RETRY_JITTER_MS;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 1; ; attempt++) {
    const response = await send();
    if (response.status !== 503 || attempt > maxRetries) return { response, attempts: attempt };

    const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
    const retryInMs = exponential + Math.floor(Math.max(0, Math.min(0.999999, random())) * jitterMs);
    await options.onRetry?.(response, attempt, retryInMs);
    await sleep(retryInMs);
  }
}

/** Log only known Gemini error fields, never the raw provider response body. */
export async function geminiErrorDiagnostics(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get('content-type')?.split(';')[0]?.slice(0, 80) ?? 'unknown';
  try {
    const body = await response.clone().json() as { error?: { code?: unknown; status?: unknown; message?: unknown } };
    const error = body?.error;
    if (!error || typeof error !== 'object') return { contentType, body: 'omitted_unrecognized_error_shape' };
    const message = (typeof error.message === 'string' ? error.message : '')
      .replace(/AIza[\w-]{20,}/g, '[REDACTED_API_KEY]')
      .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
      .replace(/\b(?:\+?\d[\d\s().-]{6,}\d)\b/g, '[REDACTED_NUMBER]')
      .replace(/[A-Za-z0-9+/]{80,}={0,2}/g, '[REDACTED_BASE64]')
      .slice(0, 400);
    return {
      contentType,
      ...(typeof error.code === 'number' ? { code: error.code } : {}),
      ...(typeof error.status === 'string' && /^[A-Z_]{1,40}$/.test(error.status) ? { providerStatus: error.status } : {}),
      ...(message ? { message } : {}),
    };
  } catch {
    return { contentType, body: 'omitted_unparseable_error_body' };
  }
}

export function geminiUnavailableResponse(): Response {
  return json({
    error: 'Card reading is temporarily unavailable. Please wait a moment and try again.',
    code: 'gemini_unavailable',
  }, 503);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  // 1. Signed-in Pockit users only. Ask Supabase Auth who owns the access token,
  //    using the app's own public key from the request (works with legacy anon
  //    keys and the newer publishable keys alike).
  const authHeader = req.headers.get('Authorization') ?? '';
  const appKey = req.headers.get('apikey') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  if (!/^Bearer\s+\S+/i.test(authHeader) || !appKey || !supabaseUrl) return json({ error: 'Please sign in to scan cards.' }, 401);
  let who: Response;
  try {
    who = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: appKey } });
  } catch {
    console.error('scan-card auth lookup failed', { stage: 'auth_network' });
    return json({ error: 'Could not verify your sign-in. Check your connection and try again.', code: 'auth_unavailable' }, 503);
  }
  if (!who.ok) return json({ error: 'Please sign in to scan cards.' }, 401);

  // 2. Validate input.
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) return json({ error: 'Card reading is not configured: add the GEMINI_API_KEY secret.' }, 500);
  let body: { image?: unknown; mimeType?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const image = typeof body.image === 'string' ? body.image : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.toLowerCase() : '';
  if (!image || !/^[A-Za-z0-9+/=]+$/.test(image)) return json({ error: 'No image received.' }, 400);
  if (image.length > MAX_BASE64) return json({ error: 'Image is too large.' }, 413);
  if (!ALLOWED_TYPES.includes(mimeType)) return json({ error: 'Please use a JPG, PNG or WebP image.' }, 415);

  // 3. Select the model and submit only normalized image bytes + prompt.
  let models: string[];
  try {
    models = await pickModels(geminiKey);
  } catch {
    console.error('scan-card model selection failed', { stage: 'model_selection' });
    return json({ error: 'The card-reading service is unavailable. Please try again later.', code: 'model_unavailable' }, 502);
  }
  const requestBody = JSON.stringify({
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: image } }, { text: PROMPT }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
  });

  // Try each model in turn. A model that is overloaded (503) or not available
  // to this key (404) hands over to the next one; anything else is final.
  let res: Response | null = null;
  let model = models[0]!;
  let attempts = 0;
  for (const [i, candidate] of models.entries()) {
    model = candidate;
    try {
      const result = await fetchGeminiWith503Retry(
        () => fetch(`${API}/${candidate}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
          body: requestBody,
        }),
        {
          maxRetries: 1, // 2 tries per model; other models are the better retry
          onRetry: async (retryResponse, attempt, retryInMs) => {
            console.warn('scan-card Gemini temporary failure; retrying', {
              stage: 'gemini_http', model: candidate, status: retryResponse.status, attempt, retryInMs,
              providerError: await geminiErrorDiagnostics(retryResponse),
            });
          },
        },
      );
      res = result.response;
      attempts = result.attempts;
    } catch {
      console.error('scan-card Gemini request failed', { stage: 'gemini_network', model: candidate, attempt: attempts + 1 });
      return json({ error: 'Could not reach the card-reading service. Check your connection and try again.', code: 'gemini_network' }, 502);
    }
    const handOver = (res.status === 503 || res.status === 404) && i < models.length - 1;
    if (!handOver) break;
    console.warn('scan-card Gemini model unavailable; trying the next model', {
      stage: 'model_fallback', model: candidate, status: res.status, next: models[i + 1],
      providerError: await geminiErrorDiagnostics(res),
    });
  }
  if (!res) return geminiUnavailableResponse();
  if (!res.ok) {
    const providerError = await geminiErrorDiagnostics(res);
    console.error('scan-card Gemini request rejected', {
      stage: 'gemini_http', model, status: res.status, attempts, providerError,
    });
    if (res.status === 429) {
      return json({ error: 'Too many scans right now. Please wait a minute and try again.', code: 'rate_limited' }, 429);
    }
    if (res.status === 503) {
      return geminiUnavailableResponse();
    }
    return json({ error: 'The card could not be read. Please try again.', code: 'gemini_http' }, 502);
  }

  let out: { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  try {
    out = await res.json();
  } catch {
    console.error('scan-card Gemini response was not JSON', { stage: 'gemini_response_json' });
    return json({ error: 'The card-reading service returned an invalid response. Please try again.', code: 'gemini_response_json' }, 502);
  }
  const responseText = out?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  let r: Record<string, unknown>;
  try {
    r = JSON.parse(responseText || '{}') as Record<string, unknown>;
  } catch {
    console.error('scan-card Gemini structured response parse failed', { stage: 'structured_parse' });
    return json({ error: 'The card details could not be interpreted. Please retry or enter them manually.', code: 'structured_parse' }, 502);
  }

  try {
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
    const objects = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []) as Record<string, unknown>[];
    const orNull = (v: unknown) => str(v) || null;
    const phones = objects(r.phones)
      .map((p) => {
        const type = str(p.type).toLowerCase();
        const ext = str(p.extension).replace(/\D/g, '').slice(0, 10);
        return { raw: str(p.number), label: PHONE_TYPES.includes(type) ? type : null, extension: ext || null };
      })
      .filter((p) => p.raw.replace(/\D/g, '').length >= 6);
    const addresses = objects(r.addresses)
      .map((a) => {
        const label = str(a.label).toLowerCase();
        return {
          label: ADDRESS_LABELS.includes(label) ? label : 'other',
          fullAddress: str(a.fullAddress),
          city: orNull(a.city),
          state: orNull(a.state),
          country: orNull(a.country),
          postalCode: orNull(a.postalCode),
        };
      })
      .filter((a) => a.fullAddress);
    const websites = list(r.websites);
    if (!websites.length && str(r.website)) websites.push(str(r.website));

    return json({
      lines: list(r.lines),
      fields: {
        personName: str(r.personName),
        companyName: str(r.companyName),
        designation: str(r.designation),
        phone: phones.map((p) => (p.extension ? `${p.raw} ext. ${p.extension}` : p.raw)).join(', '),
        email: list(r.emails).join(', '),
        website: websites.join(', '),
        address: addresses.map((a) => a.fullAddress).join(' | '),
        phones,
        addresses,
      },
    });
  } catch {
    console.error('scan-card structured contact extraction failed', { stage: 'contact_extraction' });
    return json({ error: 'The card details could not be extracted. Please retry or enter them manually.', code: 'contact_extraction' }, 502);
  }
});
