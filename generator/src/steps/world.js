// 해외: 지역별 경제·전쟁·정치 — 한국 언론의 국제 기사(한국어)를 모아 같은 사건끼리 묶음
// 번역이 필요 없어 API 키 없이 동작. Anthropic 키가 있으면 지역·주제별 요약 문단을 AI가 추가로 씀.
import { LIMITS, WORLD_REGIONS, WORLD_THEMES } from '../config.js';
import { fetchGoogle, fetchNaver } from '../sources/index.js';
import { clusterArticles, dedupe } from '../lib/cluster.js';
import { aiEnabled, askJSON } from '../lib/llm.js';
import { queryTerms, topKeywords } from '../lib/textkit.js';
import { daysAgo, kstDate, log } from '../lib/util.js';
import { autoIssue, clusterBlocks } from './common.js';

const PREFIX = { economy: 'e', war: 'w', politics: 'p' };

function prompt(region, themeClusters, from, to) {
  const sections = Object.entries(themeClusters)
    .map(([theme, clusters]) => `# 주제: ${WORLD_THEMES[theme].label} (${theme})\n\n${clusterBlocks(clusters, { perCluster: 4 })}`)
    .join('\n\n');

  return `브리핑: 해외 · ${region.label} 지역 주간 브리핑 (${from} ~ ${to})

${sections}

출력 JSON:
{
  "overview": "${region.label} 지역 이번 주 전체 흐름 3~4문장",
  "themes": {
    "economy":  { "summary": "경제 흐름 2~3문장", "items": [ { "id": "이슈 id 그대로", "title": "이슈 제목 (30자 이내)", "summary": "2문장" } ] },
    "war":      { "summary": "전쟁·안보 흐름 2~3문장", "items": [ ... ] },
    "politics": { "summary": "정치 흐름 2~3문장", "items": [ ... ] }
  }
}
- 각 주제 items 는 그 주제와 ${region.label} 지역에 실제로 해당하는 이슈만, 중요도 순 최대 ${LIMITS.worldItemsPerTheme}개.
- 한국 국내 뉴스(국내 기업·국내 정치 중심 기사)는 빼라.
- 해당 주제에 이번 주 보도가 없으면 summary 를 "이번 주 주요 보도 없음", items 를 [] 로.`;
}

/** AI 없이 쓰는 지역 개요: 숫자와 이슈 제목만 */
function autoWorldOverview(label, total, themes) {
  if (!total) return '';
  const counts = Object.values(themes).map((t) => `${t.label} ${t.items.length}개`).join(', ');
  const top = Object.values(themes)
    .flatMap((t) => t.items.slice(0, 1).map((it) => ({ ...it, theme: t.label })))
    .sort((a, b) => b.articleCount - a.articleCount)[0];
  return `최근 1주 ${label} 관련 국내 언론 기사 ${total.toLocaleString('ko-KR')}건을 주제별로 묶었습니다(${counts} 이슈).${
    top ? ` 가장 많이 보도된 이슈는 ${top.theme} 분야의 「${top.title}」(기사 ${top.articleCount}건)입니다.` : ''
  }`;
}

export async function buildRegion(regionId) {
  const region = WORLD_REGIONS[regionId];
  const to = kstDate();
  const from = kstDate(daysAgo(6));
  const cutoff = daysAgo(LIMITS.maxArticleAgeDays).getTime();

  const themeClusters = {};
  const allClusters = new Map();
  let articleTotal = 0;
  for (const [theme, def] of Object.entries(WORLD_THEMES)) {
    const [google, naver] = await Promise.all([
      fetchGoogle(`(${region.terms}) (${def.terms})`, { when: '7d' }),
      fetchNaver(`${region.naver} ${def.naver}`),
    ]);
    const pool = dedupe([...google, ...naver]).filter((a) => !a.publishedAt || new Date(a.publishedAt).getTime() >= cutoff);
    articleTotal += pool.length;
    const clusters = clusterArticles(pool, { prefix: PREFIX[theme] }).slice(0, LIMITS.worldItemsPerTheme + 3);
    themeClusters[theme] = { clusters, keywords: topKeywords(pool, { exclude: queryTerms([region.terms, def.terms]), limit: 8 }) };
    clusters.forEach((c) => allClusters.set(c.id, c));
  }
  log(`[해외] ${region.label}: 기사 ${articleTotal}건 → 이슈 ${allClusters.size}개`);

  const ai =
    allClusters.size && aiEnabled()
      ? await askJSON(
          prompt(region, Object.fromEntries(Object.entries(themeClusters).map(([k, v]) => [k, v.clusters])), from, to),
          { maxTokens: 5000, tag: `해외/${regionId}` },
        )
      : null;

  const themes = {};
  for (const [theme, def] of Object.entries(WORLD_THEMES)) {
    const aiTheme = ai?.themes?.[theme];
    const { clusters, keywords } = themeClusters[theme];
    const items = aiTheme?.items?.length
      ? aiTheme.items
          .filter((it) => allClusters.has(it.id))
          .map((it) => ({ ...autoIssue(allClusters.get(it.id)), title: it.title, summary: it.summary || '' }))
      : clusters.slice(0, LIMITS.worldItemsPerTheme).map(autoIssue);
    themes[theme] = { label: def.label, summary: aiTheme?.summary || '', keywords, items };
  }

  return {
    region: regionId,
    label: region.label,
    range: { from, to },
    updatedAt: new Date().toISOString(),
    ai: Boolean(ai),
    overview: ai?.overview || autoWorldOverview(region.label, articleTotal, themes),
    stats: { articles: articleTotal },
    themes,
  };
}
