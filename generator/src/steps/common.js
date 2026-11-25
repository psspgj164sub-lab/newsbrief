// 브리핑 공통: 프롬프트용 이슈 블록, 기사 축약, 자동 이슈 정리
import { altHeadlines, daySpan, extractSummary, representative } from '../lib/textkit.js';

const mmdd = (iso) => {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
};

/** 클러스터들을 AI 입력 텍스트로 */
export function clusterBlocks(clusters, { perCluster = 5 } = {}) {
  return clusters
    .map((c) => {
      const dates = c.articles.map((a) => mmdd(a.publishedAt)).filter(Boolean).sort();
      const span = dates.length ? `${dates[0]}~${dates[dates.length - 1]}` : '';
      const lines = c.articles
        .slice(0, perCluster)
        .map((a) => `  - (${mmdd(a.publishedAt)} ${a.kind === 'press' ? '보도자료·' : ''}${a.source}) ${a.title}${a.snippet ? ` — ${a.snippet.slice(0, 150)}` : ''}`)
        .join('\n');
      return `### ${c.id} [기사 ${c.articles.length}건 · 매체 ${c.sourceCount}곳 · ${span}]\n${lines}`;
    })
    .join('\n\n');
}

/** 앱에 내려줄 기사 형태 */
export function slimArticle(a) {
  return {
    title: a.title,
    link: a.link,
    source: a.source,
    publishedAt: a.publishedAt,
    kind: a.kind,
  };
}

/** 클러스터 대표 기사: 보도자료 1건 + 서로 다른 매체 우선 */
export function pickArticles(articles, n = 6) {
  const out = [];
  const seen = new Set();
  const press = articles.find((a) => a.kind === 'press');
  if (press) {
    out.push(press);
    seen.add(press.source);
  }
  for (const a of articles) {
    if (out.length >= n) break;
    if (out.includes(a) || seen.has(a.source)) continue;
    out.push(a);
    seen.add(a.source);
  }
  for (const a of articles) {
    if (out.length >= n) break;
    if (!out.includes(a)) out.push(a);
  }
  return out.map(slimArticle);
}

/** 클러스터 → 이슈 카드 (AI 없이: 대표 제목 + 발췌 요약 + 매체별 다른 제목) */
export function autoIssue(c) {
  const rep = representative(c.articles);
  const { span, days } = daySpan(c.articles);
  return {
    title: rep.title,
    summary: extractSummary(c.articles),
    whyItMatters: '',
    headlines: altHeadlines(c.articles, rep, 3),
    span,
    days,
    hasPress: c.articles.some((a) => a.kind === 'press'),
    sourceCount: c.sourceCount,
    articleCount: c.articles.length,
    articles: pickArticles(c.articles),
  };
}

/** AI가 돌려준 issues(id 참조)를 클러스터와 합침. AI가 없거나 빠뜨린 이슈는 자동 정리로 채움 */
export function mergeIssues(aiIssues = [], clusters, limit) {
  const byId = new Map(clusters.map((c) => [c.id, c]));
  const out = [];
  for (const it of aiIssues || []) {
    const c = byId.get(it.id);
    if (!c) continue;
    byId.delete(it.id);
    out.push({ ...autoIssue(c), title: it.title, summary: it.summary || '', whyItMatters: it.whyItMatters || '' });
  }
  for (const c of byId.values()) {
    if (out.length >= limit) break;
    out.push(autoIssue(c));
  }
  return out.slice(0, limit);
}
