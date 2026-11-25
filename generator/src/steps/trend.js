// 중기(6개월)·장기(3년) 브리핑: 월간 자료를 이어 붙여 큰 흐름·키워드 추이를 정리 (AI 선택)
import { CATEGORIES, PERIODS } from '../config.js';
import { askJSON, aiEnabled } from '../lib/llm.js';
import { lastMonths, log } from '../lib/util.js';
import { loadMonth } from './monthly.js';
import { buildThreads, keywordTrends, monthTimeline } from '../lib/textkit.js';

function monthBlock(m, { minImportance }) {
  const topics = m.topics
    .filter((t) => t.importance >= minImportance)
    .map((t) => `  - ${t.ref} (중요도 ${t.importance}) ${t.title}${t.summary ? ` — ${t.summary}` : ''}`)
    .join('\n');
  const events = (m.keyEvents || []).map((e) => `  · ${e.date} ${e.event}`).join('\n');
  return `## ${m.month}${m.summary ? `\n요약: ${m.summary}` : ''}\n이슈:\n${topics || '  (없음)'}${events ? `\n주요 사건:\n${events}` : ''}`;
}

function prompt(period, category, months) {
  const cfg = CATEGORIES[category];
  const p = PERIODS[period];
  const isLong = period === 'long';
  const blocks = months.map((m) => monthBlock(m, { minImportance: isLong ? 3 : 1 })).join('\n\n');

  return `브리핑: ${cfg.label} 분야 ${p.label} 브리핑 (${p.desc}: ${months[0].month} ~ ${months[months.length - 1].month})
관점: ${cfg.focus}
${isLong ? '3년에 걸친 구조적 변화, 정책·제도의 전환점, 반복되는 쟁점을 중심으로 정리한다. 연도별 차이가 드러나게 한다.' : '6개월 동안 이어진 흐름(쟁점이 어떻게 시작·확대·정리됐는지)을 중심으로 정리한다.'}

아래는 월별 정리 자료다. 이슈 앞의 코드(YYYY-MM#tN)는 참조용이다.

${blocks}

출력 JSON:
{
  "headline": "이 기간 ${cfg.label} 분야를 한 문장으로 (45자 이내)",
  "overview": "기간 전체 흐름 5~6문장",
  "keyPoints": ["핵심 포인트 4~6개, 각 1문장"],
  "issues": [
    {
      "title": "흐름/쟁점 이름 (25자 이내)",
      "summary": "어떻게 전개됐는지 3~4문장",
      "whyItMatters": "의미·영향 1문장",
      "span": "${isLong ? 'YYYY.MM~YYYY.MM' : 'YYYY.MM~YYYY.MM'} (이 흐름이 이어진 기간)",
      "refs": ["관련 이슈 코드 2~6개"]
    }
  ],
  "timeline": [ { "date": "YYYY.MM", "event": "전환점이 된 사건 한 줄" } ],
  "outlook": "앞으로 지켜볼 점 1~2문장 (자료 근거로)"
}
- issues 는 ${isLong ? '6~8' : '5~7'}개, 여러 달에 걸친 흐름을 우선한다.
- timeline 은 날짜순 ${isLong ? '10~14' : '6~10'}개.`;
}

/** AI 없이 쓰는 개요: 숫자·이슈 제목·키워드 증감만 (해석·평가 없음) */
function autoTrendOverview({ cfg, keys, months, articles, longest, rising, falling }) {
  const parts = [
    `${keys[0].replace('-', '.')}부터 ${keys.at(-1).replace('-', '.')}까지 ${months.length}개월치 ${cfg.label} 기사 ${articles.toLocaleString('ko-KR')}건을 월별로 묶어 이었습니다.`,
  ];
  if (longest.length) parts.push(`여러 달 이어진 이슈는 ${longest.join(', ')}입니다.`);
  if (rising.length && falling.length) parts.push(`기간 후반으로 갈수록 ${rising.join(', ')} 언급은 늘고, ${falling.join(', ')} 언급은 줄었습니다.`);
  else if (rising.length) parts.push(`기간 후반으로 갈수록 ${rising.join(', ')} 언급이 늘었습니다.`);
  else if (falling.length) parts.push(`기간 후반으로 갈수록 ${falling.join(', ')} 언급이 줄었습니다.`);
  return parts.join(' ');
}

export async function buildTrend(period, category) {
  const cfg = CATEGORIES[category];
  const keys = lastMonths(PERIODS[period].months);
  const months = (await Promise.all(keys.map((k) => loadMonth(k, category)))).filter(Boolean);
  log(`[${PERIODS[period].label}] ${cfg.label}: 월간 자료 ${months.length}/${keys.length}개월`);

  const base = {
    period,
    periodLabel: `${PERIODS[period].label} · ${PERIODS[period].desc}`,
    category,
    categoryLabel: cfg.label,
    range: { from: keys[0], to: keys[keys.length - 1] },
    coverage: { monthsAvailable: months.length, monthsTotal: keys.length },
    updatedAt: new Date().toISOString(),
  };

  if (!months.length) {
    return { ...base, ai: false, headline: '아직 월간 자료가 없습니다', overview: '`npm run backfill` 로 지난 자료를 먼저 만들어 주세요.', keyPoints: [], issues: [], timeline: [], outlook: '' };
  }

  // AI와 관계없이 항상: 키워드 흐름(추이·상승·하락)
  const trends = keywordTrends(months, { top: 8 });
  base.trends = trends;
  base.stats = { articles: months.reduce((n, m) => n + (m.articleCount || 0), 0) };

  const refMap = new Map(months.flatMap((m) => m.topics.map((t) => [t.ref, t])));
  const ai = aiEnabled() ? await askJSON(prompt(period, category, months), { maxTokens: 6000, tag: `${period}/${category}` }) : null;

  if (!ai) {
    // AI 없이: 여러 달에 걸쳐 이어진 이슈를 묶어 '흐름'으로, 구간별 최대 이슈를 '전환점'으로
    const isLong = period === 'long';
    const threads = buildThreads(months, { limit: isLong ? 8 : 7 });
    const top = threads[0];
    const longest = threads.filter((t) => t.monthCount > 1).slice(0, 3).map((t) => `「${t.title}」(${t.monthCount}개월)`);
    const rising = trends.rising.slice(0, 4).map((r) => r.word);
    const falling = trends.falling.slice(0, 3).map((r) => r.word);
    return {
      ...base,
      ai: false,
      headline: top ? `${PERIODS[period].desc} ${cfg.label}: 「${top.title}」` : '',
      overview: autoTrendOverview({ cfg, keys, months, articles: base.stats.articles, longest, rising, falling }),
      keyPoints: [],
      issues: threads.map((t) => ({ ...t, whyItMatters: '' })),
      timeline: monthTimeline(months, { stepMonths: isLong ? 3 : 1 }),
      outlook: '',
    };
  }

  const issues = (ai.issues || []).map((it) => {
    const refs = (it.refs || []).map((r) => refMap.get(r)).filter(Boolean);
    return {
      title: it.title,
      summary: it.summary || '',
      whyItMatters: it.whyItMatters || '',
      span: it.span || '',
      articleCount: refs.reduce((n, t) => n + (t.articleCount || 0), 0),
      articles: refs.flatMap((t) => t.articles.slice(0, 2)).slice(0, 6),
    };
  });

  return {
    ...base,
    ai: true,
    headline: ai.headline || '',
    overview: ai.overview || '',
    keyPoints: ai.keyPoints || [],
    issues,
    timeline: ai.timeline || [],
    outlook: ai.outlook || '',
  };
}
