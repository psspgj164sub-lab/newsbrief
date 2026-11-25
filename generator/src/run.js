// 매일 실행: 단기·중기·장기 × 노동·정치·사회·경제, 해외 지역별, 보도자료 목록 → web/data/*.json
import 'dotenv/config';
import path from 'node:path';
import { CATEGORIES, PERIODS, WORLD_REGIONS, WORLD_THEMES } from './config.js';
import { aiEnabled } from './lib/llm.js';
import { naverEnabled } from './sources/index.js';
import { ARCHIVE, WEB_DATA, kstDate, lastMonths, log, mapLimit, readJSON, writeJSON } from './lib/util.js';
import { buildShort } from './steps/short.js';
import { buildMonth } from './steps/monthly.js';
import { buildTrend } from './steps/trend.js';
import { buildRegion } from './steps/world.js';

const cats = Object.keys(CATEGORIES);
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]; // 예: --only=short,world

const want = (step) => !only || only.split(',').includes(step);

async function main() {
  const started = Date.now();
  log(`뉴스브리핑 생성 시작 · AI ${aiEnabled() ? '켜짐' : '꺼짐'} · 네이버 ${naverEnabled() ? '켜짐' : '꺼짐'}`);
  const status = {};

  // 1) 월간 자료: 이번 달은 매일 갱신, 지난달은 월초 3일간 최종 갱신, 빠진 달은 채움
  if (want('monthly')) {
    const [thisMonth] = lastMonths(1);
    const [prevMonth] = lastMonths(2);
    const day = Number(kstDate().slice(8, 10));
    await mapLimit(cats, 2, async (c) => {
      await buildMonth(c, thisMonth, { force: true });
      await buildMonth(c, prevMonth, { force: day <= 3 });
      // 중기(6개월) 범위의 빈 달은 자동으로 채움 (장기 3년 전체는 backfill 로)
      for (const k of lastMonths(PERIODS.mid.months)) await buildMonth(c, k);
    });
  }

  // 2) 단기
  if (want('short')) {
    await mapLimit(cats, 2, async (c) => {
      const data = await buildShort(c);
      await writeJSON(path.join(WEB_DATA, 'briefings', `short-${c}.json`), data);
      status[`short-${c}`] = data.ai;
    });
  }

  // 3) 중기·장기
  const isMonday = new Date(Date.now() + 9 * 3600_000).getUTCDay() === 1;
  for (const period of ['mid', 'long']) {
    if (!want(period)) continue;
    const file = (c) => path.join(WEB_DATA, 'briefings', `${period}-${c}.json`);
    if (period === 'long' && process.env.LONG_REFRESH === 'weekly' && !isMonday) {
      const exists = await readJSON(file(cats[0]));
      if (exists) {
        log('[장기] 주간 갱신 설정 → 오늘은 건너뜀');
        continue;
      }
    }
    await mapLimit(cats, 2, async (c) => {
      const data = await buildTrend(period, c);
      await writeJSON(file(c), data);
      status[`${period}-${c}`] = data.ai;
    });
  }

  // 4) 해외
  if (want('world')) {
    await mapLimit(Object.keys(WORLD_REGIONS), 2, async (r) => {
      const data = await buildRegion(r);
      await writeJSON(path.join(WEB_DATA, 'world', `${r}.json`), data);
      status[`world-${r}`] = data.ai;
    });
  }

  // 5) 보도자료 모음 (단기 브리핑에서 수집한 것 합치기)
  const press = [];
  for (const c of cats) {
    const b = await readJSON(path.join(WEB_DATA, 'briefings', `short-${c}.json`));
    (b?.press || []).forEach((p) => press.push({ ...p, category: c }));
  }
  press.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  await writeJSON(path.join(WEB_DATA, 'press.json'), { updatedAt: new Date().toISOString(), items: press });

  // 6) 메타
  await writeJSON(path.join(WEB_DATA, 'meta.json'), {
    updatedAt: new Date().toISOString(),
    date: kstDate(),
    ai: aiEnabled(),
    periods: Object.fromEntries(Object.entries(PERIODS).map(([k, v]) => [k, { label: v.label, desc: v.desc }])),
    categories: Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, { label: v.label }])),
    regions: Object.fromEntries(Object.entries(WORLD_REGIONS).map(([k, v]) => [k, { label: v.label }])),
    themes: Object.fromEntries(Object.entries(WORLD_THEMES).map(([k, v]) => [k, { label: v.label }])),
  });

  await writeJSON(path.join(ARCHIVE, 'runs', `${kstDate()}.json`), { finishedAt: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), status });
  log(`완료 (${Math.round((Date.now() - started) / 1000)}초)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
