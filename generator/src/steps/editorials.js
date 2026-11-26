// 사설 비교: 7개 신문의 오늘자 사설을 모아, 같은 주제를 다룬 사설끼리 나란히 묶는다. (API 키 없이 동작)
// - 수집: 구글뉴스 "사설 site:신문사주소" 검색 (+ 네이버 키가 있으면 네이버 뉴스 검색에서 해당 신문만)
// - 사설 판별: 제목의 [사설] 꼬리표 (또는 config 의 editorialPath 가 주소에 있을 때)
// - 묶기: 제목 글자 유사도 + 공통 핵심어. 사설은 신문마다 제목 표현이 크게 달라 일반 기사보다 느슨하게 묶음
// - 성향 분류·논조 판정은 하지 않음 (제목과 첫머리를 나란히 보여주고 판단은 읽는 사람에게)
import path from 'node:path';
import fs from 'node:fs/promises';
import { EDITORIAL_PAPERS } from '../config.js';
import { fetchGoogle, fetchNaver, naverEnabled } from '../sources/index.js';
import { bigrams, jaccard } from '../lib/cluster.js';
import { displayWord, tokens, topKeywords } from '../lib/textkit.js';
import { ARCHIVE, kstDate, log, readJSON, writeJSON } from '../lib/util.js';

const WINDOW_HOURS = 36; // 사설은 전날 저녁 온라인에 먼저 올라오므로 넉넉히
const EDITORIAL_TAG = /\[\s*사설\s*\]|^\s*사설\s*[:|·]/;

// 묶을 때 근거로 삼지 않을 흔한 단어 (거의 모든 사설에 나와서 주제를 구분하지 못함)
const GENERIC = new Set(
  ('정부 국회 대통령 여야 여당 야당 국민 한국 우리 경제 정치 사회 문제 정책 대책 필요 시급 안된다 안 된다 해야 하라 ' +
    '말라 이유 상황 지금 이제 더는 제대로 결국 책임 사태 논란 우려 위기 시대 미래').split(/\s+/),
);

const editorialArchive = (date) => path.join(ARCHIVE, 'editorials', `${date}.json`);

function hostOf(u = '') {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
}

function isEditorial(a, paper) {
  if (EDITORIAL_TAG.test(a.rawTitle || a.title)) return true;
  return Boolean(paper.editorialPath && a.link?.includes(paper.editorialPath));
}

function clean(a, paper) {
  return {
    paper: paper.id,
    paperLabel: paper.label,
    title: a.title.replace(EDITORIAL_TAG, '').trim(),
    link: a.link,
    snippet: (a.snippet || '').slice(0, 120),
    publishedAt: a.publishedAt,
  };
}

