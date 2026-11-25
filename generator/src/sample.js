// 디자인 미리보기용 예시 데이터 (실제 뉴스 아님): npm run sample → npm run serve
// 실제 데이터는 `npm run daily` 가 덮어씁니다.
import path from 'node:path';
import { CATEGORIES, PERIODS, WORLD_REGIONS, WORLD_THEMES } from './config.js';
import { WEB_DATA, kstDate, lastMonths, writeJSON } from './lib/util.js';

const now = new Date().toISOString();
const art = (n, kind = 'news') => ({
  title: `예시 기사 제목 ${n} — 실제 데이터는 첫 업데이트 후 표시됩니다`,
  link: 'https://news.google.com/',
  source: kind === 'press' ? '예시 부처' : `예시 매체 ${n}`,
  publishedAt: new Date(Date.now() - n * 3600_000 * 7).toISOString(),
  kind,
});

for (const [cid, c] of Object.entries(CATEGORIES)) {
  for (const [pid, p] of Object.entries(PERIODS)) {
    const months = lastMonths(p.months || 1);
    await writeJSON(path.join(WEB_DATA, 'briefings', `${pid}-${cid}.json`), {
      period: pid,
      periodLabel: `${p.label} · ${p.desc}`,
      category: cid,
      categoryLabel: c.label,
      range: pid === 'short' ? { from: kstDate(new Date(Date.now() - 6 * 86400_000)), to: kstDate() } : { from: months[0], to: months.at(-1) },
      updatedAt: now,
      ai: false,
      headline: `[예시] ${c.label} 분야 ${p.label} 브리핑 헤드라인이 이 자리에 표시됩니다`,
      overview: `이 화면은 디자인 미리보기용 예시입니다. 생성기를 실행하면 ${p.desc} 동안의 ${c.label} 기사 수·매체 수와 가장 많이 보도된 이슈, 자주 나온 키워드를 정리한 개요가 들어갑니다.`,
      keyPoints: [],
      keywords: pid === 'short' ? ['키워드가', '이곳에', '많이', '나온', '순서로', '표시됩니다'].map((word, i) => ({ word, count: 30 - i * 4 })) : [],
      rising: pid === 'short' ? [{ word: '예시', change: 120 }, { word: '키워드', change: null }] : [],
      trends: pid === 'short' ? undefined : {
        months,
        unit: '기사 100건당 언급',
        series: ['키워드1', '키워드2', '키워드3', '키워드4', '키워드5'].map((word, k) => ({
          word,
          values: months.map((_, i) => Math.round((8 + 6 * Math.sin(i / 2 + k) + k * 2) * 10) / 10),
        })),
        rising: [{ word: '키워드2', change: 85 }],
        falling: [{ word: '키워드4', change: -40 }],
      },
      issues: [1, 2, 3].map((i) => ({
        title: `예시 ${pid === 'short' ? '이슈' : '흐름'} ${i}`,
        summary: '같은 사건을 다룬 기사들 중 핵심 단어를 가장 많이 담은 발췌 문장이 이 자리에 들어갑니다.',
        whyItMatters: '',
        headlines: [{ source: '예시 매체 A', title: '같은 사건을 다른 매체는 이런 제목으로 보도했습니다' }, { source: '예시 매체 B', title: '매체별 제목을 최대 3개까지 보여줍니다' }],
        days: 4,
        monthCount: pid === 'short' ? undefined : 4 - i,
        span: pid === 'short' ? '' : `${months[0].replace('-', '.')}~${months.at(-1).replace('-', '.')}`,
        sourceCount: 6 - i,
        articleCount: 14 - i * 3,
        articles: [art(i, 'press'), art(i + 1), art(i + 2)],
      })),
      timeline: [1, 2, 3, 4].map((i) => ({ date: pid === 'short' ? `11.${17 + i}` : `${months[Math.min(i, months.length - 1)].replace('-', '.')}`, event: `타임라인 예시 사건 ${i}` })),
      outlook: '',
      press: pid === 'short' ? [art(1, 'press'), art(2, 'press')] : [],
      stats: pid === 'short' ? { articles: 312, sources: 48 } : undefined,
      coverage: pid === 'long' ? { monthsAvailable: 12, monthsTotal: 36 } : undefined,
    });
  }
}

for (const [rid, r] of Object.entries(WORLD_REGIONS)) {
  await writeJSON(path.join(WEB_DATA, 'world', `${rid}.json`), {
    region: rid,
    label: r.label,
    range: { from: kstDate(new Date(Date.now() - 6 * 86400_000)), to: kstDate() },
    updatedAt: now,
    ai: false,
    overview: '',
    stats: { articles: 240 },
    themes: Object.fromEntries(
      Object.entries(WORLD_THEMES).map(([tid, t]) => [
        tid,
        {
          label: t.label,
          summary: '',
          keywords: [{ word: '지역', count: 12 }, { word: '키워드', count: 9 }, { word: '예시', count: 7 }],
          items: [1, 2].map((i) => ({
            title: `${t.label} 예시 이슈 ${i} — 한국 언론 국제 기사 대표 제목`,
            summary: '',
            headlines: [{ source: '예시 매체', title: '같은 사건의 다른 매체 제목' }],
            span: '11.19~11.24',
            days: 3,
            sourceCount: 4,
            articleCount: 5,
            articles: [art(i), art(i + 1)],
          })),
        },
      ]),
    ),
  });
}

await writeJSON(path.join(WEB_DATA, 'press.json'), {
  updatedAt: now,
  items: Object.keys(CATEGORIES).flatMap((c, i) => [{ ...art(i + 1, 'press'), category: c }]),
});
await writeJSON(path.join(WEB_DATA, 'meta.json'), {
  updatedAt: now,
  date: kstDate(),
  sample: true,
  regions: Object.fromEntries(Object.entries(WORLD_REGIONS).map(([k, v]) => [k, { label: v.label }])),
});
console.log('예시 데이터 생성 완료 → npm run serve 로 확인하세요 (실제 뉴스 아님)');
