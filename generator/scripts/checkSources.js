// 소스 점검: npm run check-sources
import 'dotenv/config';
import Parser from 'rss-parser';
import { CATEGORIES, EDITORIAL_PAPERS, PRESS_FEEDS, WORLD_REGIONS } from '../src/config.js';
import { fetchNaver, googleUrl, naverEnabled } from '../src/sources/index.js';

const parser = new Parser({ timeout: 15_000, headers: { 'User-Agent': 'Mozilla/5.0 (NewsBriefing/1.0)' } });

async function check(name, url) {
  try {
    const f = await parser.parseURL(url);
    console.log(`✅ ${name} (${f.items.length}건)`);
  } catch (e) {
    console.log(`❌ ${name} → ${e.message}`);
  }
}

console.log('\n[보도자료 RSS]');
for (const f of PRESS_FEEDS) await check(`${f.agency}${f.note ? `·${f.note}` : ''}${f.verified ? '' : ' (미확인 주소)'}`, f.url);

console.log('\n[구글뉴스]');
for (const [id, c] of Object.entries(CATEGORIES)) await check(`${c.label}: ${c.google[0]}`, googleUrl(c.google[0], { when: '7d' }));
await check('해외(한국어) 샘플', googleUrl(`(${WORLD_REGIONS.europe.terms}) 경제`, { when: '7d' }));
await check('기간 검색 샘플', googleUrl(CATEGORIES.labor.google[0], { after: '2024-01-01', before: '2024-02-01' }));

console.log('\n[사설 (구글뉴스 site: 검색, 최근 2일)]');
for (const p of EDITORIAL_PAPERS) {
  try {
    const f = await parser.parseURL(googleUrl(`사설 site:${p.domain}`, { when: '2d' }));
    const n = f.items.filter((it) => /\[\s*사설\s*\]/.test(it.title)).length;
    console.log(`${n ? '✅' : '⚠️ '} ${p.label}: 검색 ${f.items.length}건 중 [사설] 제목 ${n}건`);
  } catch (e) {
    console.log(`❌ ${p.label} → ${e.message}`);
  }
}

console.log('\n[네이버 뉴스 검색]');
if (!naverEnabled()) console.log('⏭  키 없음 (NAVER_HUB_KEY_ID / NAVER_HUB_KEY)');
else {
  const items = await fetchNaver('노동', { display: 5 });
  console.log(items.length ? `✅ ${items.length}건: ${items[0].title}` : '❌ 결과 없음 (키·권한 확인)');
}
