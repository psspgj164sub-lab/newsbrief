// 단기 브리핑: 최근 1주 기사 수집 → 이슈 묶기 → 자동 정리 (Anthropic 키가 있으면 AI 요약 추가)
import { CATEGORIES, LIMITS, PERIODS } from '../config.js';
import { fetchGoogle, fetchNaver, fetchPress } from '../sources/index.js';
import { clusterArticles, dedupe } from '../lib/cluster.js';
import { askJSON, aiEnabled } from '../lib/llm.js';
import { daysAgo, kstDate, log } from '../lib/util.js';
import { clusterBlocks, mergeIssues, slimArticle } from './common.js';
import { autoTimeline, queryTerms, risingInWeek, topKeywords } from '../lib/textkit.js';

export async function collectWeek(category) {
  const cfg = CATEGORIES[category];
  const [google, naver, press] = await Promise.all([
    Promise.all(cfg.google.map((q) => fetchGoogle(q, { when: '7d' }))),
    Promise.all(cfg.naver.map((q) => fetchNaver(q))),
    fetchPress(category, { sinceDays: 7 }),
  ]);
  const cutoff = daysAgo(LIMITS.maxArticleAgeDays).getTime();
  const all = dedupe([...press, ...google.flat(), ...naver.flat()]).filter(
    (a) => !a.publishedAt || new Date(a.publishedAt).getTime() >= cutoff,
  );
  return { articles: all, press };
}

function prompt(category, from, to, clusters) {
  const cfg = CATEGORIES[category];
  return `브리핑: ${cfg.label} 분야 단기 브리핑 (최근 1주, ${from} ~ ${to})
관점: ${cfg.focus}

아래는 지난 1주간 같은 사건끼리 묶은 이슈들이다(보도자료 포함).

${clusterBlocks(clusters)}

출력 JSON:
{
  "headline": "이번 주 ${cfg.label} 분야를 한 문장으로 (45자 이내)",
  "overview": "한 주의 전체 흐름 4~5문장",
  "keyPoints": ["핵심 포인트 3~5개, 각 1문장"],
  "issues": [
    { "id": "위 이슈 id 그대로", "title": "이슈 제목 (25자 이내)", "summary": "무슨 일이 있었는지 2~3문장", "whyItMatters": "의미·영향 1문장 (근거 부족하면 빈 문자열)" }
  ],
  "timeline": [ { "date": "MM.DD", "event": "그날의 주요 사건 한 줄" } ],
  "outlook": "다음 주에 지켜볼 점 1~2문장 (자료에 근거한 일정·쟁점만)"
}
- issues 는 중요도 순 최대 ${LIMITS.shortTopics}개. ${cfg.label} 분야와 무관한 이슈는 빼라.
- timeline 은 날짜순 5~8개.`;
}

export async function buildShort(category) {
  const cfg = CATEGORIES[category];
  const to = kstDate();
  const from = kstDate(daysAgo(6));
  const { articles, press } = await collectWeek(category);
  const clusters = clusterArticles(articles).slice(0, LIMITS.shortTopics + 4);
  log(`[단기] ${cfg.label}: 기사 ${articles.length}건 → 이슈 ${clusters.length}개`);

  const ai = clusters.length && aiEnabled() ? await askJSON(prompt(category, from, to, clusters), { tag: `단기/${category}` }) : null;

  const exclude = queryTerms([...cfg.google, ...cfg.naver]);
  const keywords = topKeywords(articles, { exclude, limit: 14 });
  const rising = risingInWeek(articles, { exclude });
  const issues = mergeIssues(ai?.issues, clusters, LIMITS.shortTopics);
  const sources = new Set(articles.map((a) => a.source)).size;

  return {
    period: 'short',
    periodLabel: `${PERIODS.short.label} · ${PERIODS.short.desc}`,
    category,
    categoryLabel: cfg.label,
    range: { from, to },
    updatedAt: new Date().toISOString(),
    ai: Boolean(ai),
    headline: ai?.headline || issues[0]?.title || '수집된 기사가 없습니다',
    overview: ai?.overview || autoOverview(cfg.label, articles.length, sources, issues, keywords),
    keyPoints: ai?.keyPoints || [],
    keywords,
    rising,
    issues,
    timeline: ai?.timeline || autoTimeline(clusters),
    outlook: ai?.outlook || '',
    press: dedupePress(press).slice(0, 12).map(slimArticle),
    stats: { articles: articles.length, sources },
  };
}

/** AI 없이 쓰는 개요: 숫자와 이슈 제목으로만 구성 (해석·평가 없음) */
function autoOverview(label, n, sources, issues, keywords) {
  if (!issues.length) return '';
  const top = issues
    .slice(0, 3)
    .map((it) => `「${it.title}」(기사 ${it.articleCount}건·매체 ${it.sourceCount}곳)`)
    .join(', ');
  const kw = keywords.slice(0, 5).map((k) => k.word).join(', ');
  return `최근 1주 ${label} 분야 기사 ${n.toLocaleString('ko-KR')}건(${sources}개 매체)을 같은 사건끼리 묶었습니다. 가장 많이 보도된 이슈는 ${top}입니다.${kw ? ` 자주 등장한 키워드는 ${kw}입니다.` : ''}`;
}

function dedupePress(items) {
  const seen = new Set();
  return items
    .filter((a) => (seen.has(a.title) ? false : seen.add(a.title)))
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
}
