// 처음 한 번: 최근 3년(36개월) 월간 자료 만들기 → 장기 브리핑이 바로 채워짐
// 사용: npm run backfill            (없는 달만)
//       npm run backfill -- --force (전부 다시)
//       npm run backfill -- --months=12
import 'dotenv/config';
import { CATEGORIES, PERIODS } from './config.js';
import { aiEnabled } from './lib/llm.js';
import { lastMonths, log, mapLimit } from './lib/util.js';
import { buildMonth } from './steps/monthly.js';

const force = process.argv.includes('--force');
const months = Number(process.argv.find((a) => a.startsWith('--months='))?.split('=')[1] || PERIODS.long.months);

const keys = lastMonths(months);
const jobs = Object.keys(CATEGORIES).flatMap((c) => keys.map((k) => ({ c, k })));

log(`백필: ${keys[0]} ~ ${keys[keys.length - 1]} × ${Object.keys(CATEGORIES).length}개 분야 = ${jobs.length}건 · AI ${aiEnabled() ? '켜짐' : '꺼짐'}`);
let done = 0;
await mapLimit(jobs, 3, async ({ c, k }) => {
  await buildMonth(c, k, { force });
  done++;
  if (done % 10 === 0) log(`  진행 ${done}/${jobs.length}`);
});
log('백필 완료. 이어서 `npm run daily` 를 실행하면 중기·장기 브리핑이 만들어집니다.');