async function collect() {
  const cutoff = Date.now() - WINDOW_HOURS * 3600_000;
  const naverPool = naverEnabled()
    ? [
        ...(await fetchNaver('사설')),
        ...(await Promise.all(EDITORIAL_PAPERS.map((p) => fetchNaver(`${p.label} 사설`)))).flat(),
      ]
    : [];

  const byPaper = {};
  for (const paper of EDITORIAL_PAPERS) {
    const google = await fetchGoogle(`사설 site:${paper.domain}`, { when: '2d' });
    const naver = naverPool.filter((a) => hostOf(a.link).endsWith(paper.domain));
    const seen = new Set();
    byPaper[paper.id] = [...naver, ...google] // 네이버 먼저: 첫머리 발췌가 있음
      .filter((a) => isEditorial(a, paper))
      .filter((a) => !a.publishedAt || new Date(a.publishedAt).getTime() >= cutoff)
      .map((a) => clean(a, paper))
      .filter((e) => {
        const k = e.title.replace(/\s+/g, '');
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((x, y) => new Date(y.publishedAt || 0) - new Date(x.publishedAt || 0));
    log(`[사설] ${paper.label}: ${byPaper[paper.id].length}편`);
  }
  return byPaper;
}

/** 서로 다른 신문의 사설 중 같은 주제를 다룬 것끼리 묶음 (union-find) */
export function groupByTopic(all) {
  const parent = all.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const grams = all.map((e) => bigrams(e.title));
  const toks = all.map((e) => new Set([...tokens(e.title)].filter((t) => !GENERIC.has(t))));

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (all[i].paper === all[j].paper) continue;
      const sim = jaccard(grams[i], grams[j]);
      const shared = [...toks[i]].filter((t) => toks[j].has(t));
      const strongWord = shared.some((t) => t.length >= 3);
      if (sim >= 0.22 || shared.length >= 2 || (strongWord && sim >= 0.1)) parent[find(i)] = find(j);
    }
  }

  const groups = new Map();
  all.forEach((e, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push({ e, t: toks[i] });
  });

  const order = new Map(EDITORIAL_PAPERS.map((p, i) => [p.id, i]));
  return [...groups.values()]
    .map((g) => {
      const papers = new Set(g.map((x) => x.e.paper));
      // 주제 이름: 두 편 이상의 제목에 함께 나온 핵심어
      const freq = new Map();
      for (const x of g) for (const t of x.t) freq.set(t, (freq.get(t) || 0) + 1);
      // 서술어처럼 끝나는 말(흔들려선, 서둘러라, 필요하다 …)은 주제 이름에서 뺌
      const verbish = (w) => w.length >= 3 && /[선서라야다고게며는까요죠]$/.test(w);
      const label = [...freq.entries()]
        .filter(([w, n]) => n >= 2 && !verbish(w))
        .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
        .slice(0, 2)
        .map(([w]) => displayWord(w));
      return {
        label: label.join(' · ') || g[0].e.title.slice(0, 18),
        paperCount: papers.size,
        items: g.map((x) => x.e).sort((a, b) => order.get(a.paper) - order.get(b.paper)),
      };
    })
    .filter((g) => g.paperCount >= 2)
    .sort((a, b) => b.paperCount - a.paperCount || b.items.length - a.items.length);
}

/** 최근 7일 신문별로 자주 다룬 단어 */
async function weekly(today) {
  let files = [];
  try {
    files = (await fs.readdir(path.join(ARCHIVE, 'editorials'))).filter((f) => f.endsWith('.json')).sort().slice(-7);
  } catch {}
  const days = [];
  const pool = Object.fromEntries(EDITORIAL_PAPERS.map((p) => [p.id, []]));
  for (const f of files) {
    const d = await readJSON(path.join(ARCHIVE, 'editorials', f));
    if (!d) continue;
    days.push(d.date);
    for (const [pid, list] of Object.entries(d.byPaper || {})) pool[pid]?.push(...list);
  }
  return {
    from: days[0] || today,
    to: days.at(-1) || today,
    days: days.length,
    papers: EDITORIAL_PAPERS.map((p) => ({
      id: p.id,
      label: p.label,
      count: pool[p.id].length,
      keywords: topKeywords(pool[p.id], { exclude: GENERIC, limit: 6 }),
    })),
  };
}

export async function buildEditorials() {
  const date = kstDate();
  const byPaper = await collect();

  // 오늘 모은 것을 날짜별로 보관 (이미 있으면 합침 — 하루에 여러 번 돌려도 안전)
  const prev = (await readJSON(editorialArchive(date))) || { byPaper: {} };
  for (const p of EDITORIAL_PAPERS) {
    const merged = [...(byPaper[p.id] || []), ...(prev.byPaper?.[p.id] || [])];
    const seen = new Set();
    byPaper[p.id] = merged.filter((e) => (seen.has(e.title) ? false : seen.add(e.title)));
  }
  const total = Object.values(byPaper).reduce((n, l) => n + l.length, 0);
  if (total) await writeJSON(editorialArchive(date), { date, byPaper });

  const all = EDITORIAL_PAPERS.flatMap((p) => byPaper[p.id] || []);
  const common = groupByTopic(all);
  log(`[사설] 총 ${total}편 → 두 신문 이상 겹친 주제 ${common.length}개`);

  return {
    updatedAt: new Date().toISOString(),
    date,
    papers: EDITORIAL_PAPERS.map((p) => ({ id: p.id, label: p.label, count: (byPaper[p.id] || []).length })),
    common,
    byPaper,
    weekly: await weekly(date),
  };
}
