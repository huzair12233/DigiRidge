/**
 * DigiRidge — Reviews API (Vercel-style serverless function)
 *
 * Mirrors the existing api/contact.js pattern (module.exports = async (req, res)).
 *
 * Storage: a flat JSON file at <project root>/data/reviews.json.
 *   - GET  /api/reviews        -> { reviews: [...] }  (newest first, email omitted)
 *   - POST /api/reviews        -> { success: true, review }  (appends one review)
 *
 * Why a JSON file: it's the simplest robust option that reuses the existing
 * Node setup with zero new dependencies or services. It persists on any host
 * with a writable, persistent filesystem (local `vercel dev`, a Node server,
 * a VPS, Render, Railway, etc.).
 *
 * NOTE on Vercel production: Vercel's serverless filesystem is read-only except
 * for /tmp, and /tmp is ephemeral. So on Vercel, writes fall back to /tmp and
 * will not persist long-term. For durable production storage, swap the two
 * read/write helpers below for Vercel KV / Postgres / a hosted JSON store —
 * nothing else in the app needs to change.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'reviews.json');
const TMP_FILE = path.join('/tmp', 'reviews.json');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PHOTO_BYTES = 1.6 * 1024 * 1024; // ~1.6MB of base64 payload

/* ----------------------------- storage helpers ---------------------------- */

function readFileSafe(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return null;
  }
}

function loadReviews() {
  // Seed/base data (committed) + any runtime additions written to /tmp on Vercel.
  const base = readFileSafe(DATA_FILE) || [];
  const tmp = readFileSafe(TMP_FILE);
  if (!tmp) return base;

  // Merge, de-duplicated by id (tmp wins), keep base entries too.
  const byId = new Map();
  base.forEach((r) => byId.set(r.id, r));
  tmp.forEach((r) => byId.set(r.id, r));
  return Array.from(byId.values());
}

function saveReviews(reviews) {
  const json = JSON.stringify(reviews, null, 2);
  // Prefer the committed data file (works locally & on persistent hosts).
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, json, 'utf8');
    return;
  } catch (_) {
    // Read-only FS (e.g. Vercel) — fall back to the ephemeral /tmp store.
    fs.writeFileSync(TMP_FILE, json, 'utf8');
  }
}

/* ------------------------------- sanitizing ------------------------------- */

function cleanText(value, maxLen) {
  if (typeof value !== 'string') return '';
  // Strip control chars, collapse, trim, cap length. Rendering is done with
  // textContent on the client, so this is defence-in-depth, not the only guard.
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function validPhoto(photo) {
  if (!photo) return '';
  if (typeof photo !== 'string') return null;
  if (!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(photo)) return null;
  if (photo.length > MAX_PHOTO_BYTES) return null;
  return photo;
}

/* --------------------------------- handler -------------------------------- */

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const reviews = loadReviews()
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(({ email, ...pub }) => pub); // never expose email publicly
    return res.status(200).json({ reviews });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const name = cleanText(body.name, 80);
  const message = cleanText(body.message, 2000);
  const role = cleanText(body.role, 120);
  const email = cleanText(body.email, 120);
  const rating = Number(body.rating);

  if (!name || !message) {
    return res.status(400).json({ error: 'Name and review message are required.' });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Please select a rating between 1 and 5 stars.' });
  }
  if (email && !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const photo = validPhoto(body.photo);
  if (photo === null) {
    return res.status(400).json({ error: 'Photo must be a PNG/JPG/GIF/WebP image under ~1.5MB.' });
  }

  const review = {
    id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name,
    role,
    rating,
    message,
    photo: photo || '',
    email, // stored privately, stripped from GET responses
    createdAt: new Date().toISOString(),
  };

  try {
    const reviews = loadReviews();
    reviews.push(review);
    saveReviews(reviews);
  } catch (err) {
    console.error('Reviews store error:', err);
    return res.status(500).json({ error: 'Could not save your review right now. Please try again later.' });
  }

  const { email: _omit, ...publicReview } = review;
  return res.status(201).json({ success: true, review: publicReview });
};
