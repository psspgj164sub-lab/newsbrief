// 뉴스 소스: 구글뉴스 RSS, 네이버 뉴스 검색(NAVER API HUB), 부처·한국은행 보도자료 RSS, BBC
import Parser from 'rss-parser';
import { PRESS_FEEDS, PRESS_GOOGLE } from '../config.js';
import { log, stripHtml } from '../lib/util.js';
import { cleanTitle } from '../lib/textkit.js';

const parser = new Parser({
  timeout: 15_000,
  headers: { 'User-Agent': 'Mozilla/5.0 (NewsBriefing/1.0; RSS reader)' },
  customFields: { item: [['source', 'source']] },
});

// ── 구글뉴스 ──────────────────────────────────────
export function googleUrl(q, { lang = 'ko', when, after, before } = {}) {
  let query = q;
  if (when) query += ` when:${when}`;
  if (after) query += ` after:${after}`;
  if (before) query += ` before:${before}`;
  const loc = lang === 'ko' ? 'hl=ko&gl=KR&ceid=KR:ko' : 'hl=en-US&gl=US&ceid=US:en';
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${loc}`;
}

function splitGoogleTitle(title = '') {
  const idx = title.lastIndexOf(' - ');
  if (idx > 0 && title.length - idx < 40) return { title: title.slice(0, idx).trim(), source: title.slice(idx + 3).trim() };
  return { title: title.trim(), source: null };
}

async function rss(url) {
  const feed = await parser.parseURL(url);
  return feed.items || [];
}

export async function fetchGoogle(q, opts = {}) {
  try {
    const items = await rss(googleUrl(q, opts));
    return items.map((it) => {
      const s = splitGoogleTitle(it.title);
      const src = typeof it.source === 'object' ? it.source?._ : it.source;
      return {
        title: cleanTitle(s.title),
        link: it.link,
        source: src || s.source || 'Google News',
        publishedAt: it.isoDate || null,
        snippet: '',
        via: 'google',
        kind: 'news',
      };
    });
  } catch (e) {
    log(`[google] 실패 "${q.slice(0, 30)}…": ${e.message}`);
    return [];
  }
}

// ── 네이버 뉴스 검색 ───────────────────────────────
// 네이버 메인 뉴스는 공식 RSS·API가 없어, 공식 '뉴스 검색 API'를 최신순으로 조회합니다.
export const naverEnabled = () =>
  Boolean((process.env.NAVER_HUB_KEY_ID && process.env.NAVER_HUB_KEY) || (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET));

function sourceFromUrl(u = '') {
  try {
    return new URL(u).hostname.replace(/^www\.|^m\./, '');
  } catch {
    return '네이버뉴스';
  }
}

export async function fetchNaver(query, { display = 100 } = {}) {
  if (!naverEnabled()) return [];
  const qs = `query=${encodeURIComponent(query)}&display=${display}&start=1&sort=date`;
  const useHub = process.env.NAVER_HUB_KEY_ID && process.env.NAVER_HUB_KEY;
  const url = useHub
    ? `https://naverapihub.apigw.ntruss.com/search/v1/news?${qs}&format=json`
    : `https://openapi.naver.com/v1/search/news.json?${qs}`;
  const headers = useHub
    ? { 'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_HUB_KEY_ID, 'X-NCP-APIGW-API-KEY': process.env.NAVER_HUB_KEY }
    : { 'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET };

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return (json.items || []).map((it) => ({
      title: cleanTitle(stripHtml(it.title)),
      link: it.originallink || it.link,
      naverLink: it.link,
      source: sourceFromUrl(it.originallink || it.link),
      publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : null,
      snippet: stripHtml(it.description).slice(0, 220),
      via: 'naver',
      kind: 'news',
    }));
  } catch (e) {
    log(`[naver] 실패 "${query}": ${e.message}`);
    return [];
  }
}

// ── 보도자료 (부처 RSS + 한국은행 + 구글 보완) ─────────────────
export async function fetchPress(category, { sinceDays = 7 } = {}) {
  const cutoff = Date.now() - sinceDays * 86400_000;
  const feeds = PRESS_FEEDS.filter((f) => f.category === category);

  const fromFeeds = await Promise.all(
    feeds.map(async (f) => {
      try {
        const items = await rss(f.url);
        return items.map((it) => ({
          title: cleanTitle(stripHtml(it.title)),
          link: it.link,
          source: f.agency,
          agency: f.agency,
          publishedAt: it.isoDate || (it.pubDate ? new Date(it.pubDate).toISOString() : null),
          snippet: stripHtml(it.contentSnippet || it.content || '').slice(0, 220),
          via: 'press',
          kind: 'press',
        }));
      } catch (e) {
        log(`[press] ${f.agency} 피드 실패: ${e.message}`);
        return [];
      }
    }),
  );

  const fromGoogle = PRESS_GOOGLE[category]
    ? (await fetchGoogle(PRESS_GOOGLE[category], { when: `${sinceDays}d` })).map((a) => ({ ...a, kind: 'press', agency: a.source }))
    : [];

  return [...fromFeeds.flat(), ...fromGoogle].filter(
    (a) => !a.publishedAt || new Date(a.publishedAt).getTime() >= cutoff,
  );
}

// ── BBC 지역 피드 ────────────────────────────────
export async function fetchBBC(region) {
  try {
    const items = await rss(`https://feeds.bbci.co.uk/news/world/${region}/rss.xml`);
    return items.map((it) => ({
      title: stripHtml(it.title),
      link: it.link,
      source: 'BBC',
      publishedAt: it.isoDate || null,
      snippet: stripHtml(it.contentSnippet || '').slice(0, 220),
      via: 'bbc',
      kind: 'news',
    }));
  } catch (e) {
    log(`[bbc] ${region} 실패: ${e.message}`);
    return [];
  }
}
