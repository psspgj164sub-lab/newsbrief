// 월간 요약: 중기(6개월)·장기(3년) 브리핑의 재료.
// 구글뉴스 기간 검색(after/before)으로 해당 월 기사를 모아 요약 → archive/monthly/YYYY-MM/<분류>.json
import path from 'node:path';
import { CATEGORIES, LIMITS } from '../config.js';
import { fetchGoogle } from '../sources/index.js';
import { clusterArticles, dedupe } from '../lib/cluster.js';
import { aiEnabled, askJSON } from '../lib/llm.js';
import { autoTimeline, extractSummary, queryTerms, representative, topKeywords } from '../lib/textkit.js';
import { ARCHIVE, log, monthRange, readJSON, writeJSON } from '../lib/util.js';
import { clusterBlocks, pickArticles } from './common.js';

export const monthFile = (key, category) => path.join(ARCHIVE, 'monthly', key, `${category}.json`);

export async function loadMonth(key, category) {
  return readJSON(monthFile(key, category));
}

function prompt(category, key, clusters) {
  const cfg = CATEGORIES[category];
  return `브리핑: ${cfg.label} 분야 ${key.replace('-', '년 ')}월 월간 정리
관점: ${cfg.focus}

아래는 이 달의 기사를 같은 사건끼리 묶은 것이다.

${clusterBlocks(clusters, { perCluster: 4 })}

출력 JSON:
{
  "summary": "이 달 ${cfg.label} 분야 흐름 3~4문장",
  "topics": [ { "id": "이슈 id 그대로", "title": "이슈 제목 (25자 이내)", "summary": "2문장", "importance": 1~5 정수 } ],
  "keyEvents": [ { "date": "MM.DD", "event": "주요 사건 한 줄" } ]
}
- topics 는 ${cfg.label} 분야와 관련된 것만 중요도 순 최대 ${LIMITS.monthTopics}개.
- keyEvents 는 날짜를 알 수 있는 것만 3~6개.`;
}

/**
 * @param {string} category
 * @param {string} key YYYY-MM
 * @param {{force?: boolean}} opts force=false 이면 이미 있는 달은 건너뜀
 */
export async function buildMonth(category, key, { force = false } = {}) {
  const file = monthFile(key, category);
  if (!force) {
    const existing = await readJSON(file);
    if (existing) return existing;
  }

  const cfg = CATEGORIES[category];
  const { after, before } = monthRange(key);
  const lists = await Promise.all(cfg.google.map((q) => fetchGoogle(q, { after, before })));
  const articles = dedupe(lists.flat()).filter((a) => !a.publishedAt || (a.publishedAt >= after && a.publishedAt < `${before}T00:00`));
  const clusters = clusterArticles(articles, { prefix: 't' }).slice(0, LIMITS.monthTopics + 4);
  log(`[월간] ${cfg.label} ${key}: 기사 ${articles.length}건 → 이슈 ${clusters.length}개`);

  const ai = clusters.length && aiEnabled() ? await askJSON(prompt(category, key, clusters), { maxTokens: 3000, tag: `월간/${category}/${key}` }) : null;
  const byId = new Map(clusters.map((c) => [c.id, c]));

  // AI 없이: 기사 수 순위대로 대표 제목, 상위일수록 중요도 높게
  const autoTopics = clusters.slice(0, LIMITS.monthTopics).map((c, i) => ({
    id: c.id,
    title: representative(c.articles).title,
    summary: extractSummary(c.articles),
    importance: i < 2 ? 5 : i < 4 ? 4 : 3,
  }));

  const topics = (ai?.topics?.length ? ai.topics : autoTopics)
    .filter((t) => byId.has(t.id))
    .map((t) => ({
      ref: `${key}#${t.id}`,
      title: t.title,
      summary: t.summary || '',
      importance: Number(t.importance) || 3,
      articleCount: byId.get(t.id).articles.length,
      sourceCount: byId.get(t.id).sourceCount,
      articles: pickArticles(byId.get(t.id).articles, 3),
    }));

  // 키워드는 AI와 관계없이 항상 계산 → 중기·장기 '키워드 흐름'의 재료
  const keywords = topKeywords(articles, { exclude: queryTerms(cfg.google), limit: 40 });

  const data = {
    month: key,
    category,
    ai: Boolean(ai),
    builtAt: new Date().toISOString(),
    articleCount: articles.length,
    summary: ai?.summary || '',
    topics,
    keywords,
    keyEvents: ai?.keyEvents || autoTimeline(clusters.slice(0, 6), { max: 5 }),
  };
  // 기사가 하나도 없으면(일시적 수집 실패 가능) 저장하지 않아 다음 실행 때 다시 시도
  if (articles.length) await writeJSON(file, data);
  return data;
}
