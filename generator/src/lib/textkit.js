// AI 없이 정리하기 위한 도구: 키워드 추출, 대표 제목, 발췌 요약, 자동 타임라인, 월별 흐름 잇기, 키워드 추이
import { bigrams, clusterArticles, jaccard } from './cluster.js';

// ── 날짜 ────────────────────────────────────
const KST = 9 * 3600_000;
export const kstDay = (iso) => (iso ? new Date(new Date(iso).getTime() + KST).toISOString().slice(0, 10) : '');
export const mmdd = (iso) => kstDay(iso).slice(5).replace('-', '.');
const dot = (ym) => ym.replace('-', '.');

// ── 키워드 ──────────────────────────────────
const JOSA = [
  '에서는', '으로는', '에게서', '이라며', '이라고', '했다며', '한다며',
  '에서', '으로', '에게', '까지', '부터', '처럼', '보다', '이라', '라며', '라고', '하며', '하고', '했다', '한다',
  '된다', '됐다', '되는', '에는', '과의', '와의', '이며', '이고', '에도', '로는', '하는', '하나', '이나',
  '은', '는', '이', '가', '을', '를', '의', '에', '도', '만', '와', '과', '로', '께',
];
const STOP = new Set(
  ('기자 뉴스 속보 단독 종합 오늘 내일 어제 올해 지난해 내년 관련 대한 위해 이번 사진 영상 포토 오전 오후 ' +
    '그래픽 인터뷰 칼럼 사설 특파원 현장 전문 공식 발표 예정 가능성 논란 우려 전망 상황 문제 사실 이유 ' +
    '경우 가운데 이후 이전 당시 최근 현재 전년 대비 지난 이날 하루 주간 월간 연합뉴스 뉴시스 뉴스1 ' +
    '머니투데이 이데일리 한겨레 경향신문 조선일보 중앙일보 동아일보 매일경제 한국경제 서울신문 국민일보 세계일보 ' +
    '하는 있는 없는 같은 위한 대해 통해 따라 따른 놓고 두고 향해 정도 이상 이하 만에 등 것 수 및 첫 더 또 다시 결국 모두 ' +
    '이어져 이어 지속 결정 시사 확대 강화 돌입 착수 계속 본격 추진 검토 예고 촉구 요구 밝혀 밝혔다 나서 나선 강조 ' +
    '목소리 주목 눈길 비상 직격 파장 후폭풍 총력 박차 시동 ' +
    'the and for with from that this news').split(/\s+/),
);

// 조사처럼 보이지만 단어의 일부인 끝 두 글자 (예: 본회의, 물가, 반도체도 X → 한반도)
const PROTECT = new Set(
  ('회의 협의 합의 논의 주의 결의 동의 건의 심의 항의 정의 편의 모의 강의 토의 질의 의의 ' +
    '국가 평가 물가 증가 주가 원가 대가 단가 유가 지가 시가 고가 저가 호가 추가 참가 휴가 작가 문가 치가 ' +
    '반도 속도 제도 정도 지도 한도 인도 태도 용도 빈도 강도 ' +
    '차이 사이 아이 나이 높이 길이 ' +
    '경로 통로 진로 도로 활로 원로 ' +
    '효과 결과 성과 부과 통과 초과 경과 사과 학과 ' +
    '불만 천만 백만 마을 이나').split(/\s+/),
);

function stem(w) {
  if (PROTECT.has(w.slice(-2))) return w;
  for (const j of JOSA) {
    if (w.length - j.length >= 2 && w.endsWith(j)) return w.slice(0, -j.length);
  }
  return w;
}

/** 화면 표시용: 짧은 영문 약어는 대문자 (eu → EU) */
export const displayWord = (w) => (/^[a-z]{2,4}$/.test(w) ? w.toUpperCase() : w);

/** 제목 앞머리 꼬리표 제거: [종합], [속보], [단독], 【포토】 등 */
export function cleanTitle(t = '') {
  return t.replace(/^\s*(?:\[[^\]]{1,12}\]|【[^】]{1,12}】|<[^>]{1,12}>)\s*/g, '').replace(/^\s*(?:\[[^\]]{1,12}\])\s*/g, '').trim();
}

/** 제목 하나 → 키워드 후보 (중복 제거) */
export function tokens(text, exclude = new Set()) {
  const out = new Set();
  for (const raw of String(text).replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').split(/[^0-9A-Za-z가-힣]+/)) {
    if (!raw || /\d/.test(raw)) continue;
    const w = stem(raw.toLowerCase());
    if (w.length < 2 || w.length > 12 || STOP.has(w) || exclude.has(w)) continue;
    out.add(w);
  }
  return out;
}

