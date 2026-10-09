/**
 * POST /api/contact — Vercel Serverless Function
 *
 * Receives the website inquiry form (JSON), validates it server-side and
 * delivers it by email through Resend (https://resend.com) to the Inter Ocean
 * inbox (default: info@interoceanco.com, a Google Workspace group).
 *
 * Environment variables (Vercel → Project → Settings → Environment Variables):
 *   RESEND_API_KEY   required  Resend API key ("Sending access" is enough)
 *   CONTACT_TO       optional  recipient(s), comma-separated   default: info@interoceanco.com
 *   CONTACT_FROM     optional  verified sender                default: Inter Ocean Website <website@interoceanco.com>
 *   ALLOWED_ORIGINS  optional  extra allowed origins, comma-separated (the site's own host is always allowed)
 *
 * Responses:
 *   200 { ok: true }                                   sent
 *   400 { error: 'validation', fields: { name: '…' } } invalid input
 *   403 { error: 'forbidden' }                         cross-site request
 *   405                                                 not POST
 *   429 { error: 'rate_limited' }                       too many submissions
 *   502 { error: 'delivery_failed' }                    Resend rejected / unreachable
 *   503 { error: 'not_configured' }                     RESEND_API_KEY missing
 */

import { createHash } from 'node:crypto';

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_TO = 'info@interoceanco.com';
const DEFAULT_FROM = 'Inter Ocean Website <website@interoceanco.com>';

const INQUIRY_TYPES = {
  product: 'Product Inquiry',
  supplier: 'Supplier Proposal',
  partnership: 'Business Partnership',
  general: 'General Inquiry',
};

const LIMITS = { name: 120, company: 160, email: 160, country: 80, interest: 160, quantity: 120, message: 4000 };
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

// Best-effort rate limit (per warm function instance): 5 submissions / 10 min / IP.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

const clean = (value, max) =>
  String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);

/** Single-line values must not carry line breaks (prevents header-style injection in subjects). */
const oneLine = (value) => value.replace(/\s+/g, ' ');

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function validate(body) {
  const d = {
    name: oneLine(clean(body.name, LIMITS.name)),
    company: oneLine(clean(body.company, LIMITS.company)),
    email: oneLine(clean(body.email, LIMITS.email)).toLowerCase(),
    country: oneLine(clean(body.country, LIMITS.country)),
    inquiryType: clean(body.inquiryType, 20),
    interest: oneLine(clean(body.interest, LIMITS.interest)),
    quantity: oneLine(clean(body.quantity, LIMITS.quantity)),
    message: clean(body.message, LIMITS.message),
    page: clean(body.page, 300),
  };
  const fields = {};
  if (!d.name) fields.name = 'Please enter your full name.';
  if (!d.company) fields.company = 'Please enter your company.';
  if (!EMAIL_RE.test(d.email)) fields.email = 'Please enter a valid business email, like name@company.com.';
  if (!d.country) fields.country = 'Please enter your country.';
  if (!INQUIRY_TYPES[d.inquiryType]) fields.inquiryType = 'Please choose the type of inquiry.';
  if (!d.interest) fields.interest = 'Please enter your product or business interest.';
  if (d.message.length < 20) fields.message = 'Your message should be at least 20 characters.';
  return { data: d, fields };
}

function buildEmail(d, meta) {
  const type = INQUIRY_TYPES[d.inquiryType];
  const rows = [
    ['Type of inquiry', type],
    ['Full name', d.name],
    ['Company', d.company],
    ['Business email', d.email],
    ['Country', d.country],
    ['Product or business interest', d.interest],
    ['Estimated quantity', d.quantity || '—'],
  ];

  const subject = `[Website] ${type} — ${d.company} (${d.name})`.slice(0, 200);

  const text = [
    `New ${type.toLowerCase()} from interoceanco.com`,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Message:',
    d.message,
    '',
    '—',
    `Sent from: ${d.page || 'website'}`,
    `Received: ${meta.receivedAt} (UTC)`,
    'Reply to this email to answer the sender directly.',
  ].join('\n');

  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 16px 8px 0;color:#4a5b76;font-size:13px;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td>` +
        `<td style="padding:8px 0;color:#13294b;font-size:15px;font-weight:600">${escapeHtml(v)}</td></tr>`,
    )
    .join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f5f9fc;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f9fc;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e1e8ef">
<tr><td style="background:#13294b;padding:22px 28px;color:#ffffff">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#ff8200">${escapeHtml(type)}</div>
<div style="font-size:20px;font-weight:700;margin-top:6px">New inquiry from the website</div>
</td></tr>
<tr><td style="height:4px;background:linear-gradient(90deg,#ff8200,#f3d2b0 45%,#8dc8e8);background-color:#ff8200"></td></tr>
<tr><td style="padding:24px 28px"><table role="presentation" cellpadding="0" cellspacing="0">${tr}</table>
<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e1e8ef;color:#4a5b76;font-size:13px">Message</div>
<div style="margin-top:8px;color:#13294b;font-size:15px;line-height:1.6;white-space:pre-wrap">${escapeHtml(d.message)}</div>
</td></tr>
<tr><td style="padding:16px 28px 24px;color:#6b7a91;font-size:12px;line-height:1.5;border-top:1px solid #e1e8ef">
Sent from ${escapeHtml(d.page || 'interoceanco.com')} · ${escapeHtml(meta.receivedAt)} UTC<br>
Reply to this email to answer ${escapeHtml(d.name)} directly at ${escapeHtml(d.email)}.
</td></tr></table></td></tr></table></body></html>`;

  return { subject, text, html };
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin navigations / server-to-server tools
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  if (host === req.headers['x-forwarded-host'] || host === req.headers.host) return true;
  const extra = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return extra.some((o) => o === origin || o === host);
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'forbidden' });

  let body;
  try {
    body = await readBody(req);
  } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }

  // Honeypot: real visitors never fill this hidden field. Pretend success to bots.
  if (body && typeof body.website === 'string' && body.website.trim()) return res.status(200).json({ ok: true });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'rate_limited' });

  const { data, fields } = validate(body || {});
  if (Object.keys(fields).length) return res.status(400).json({ error: 'validation', fields });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[contact] RESEND_API_KEY is not set');
    return res.status(503).json({ error: 'not_configured' });
  }

  const to = (process.env.CONTACT_TO || DEFAULT_TO)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const from = process.env.CONTACT_FROM || DEFAULT_FROM;
  const receivedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const { subject, text, html } = buildEmail(data, { receivedAt });

  try {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Same submission retried within Resend's 24h window is sent only once.
        'Idempotency-Key': `contact-${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`,
      },
      body: JSON.stringify({
        from,
        to,
        reply_to: data.email,
        subject,
        text,
        html,
        tags: [
          { name: 'source', value: 'website' },
          { name: 'inquiry_type', value: data.inquiryType },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`[contact] Resend ${response.status}: ${detail.slice(0, 500)}`);
      return res.status(502).json({ error: 'delivery_failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[contact] Resend request failed:', error?.message || error);
    return res.status(502).json({ error: 'delivery_failed' });
  }
}
