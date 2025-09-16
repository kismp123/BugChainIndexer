// Lightweight parsing helpers shared by controllers/services

// number: returns number or null for empty/invalid
function parseNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// string array: accepts comma-separated string or array-like
function parseStringArray(v) {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  return String(v)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

// boolean: accepts common truthy flags
function parseBool(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

// decode cursor from base64 JSON (Node friendly)
function decodeCursor(b64) {
  if (!b64 || typeof b64 !== 'string') return null;
  try {
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const obj = JSON.parse(json);
    return obj && typeof obj === 'object' ? obj : null;
  } catch (_) {
    return null;
  }
}

// encode helper (may be useful client-side or tests)
function encodeCursor(obj) {
  if (!obj || typeof obj !== 'object') return null;
  try {
    const json = JSON.stringify(obj);
    return Buffer.from(json, 'utf8').toString('base64');
  } catch (_) {
    return null;
  }
}

module.exports = {
  parseNumber,
  parseStringArray,
  parseBool,
  decodeCursor,
  encodeCursor,
};

