import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const WEB_DATA = path.join(ROOT, 'web', 'data');
export const ARCHIVE = path.join(ROOT, 'archive');

export async function readJSON(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeJSON(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** 동시 실행 수를 제한한 map */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

export function stripHtml(s = '') {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── 날짜 (한국 시간 기준) ─────────────────────────
const KST = 9 * 3600_000;

export function kstDate(d = new Date()) {
  return new Date(d.getTime() + KST).toISOString().slice(0, 10); // YYYY-MM-DD
}

export function monthKey(d = new Date()) {
  return kstDate(d).slice(0, 7); // YYYY-MM
}

/** 'YYYY-MM' → 구글 검색용 { after, before } */
export function monthRange(key) {
  const [y, m] = key.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { after: `${key}-01`, before: `${next}-01` };
}

/** 이번 달 포함 최근 n개월 키 (오래된 것부터) */
export function lastMonths(n, from = new Date()) {
  const [y, m] = monthKey(from).split('-').map(Number);
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
}

export function daysAgo(n) {
  return new Date(Date.now() - n * 86400_000);
}

export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