/** 검색어("A OR B OR C")에 쓴 단어는 키워드에서 뺀다 — 검색어 때문에 당연히 많이 나오므로 */
export function queryTerms(queries = []) {
  const set = new Set();
  for (const q of queries) for (const t of q.split(/\s+OR\s+|\s+/)) if (t && t !== 'OR') set.add(stem(t.replace(/"/g, '').toLowerCase()));
  return set;
}

/** 기사들에서 자주 나온 키워드 (기사당 1회 세기) */
export function topKeywords(articles, { exclude = new Set(), limit = 15 } = {}) {
  const df = new Map();
  for (const a of articles) for (const t of tokens(a.title, exclude)) df.set(t, (df.get(t) || 0) + 1);
  return [...df.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word: displayWord(word), count }));
}

/** 한 주 안에서 최근 3일에 비중이 커진 키워드 */
export function risingInWeek(articles, { exclude = new Set(), limit = 6 } = {}) {
  const split = Date.now() - 3 * 86400_000;
  const recent = articles.filter((a) => a.publishedAt && new Date(a.publishedAt).getTime() >= split);
  const earlier = articles.filter((a) => a.publishedAt && new Date(a.publishedAt).getTime() < split);
  if (recent.length < 10 || earlier.length < 10) return [];
  const share = (list) => {
    const m = new Map();
    for (const a of list) for (const t of tokens(a.title, exclude)) m.set(t, (m.get(t) || 0) + 1);
    return { m, n: list.length };
  };
  const r = share(recent);
  const e = share(earlier);
  return [...r.m.entries()]
    .filter(([, c]) => c >= 3)
    .map(([word, c]) => ({ word, now: c / r.n, before: (e.m.get(word) || 0) / e.n }))
    .filter((x) => x.now > x.before * 1.8)
    .sort((a, b) => b.now - b.before - (a.now - a.before))
    .slice(0, limit)
    .map((x) => ({ word: displayWord(x.word), change: x.before ? Math.round((x.now / x.before - 1) * 100) : null }));
}

// ── 이슈(클러스터) 정리 ─────────────────────────
/** 묶음에서 다른 제목들과 가장 비슷한(=가운데) 제목 */
export function representative(articles) {
  if (articles.length <= 2) return articles[0];
  const grams = articles.map((a) => bigrams(a.title));
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(articles.length, 15); i++) {
    let s = 0;
    for (let j = 0; j < Math.min(articles.length, 15); j++) if (i !== j) s += jaccard(grams[i], grams[j]);
    // 너무 긴 제목·보도자료 제목은 약간 감점
    s -= Math.max(0, articles[i].title.length - 45) * 0.01;
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return articles[best];
}

/** 발췌 요약: 묶음의 발췌문(네이버 설명·보도자료 본문) 중 이슈 키워드를 가장 많이 담은 1~2문장 */
export function extractSummary(articles) {
  const snippets = articles.map((a) => a.snippet).filter((s) => s && s.length > 30);
  if (!snippets.length) return '';
  const kw = new Set(topKeywords(articles, { limit: 8 }).map((k) => k.word));
  let best = '';
  let bestScore = -1;
  for (const s of snippets) {
    const t = tokens(s);
    let score = 0;
    for (const w of t) if (kw.has(w)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  const sentences = best.split(/(?<=[다요음]\.)\s+|(?<=\.)\s+(?=[가-힣A-Z"“])/);
  let out = '';
  for (const s of sentences) {
    if ((out + s).length > 170) break;
    out += (out ? ' ' : '') + s;
  }
  return (out || best.slice(0, 160)).replace(/\s*\.\.\.$|…$/, '').trim() + (out ? '' : '…');
}

/** 매체별 다른 제목 (대표 제목 제외, 최대 n개) */
export function altHeadlines(articles, rep, n = 3) {
  const seen = new Set([rep.source]);
  const out = [];
  for (const a of articles) {
    if (out.length >= n) break;
    if (a === rep || seen.has(a.source)) continue;
    seen.add(a.source);
    out.push({ title: a.title, source: a.source });
  }
  return out;
}

/** 보도 기간 'MM.DD~MM.DD' */
export function daySpan(articles) {
  const days = [...new Set(articles.map((a) => kstDay(a.publishedAt)).filter(Boolean))].sort();
  if (!days.length) return { span: '', days: 0 };
  const f = (d) => d.slice(5).replace('-', '.');
  return { span: days.length > 1 ? `${f(days[0])}~${f(days.at(-1))}` : f(days[0]), days: days.length };
}

/** 날짜별로 그날 처음 등장한 가장 큰 이슈 → 타임라인 */
export function autoTimeline(clusters, { max = 7 } = {}) {
  const byDay = new Map();
  for (const c of clusters) {
    const first = c.articles.map((a) => kstDay(a.publishedAt)).filter(Boolean).sort()[0];
    if (!first) continue;
    if (!byDay.has(first) || byDay.get(first).score < c.score) byDay.set(first, c);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-max)
    .map(([day, c]) => ({ date: day.slice(5).replace('-', '.'), event: representative(c.articles).title }));
}

// ── 여러 달에 걸친 흐름 ─────────────────────────
/**
 * 월별 이슈들을 제목 유사도로 이어 '여러 달 이어진 흐름'을 만든다.
 * @param {Array} months loadMonth 결과들 (오래된 것부터)
 */
export function buildThreads(months, { limit = 7 } = {}) {
  const pseudo = months.flatMap((m) =>
    m.topics.map((t) => ({ title: t.title, source: m.month, publishedAt: `${m.month}-15T00:00:00Z`, topic: t, month: m.month })),
  );
  const groups = clusterArticles(pseudo, { threshold: 0.22, prefix: 'h' });
  return groups
    .map((g) => {
      const monthsIn = [...new Set(g.articles.map((a) => a.month))].sort();
      const total = g.articles.reduce((n, a) => n + (a.topic.articleCount || 0), 0);
      const lead = g.articles.slice().sort((a, b) => (b.topic.articleCount || 0) - (a.topic.articleCount || 0))[0];
      return { g, monthsIn, total, lead };
    })
    .sort((a, b) => b.monthsIn.length - a.monthsIn.length || b.total - a.total)
    .slice(0, limit)
    .map(({ g, monthsIn, total, lead }) => {
      const byMonth = g.articles.slice().sort((a, b) => b.month.localeCompare(a.month));
      return {
        title: lead.topic.title,
        span: monthsIn.length > 1 ? `${dot(monthsIn[0])}~${dot(monthsIn.at(-1))}` : dot(monthsIn[0]),
        monthCount: monthsIn.length,
        articleCount: total,
        summary: lead.topic.summary || '',
        // 달마다 어떤 제목으로 다뤄졌는지 (최근 달부터)
        headlines: byMonth.slice(0, 4).map((a) => ({ title: a.topic.title, source: dot(a.month) })),
        articles: byMonth.flatMap((a) => (a.topic.articles || []).slice(0, 1)).slice(0, 6),
      };
    });
}

/** 월별 키워드 추이: 기사 100건당 언급 수 */
export function keywordTrends(months, { top = 8 } = {}) {
  const totals = new Map();
  for (const m of months) {
    const n = Math.max(1, m.articleCount || 1);
    for (const k of m.keywords || []) totals.set(k.word, (totals.get(k.word) || 0) + (k.count / n) * 100);
  }
  const words = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([w]) => w);
  const series = words.map((word) => ({
    word,
    values: months.map((m) => {
      const k = (m.keywords || []).find((x) => x.word === word);
      return k ? Math.round((k.count / Math.max(1, m.articleCount)) * 1000) / 10 : 0;
    }),
  }));

  // 상승·하락: 기간 앞 1/3 평균 대비 뒤 1/3 평균
  const third = Math.max(1, Math.floor(months.length / 3));
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  const allWords = [...totals.keys()];
  const movement = allWords
    .map((word) => {
      const vals = months.map((m) => {
        const k = (m.keywords || []).find((x) => x.word === word);
        return k ? (k.count / Math.max(1, m.articleCount)) * 100 : 0;
      });
      return { word, early: avg(vals.slice(0, third)), late: avg(vals.slice(-third)) };
    })
    .filter((x) => x.early + x.late >= 2);
  const rising = movement
    .filter((x) => x.late > x.early * 1.5)
    .sort((a, b) => b.late - b.early - (a.late - a.early))
    .slice(0, 6)
    .map((x) => ({ word: x.word, change: x.early ? Math.round((x.late / x.early - 1) * 100) : null }));
  const falling = movement
    .filter((x) => x.early > x.late * 1.5)
    .sort((a, b) => b.early - b.late - (a.early - a.late))
    .slice(0, 4)
    .map((x) => ({ word: x.word, change: x.early ? Math.round((x.late / x.early - 1) * 100) : null }));

  return { months: months.map((m) => m.month), unit: '기사 100건당 언급', series, rising, falling };
}

/** 중기·장기 자동 타임라인: 기간을 나눠 각 구간의 가장 큰 이슈 */
export function monthTimeline(months, { stepMonths = 1 } = {}) {
  const out = [];
  for (let i = 0; i < months.length; i += stepMonths) {
    const chunk = months.slice(i, i + stepMonths);
    const best = chunk
      .flatMap((m) => m.topics.map((t) => ({ t, m })))
      .sort((a, b) => (b.t.articleCount || 0) - (a.t.articleCount || 0))[0];
    if (best) out.push({ date: dot(best.m.month), event: best.t.title });
  }
  return out;
}
