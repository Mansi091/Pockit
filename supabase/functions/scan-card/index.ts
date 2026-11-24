// Pockit — Edge Function `scan-card` (used by the WEB app; phones read cards on-device).
//
// POST { image: <base64 JPEG/PNG, no data: prefix>, mimeType: "image/jpeg" }
//   → { lines: string[], fields: { personName, companyName, designation, phone, email, website, address } }
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

let cachedModel: string | null = null;

/** Newest stable flash model this key can call (e.g. models/gemini-3.5-flash), unless GEMINI_MODEL is set. */
async function pickModel(key: string): Promise<string> {
  const pinned = Deno.env.get('GEMINI_MODEL');
  if (pinned) return pinned.startsWith('models/') ? pinned : `models/${pinned}`;
  if (cachedModel) return cachedModel;
  const res = await fetch(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
  if (!res.ok) throw new Error(`Could not list Gemini models (${res.status}). Check GEMINI_API_KEY.`);
  const { models = [] } = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const stable = models
    .map((m) => ({ m, v: /^models\/gemini-(\d+(?:\.\d+)?)-flash$/.exec(m.name)?.[1] }))
    .filter((x) => x.v && x.m.supportedGenerationMethods?.includes('generateContent'))
    .sort((a, b) => Number(b.v) - Number(a.v));
  if (!stable.length) throw new Error('No stable Gemini Flash model is available for this key. Set the GEMINI_MODEL secret.');
  cachedModel = stable[0]!.m.name;
  return cachedModel;
}

const PROMPT = `You are reading a photo of a business card (possibly both sides, possibly rotated).
Return JSON only, following the schema.
- "lines": every line of text exactly as printed, top to bottom.
- Fields: copy values EXACTLY as printed. Never guess or invent. Use "" when a field is not on the card.
- personName: the person's name only (no title like "Mr."), not the company.
- companyName: the organisation's name.
- designation: the job title.
- phones: every phone number as printed, INCLUDING any country code like +91. Exclude fax numbers.
- emails: every email address.
- website: the website (without "Website:" labels).
- address: the full postal address on one line, parts separated by ", ".`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    lines: { type: 'ARRAY', items: { type: 'STRING' } },
    personName: { type: 'STRING' },
    companyName: { type: 'STRING' },
    designation: { type: 'STRING' },
    phones: { type: 'ARRAY', items: { type: 'STRING' } },
    emails: { type: 'ARRAY', items: { type: 'STRING' } },
    website: { type: 'STRING' },
    address: { type: 'STRING' },
  },
  required: ['lines', 'personName', 'companyName', 'designation', 'phones', 'emails', 'website', 'address'],
};

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
  const who = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: appKey } });
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

  // 3. Ask Gemini.
  try {
    const model = await pickModel(geminiKey);
    const res = await fetch(`${API}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: image } }, { text: PROMPT }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    });
    if (res.status === 429) return json({ error: 'Too many scans right now (Gemini free limit). Try again in a minute.' }, 429);
    if (!res.ok) {
      console.error('Gemini error', res.status, await res.text());
      return json({ error: 'The card could not be read. Please try again.' }, 502);
    }
    const out = await res.json();
    const text: string = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    const r = JSON.parse(text || '{}');
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

    return json({
      lines: list(r.lines),
      fields: {
        personName: str(r.personName),
        companyName: str(r.companyName),
        designation: str(r.designation),
        phone: list(r.phones).join(', '),
        email: list(r.emails).join(', '),
        website: str(r.website),
        address: str(r.address),
      },
    });
  } catch (e) {
    console.error('scan-card failed', e);
    return json({ error: e instanceof Error ? e.message : 'The card could not be read.' }, 500);
  }
});
