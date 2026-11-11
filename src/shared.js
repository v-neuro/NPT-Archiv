export const APP_VERSION = '0.2.0';
export const PARSER_VERSION = 'npt-semicolon/1';
export const FORMAT = 'digitale-npt-folder-archive';
export const SCHEMA = 1;
export const MAX_FILE = 32 * 1024 * 1024;
export const MAX_CSV = 8 * 1024 * 1024;
export const MAX_BATCH = 128 * 1024 * 1024;
export const encoder = new TextEncoder();
export const bytes = value => typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value);
export const decode = value => new TextDecoder('utf-8', { fatal: true }).decode(value);
export const fail = message => { throw new Error(message); };
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const uid = () => crypto.randomUUID();
export const validId = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
export const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function text(value, max = 200) {
  return typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
}
export async function sha256(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function safeJson(value, depth = 0) {
  if (depth > 40) fail('JSON zu tief verschachtelt.');
  if (typeof value === 'number' && !Number.isFinite(value)) fail('Ungültige Zahl.');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('Unsicherer JSON-Schlüssel.');
    safeJson(child, depth + 1);
  }
}
export function parseJson(value) { const result = JSON.parse(decode(value)); safeJson(result); return result; }
