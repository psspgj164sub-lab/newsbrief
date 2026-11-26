/* 뉴스브리핑 PWA — 의존성 없는 바닐라 JS */
(() => {
  'use strict';

  const PERIODS = [
    { id: 'short', label: '단기', desc: '최근 1주' },
    { id: 'mid', label: '중기', desc: '최근 6개월' },
    { id: 'long', label: '장기', desc: '최근 3년' },
  ];
  const CATS = [
    { id: 'labor', label: '노동' },
    { id: 'politics', label: '정치' },
    { id: 'society', label: '사회' },
    { id: 'economy', label: '경제' },
  ];
  const DEFAULT_REGIONS = [
    ['northAmerica', '북미'], ['europe', '유럽'], ['russiaUkraine', '러시아·우크라이나'], ['middleEast', '중동'],
    ['eastAsia', '동아시아'], ['southAsia', '남·동남아시아'], ['latinAmerica', '중남미'], ['africa', '아프리카'],
  ];
  const THEMES = [
    { id: 'economy', label: '경제', color: 'var(--c-economy)' },
    { id: 'war', label: '전쟁·안보', color: 'var(--c-labor)' },
    { id: 'politics', label: '정치', color: 'var(--c-politics)' },
  ];
  const catColor = (id) => `var(--c-${id})`;

  const $view = document.getElementById('view');
  const $updated = document.getElementById('updated');
  const $refresh = document.getElementById('refresh');
  let meta = null;

  // ── 유틸 ─────────────────────────────
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  function ago(iso) {
    if (!iso) return '';
    const m = (Date.now() - new Date(iso).getTime()) / 60000;
    if (m < 60) return `${Math.max(1, Math.floor(m))}분 전`;
    if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
    if (m < 1440 * 30) return `${Math.floor(m / 1440)}일 전`;
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  function stamp(iso) {
    const d = new Date(iso);
    const days = '일월화수목금토';
    return `${d.getMonth() + 1}월 ${d.getDate()}일(${days[d.getDay()]}) ${d.getHours() < 12 ? '오전' : '오후'} ${((d.getHours() + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} 업데이트`;
  }

  const fmtRange = (r) => (r ? `${String(r.from).replace(/-/g, '.')} ~ ${String(r.to).replace(/-/g, '.')}` : '');

  async function getJSON(path, { fresh = false } = {}) {
    const res = await fetch(path + (fresh ? `?t=${Date.now()}` : ''), { cache: fresh ? 'no-store' : 'default' });
    if (!res.ok) throw new Error(res.status === 404 ? '아직 생성된 브리핑이 없습니다.' : `불러오기 실패 (${res.status})`);
    return res.json();
  }

  // ── 라우팅: #/domestic/short/labor · #/world/europe · #/press/economy ──
  function parseRoute() {
    const [tab, a, b] = location.hash.replace(/^#\/?/, '').split('/');
    const last = store.get('last', {});
    if (tab === 'world') return { tab, region: a || last.region || 'northAmerica' };
    if (tab === 'press') return { tab, cat: a || 'all' };
    if (tab === 'editorials') return { tab, view: a === 'week' ? 'week' : 'today' };
    return {
      tab: 'domestic',
      period: PERIODS.some((p) => p.id === a) ? a : last.period || 'short',
      cat: CATS.some((c) => c.id === b) ? b : last.cat || 'labor',
    };
  }

  const go = (hash) => { if (location.hash !== hash) location.hash = hash; else render(); };

  // ── 공통 조각 ─────────────────────────
  const skeleton = () => `<div class="skeleton"></div><div class="section"><div class="skeleton s2"></div><div class="skeleton s2"></div></div>`;
  const errorBox = (msg) => `<div class="empty">${esc(msg)}<br/><br/><button class="chip" data-action="retry">다시 시도</button></div>`;

  function articleList(articles = []) {
    if (!articles.length) return '';
    return `<details class="articles"><summary>관련 기사 ${articles.length}건</summary>${articles
      .map(
        (a) => `<a class="art" href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">
          <div class="t">${esc(a.title)}</div>
          <div class="s">${a.kind === 'press' ? '<span class="tag-press">보도자료</span> · ' : ''}${esc(a.source)} · ${esc(ago(a.publishedAt))}</div>
        </a>`,
      )
      .join('')}</details>`;
  }

  function issueCard(it, i, color) {
    const sub = [
      it.span,
      it.monthCount > 1 ? `${it.monthCount}개월 이어짐` : it.days > 1 ? `${it.days}일간 보도` : '',
      it.sourceCount ? `매체 ${it.sourceCount}곳` : '',
      it.articleCount ? `기사 ${it.articleCount}건` : '',
    ].filter(Boolean).join(' · ');
    const alt = (it.headlines || []).length
      ? `<ul class="alt">${it.headlines.map((h) => `<li><span class="alt-src">${esc(h.source)}</span>${esc(h.title)}</li>`).join('')}</ul>`
      : '';
    return `<article class="card" style="--chip-color:${color}">
      <div class="card-head"><div class="rank">${i + 1}</div><div>
        <h3>${esc(it.title)}</h3>
        ${sub ? `<div class="sub">${esc(sub)}${it.hasPress ? ' · <span class="tag-press">보도자료 있음</span>' : ''}</div>` : ''}
      </div></div>
      <div class="body">
        ${it.summary ? `<p>${esc(it.summary)}</p>` : ''}
        ${it.whyItMatters ? `<p class="why"><b>왜 중요한가</b>${esc(it.whyItMatters)}</p>` : ''}
        ${alt}
      </div>
      ${articleList(it.articles)}
    </article>`;
  }

  function keywordChips(list = [], { max = 14 } = {}) {
    if (!list.length) return '';
    return `<div class="kw">${list.slice(0, max).map((k) => `<span>${esc(k.word)}${k.count ? `<b>${k.count}</b>` : ''}</span>`).join('')}</div>`;
  }

  function deltaChips(list = [], dir) {
    if (!list.length) return '';
    return list
      .map((k) => {
        const pct = k.change == null ? (dir === 'up' ? '새로 등장' : '') : `${k.change > 0 ? '+' : ''}${k.change}%`;
        return `<span class="delta ${dir}"><i aria-hidden="true">${dir === 'up' ? '▲' : '▼'}</i>${esc(k.word)}${pct ? ` <small>${esc(pct)}</small>` : ''}</span>`;
      })
      .join('');
  }

  /**
   * 키워드 흐름: 키워드마다 한 줄씩 작은 막대(월별) — 모든 줄이 같은 세로 척도
   * 막대에 마우스를 올리거나 길게 누르면 월·수치가 보임
   */
  function trendChart(tr) {
    if (!tr?.series?.length) return '';
    const max = Math.max(1, ...tr.series.flatMap((s) => s.values));
    const n = tr.months.length;
    const W = 220;
    const H = 34;
    const gap = n > 12 ? 1 : 2;
    const bw = Math.max(2, (W - gap * (n - 1)) / n);
    const rows = tr.series
      .map((s) => {
        const bars = s.values
          .map((v, i) => {
            const h = v > 0 ? Math.max(2, (v / max) * (H - 2)) : 0;
            const x = i * (bw + gap);
            const label = `${tr.months[i].replace('-', '.')} · ${s.word}: ${v} (${tr.unit})`;
            return `<g class="bar"><title>${esc(label)}</title><rect class="hit" x="${x}" y="0" width="${bw + gap}" height="${H}"></rect>${
              h ? `<rect class="v" x="${x}" y="${H - h}" width="${bw}" height="${h}" rx="${Math.min(2, bw / 2)}"></rect>` : ''
            }</g>`;
          })
          .join('');
        const last = Math.round((s.values.reduce((a, b) => a + b, 0) / Math.max(1, s.values.length)) * 10) / 10;
        return `<div class="trend-row">
          <span class="tw">${esc(s.word)}</span>
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(s.word)} 월별 추이">${bars}<line x1="0" y1="${H - 0.5}" x2="${W}" y2="${H - 0.5}" class="base"></line></svg>
          <span class="tv">${last}</span>
        </div>`;
      })
      .join('');
    const table = `<details class="trend-table"><summary>표로 보기</summary><div class="tbl-wrap"><table><thead><tr><th>키워드</th>${tr.months
      .map((m) => `<th>${esc(m.slice(2).replace('-', '.'))}</th>`)
      .join('')}</tr></thead><tbody>${tr.series
      .map((s) => `<tr><th>${esc(s.word)}</th>${s.values.map((v) => `<td>${v}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></div></details>`;
    return `<div class="trend">
      <div class="trend-axis"><span>${esc(tr.months[0].replace('-', '.'))}</span><span>${esc(tr.unit)} · 오른쪽 = 기간 평균</span><span>${esc(tr.months.at(-1).replace('-', '.'))}</span></div>
      ${rows}
      ${tr.rising?.length || tr.falling?.length ? `<div class="deltas">${deltaChips(tr.rising, 'up')}${deltaChips(tr.falling, 'down')}</div>` : ''}
      ${table}
    </div>`;
  }

  // ── 국내 ─────────────────────────────
  async function renderDomestic({ period, cat }, fresh) {
    store.set('last', { ...store.get('last', {}), period, cat });
    const color = catColor(cat);
    const controls = `<div class="controls">
      <div class="segment" role="tablist" aria-label="기간">${PERIODS.map(
        (p) => `<button role="tab" aria-selected="${p.id === period}" data-go="#/domestic/${p.id}/${cat}"><b>${p.label}</b><small>${p.desc}</small></button>`,
      ).join('')}</div>
      <div class="chips" role="tablist" aria-label="분야">${CATS.map(
        (c) => `<button class="chip" role="tab" style="--chip-color:${catColor(c.id)}" aria-selected="${c.id === cat}" data-go="#/domestic/${period}/${c.id}">${c.label}</button>`,
      ).join('')}</div>
    </div>`;

    $view.innerHTML = controls + skeleton();
    let b;
    try {
      b = await getJSON(`data/briefings/${period}-${cat}.json`, { fresh });
    } catch (e) {
      $view.innerHTML = controls + errorBox(e.message);
      return;
    }

    const p = PERIODS.find((x) => x.id === period);
    const coverage =
      b.coverage && b.coverage.monthsAvailable < b.coverage.monthsTotal
        ? `<div class="notice">월간 자료 ${b.coverage.monthsAvailable}/${b.coverage.monthsTotal}개월로 만든 브리핑입니다. 자료가 쌓이면 더 정확해집니다.</div>`
        : '';

    $view.innerHTML =
      controls +
      `<section class="hero" style="--chip-color:${color}">
        <div class="kicker"><span class="badge cat">${esc(b.categoryLabel)}</span><span class="badge">${p.label} · ${p.desc}</span><span class="badge">${esc(fmtRange(b.range))}</span></div>
        <h2>${esc(b.headline)}</h2>
        ${b.overview ? `<p>${esc(b.overview)}</p>` : ''}
        <div class="meta">${esc(stamp(b.updatedAt))}${b.stats?.articles ? ` · 기사 ${b.stats.articles.toLocaleString('ko-KR')}건` : ''}${b.stats?.sources ? ` · ${b.stats.sources}개 매체` : ''} · ${b.ai ? 'AI 요약' : '자동 정리'}</div>
      </section>
      ${coverage}
      ${b.keyPoints?.length ? `<div class="section"><h2 class="section-title">핵심 포인트</h2><ul class="points">${b.keyPoints.map((k) => `<li>${esc(k)}</li>`).join('')}</ul></div>` : ''}
      ${b.keywords?.length ? `<div class="section"><h2 class="section-title">많이 나온 키워드</h2>${keywordChips(b.keywords)}${
        b.rising?.length ? `<p class="kw-note">최근 3일 사이 늘어난 키워드</p><div class="deltas">${deltaChips(b.rising, 'up')}</div>` : ''
      }</div>` : ''}
      ${b.trends?.series?.length ? `<div class="section"><h2 class="section-title">키워드 흐름</h2>${trendChart(b.trends)}</div>` : ''}
      <div class="section"><h2 class="section-title">${period === 'short' ? '주요 이슈' : '주요 흐름'}</h2>
        ${b.issues?.length ? b.issues.map((it, i) => issueCard(it, i, color)).join('') : '<div class="empty">표시할 이슈가 없습니다.</div>'}
      </div>
      ${b.timeline?.length ? `<div class="section"><h2 class="section-title">${period === 'short' ? '일자별 흐름' : '전환점'}</h2><ul class="timeline">${b.timeline.map((t) => `<li><div class="d">${esc(t.date)}</div><div class="e">${esc(t.event)}</div></li>`).join('')}</ul></div>` : ''}
      ${b.outlook ? `<div class="section"><h2 class="section-title">앞으로 볼 것</h2><div class="outlook">${esc(b.outlook)}</div></div>` : ''}
      ${b.press?.length ? `<div class="section"><h2 class="section-title">관련 보도자료</h2>${b.press.map(pressItem).join('')}</div>` : ''}
      <p class="foot">출처: 네이버 뉴스 검색 · 구글 뉴스 · 정부 부처 · 한국은행 보도자료</p>`;
  }

  // ── 해외 ─────────────────────────────
  async function renderWorld({ region }, fresh) {
    store.set('last', { ...store.get('last', {}), region });
    const regions = meta?.regions ? Object.entries(meta.regions).map(([id, r]) => [id, r.label]) : DEFAULT_REGIONS;
    const controls = `<div class="controls"><div class="chips" role="tablist" aria-label="지역" style="padding-top:2px">${regions
      .map(([id, label]) => `<button class="chip" role="tab" style="--chip-color:var(--c-world)" aria-selected="${id === region}" data-go="#/world/${id}">${esc(label)}</button>`)
      .join('')}</div></div>`;

    $view.innerHTML = controls + skeleton();
    let w;
    try {
      w = await getJSON(`data/world/${region}.json`, { fresh });
    } catch (e) {
      $view.innerHTML = controls + errorBox(e.message);
      return;
    }

    const themeHtml = THEMES.map((t) => {
      const th = w.themes?.[t.id];
      if (!th) return '';
      const items = th.items?.length
        ? th.items.map((it, i) => issueCard({ ...it, title: it.title || it.titleKo, summary: it.summary ?? it.summaryKo }, i, t.color)).join('')
        : '<p class="theme-summary">이번 주 모인 보도가 없습니다.</p>';
      return `<div class="theme-head"><span class="theme-dot" style="--dot:${t.color}"></span><h3>${t.label}</h3></div>
        ${th.summary ? `<p class="theme-summary">${esc(th.summary)}</p>` : ''}${keywordChips(th.keywords, { max: 8 })}${items}`;
    }).join('');

    $view.innerHTML =
      controls +
      `<section class="hero">
        <div class="kicker"><span class="badge cat" style="--chip-color:var(--c-world)">해외</span><span class="badge">${esc(w.label)}</span><span class="badge">${esc(fmtRange(w.range))}</span></div>
        <h2>${esc(w.label)} 이번 주 경제·전쟁·정치</h2>
        ${w.overview ? `<p>${esc(w.overview)}</p>` : ''}
        <div class="meta">${esc(stamp(w.updatedAt))}${w.stats?.articles ? ` · 기사 ${w.stats.articles.toLocaleString('ko-KR')}건` : ''} · ${w.ai ? 'AI 요약' : '자동 정리'}</div>
      </section>
      <div class="section">${themeHtml}</div>
      <p class="foot">출처: 네이버 뉴스 검색 · 구글 뉴스 — 한국 언론의 국제 기사를 지역·주제별로 모았습니다.</p>`;
  }

  // ── 보도자료 ───────────────────────────
  function pressItem(p) {
    return `<a class="press-item" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer" style="--chip-color:${p.category ? catColor(p.category) : 'var(--brand)'}">
      <div class="top"><span class="agency">${esc(p.source || p.agency)}</span><span>${esc(ago(p.publishedAt))}</span></div>
      <div class="t">${esc(p.title)}</div>
    </a>`;
  }

  async function renderPress({ cat }, fresh) {
    const filters = [{ id: 'all', label: '전체' }, ...CATS];
    const controls = `<div class="controls"><div class="chips" role="tablist" style="padding-top:2px">${filters
      .map((c) => `<button class="chip" role="tab" style="--chip-color:${c.id === 'all' ? 'var(--brand)' : catColor(c.id)}" aria-selected="${c.id === cat}" data-go="#/press/${c.id}">${c.label}</button>`)
      .join('')}</div></div>`;
    $view.innerHTML = controls + skeleton();
    try {
      const data = await getJSON('data/press.json', { fresh });
      const items = data.items.filter((p) => cat === 'all' || p.category === cat);
      $view.innerHTML =
        controls +
        `<div class="section"><h2 class="section-title">정부 부처 · 한국은행 최근 1주</h2>
        ${items.length ? items.map(pressItem).join('') : '<div class="empty">보도자료가 없습니다.</div>'}</div>`;
    } catch (e) {
      $view.innerHTML = controls + errorBox(e.message);
    }
  }

  // ── 사설 비교 ───────────────────────────
  function edRow(e) {
    return `<a class="ed-row" href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">
      <span class="paper">${esc(e.paperLabel)}</span>
      <span class="ed-body"><span class="ed-title">${esc(e.title)}</span>${e.snippet ? `<span class="ed-snip">${esc(e.snippet)}</span>` : ''}</span>
    </a>`;
  }

  async function renderEditorials({ view }, fresh) {
    const controls = `<div class="controls"><div class="segment two" role="tablist" aria-label="기간">
      <button role="tab" aria-selected="${view === 'today'}" data-go="#/editorials/today"><b>오늘</b><small>사설 나란히 보기</small></button>
      <button role="tab" aria-selected="${view === 'week'}" data-go="#/editorials/week"><b>최근 7일</b><small>신문별 자주 다룬 단어</small></button>
    </div></div>`;
    $view.innerHTML = controls + skeleton();

    let d;
    try {
      d = await getJSON('data/editorials.json', { fresh });
    } catch (e) {
      $view.innerHTML = controls + errorBox(e.message);
      return;
    }
    const total = d.papers.reduce((n, p) => n + p.count, 0);
    const coverage = `<div class="paper-chips">${d.papers
      .map((p) => `<span class="${p.count ? '' : 'off'}">${esc(p.label)} <b>${p.count ? `${p.count}편` : '수집 안 됨'}</b></span>`)
      .join('')}</div>`;

    if (view === 'week') {
      const w = d.weekly;
      $view.innerHTML =
        controls +
        `<section class="hero">
          <div class="kicker"><span class="badge cat" style="--chip-color:var(--accent)">사설</span><span class="badge">최근 ${w.days}일</span><span class="badge">${esc(fmtRange({ from: w.from, to: w.to }))}</span></div>
          <h2>신문별로 자주 다룬 단어</h2>
          <p>최근 ${w.days}일 동안 각 신문 사설 제목에 자주 나온 단어입니다. 같은 기간 어떤 신문이 어떤 주제에 무게를 뒀는지 비교해 볼 수 있습니다.</p>
        </section>
        <div class="section">${w.papers
          .map(
            (p) => `<div class="card ed-week"><div class="ed-week-head"><span class="paper">${esc(p.label)}</span><span class="sub">사설 ${p.count}편</span></div>
              ${p.keywords.length ? `<div class="kw">${p.keywords.map((k) => `<span>${esc(k.word)}<b>${k.count}</b></span>`).join('')}</div>` : '<p class="theme-summary">모인 사설이 적어 아직 보여줄 단어가 없습니다.</p>'}
            </div>`,
          )
          .join('')}</div>
        <p class="foot">자료가 하루씩 쌓이면서 7일치가 채워집니다. 숫자는 그 단어가 들어간 사설 수입니다.</p>`;
      return;
    }

    $view.innerHTML =
      controls +
      `<section class="hero">
        <div class="kicker"><span class="badge cat" style="--chip-color:var(--accent)">사설</span><span class="badge">${esc(String(d.date).replace(/-/g, '.'))}</span></div>
        <h2>오늘의 사설 비교</h2>
        <p>7개 신문 사설 ${total}편 중 두 신문 이상이 함께 다룬 주제는 ${d.common.length}개입니다. 같은 주제를 신문마다 어떻게 제목 붙였는지 나란히 놓았습니다.</p>
        <div class="meta">${esc(stamp(d.updatedAt))} · 자동 정리</div>
      </section>
      <div class="section">${coverage}</div>
      <div class="section"><h2 class="section-title">같은 주제, 신문별 사설</h2>
        ${
          d.common.length
            ? d.common
                .map(
                  (g) => `<article class="card ed-group">
                    <div class="ed-group-head"><h3>${esc(g.label)}</h3><span class="sub">${g.paperCount}개 신문</span></div>
                    ${g.items.map(edRow).join('')}
                  </article>`,
                )
                .join('')
            : '<div class="empty">오늘은 여러 신문이 함께 다룬 주제를 찾지 못했습니다.</div>'
        }
      </div>
      <div class="section"><h2 class="section-title">신문별 오늘 사설</h2>
        ${d.papers
          .map((p) => {
            const list = d.byPaper[p.id] || [];
            return `<details class="card ed-paper"${list.length ? '' : ' disabled'}>
              <summary><span class="paper">${esc(p.label)}</span><span class="sub">${list.length ? `${list.length}편` : '수집 안 됨'}</span></summary>
              ${list.map(edRow).join('')}
            </details>`;
          })
          .join('')}
      </div>
      <p class="foot">제목과 주요 단어로 자동으로 묶었습니다. 제목이 많이 다르면 같은 주제라도 따로 보일 수 있습니다. 전문은 각 신문 페이지에서 읽어 주세요.</p>`;
  }

  // ── 렌더 ─────────────────────────────
  async function render(fresh = false) {
    const route = parseRoute();
    document.querySelectorAll('.tabbar a').forEach((a) => {
      if (a.dataset.tab === route.tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (route.tab === 'world') await renderWorld(route, fresh);
    else if (route.tab === 'press') await renderPress(route, fresh);
    else if (route.tab === 'editorials') await renderEditorials(route, fresh);
    else await renderDomestic(route, fresh);
  }

  async function loadMeta(fresh) {
    try {
      meta = await getJSON('data/meta.json', { fresh });
      $updated.textContent = stamp(meta.updatedAt);
    } catch {
      $updated.textContent = '데이터 없음 — 첫 업데이트를 기다리는 중';
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-go]');
    if (btn) {
      go(btn.dataset.go);
      return;
    }
    if (e.target.closest('[data-action="retry"]')) render(true);
  });

  $refresh.addEventListener('click', async () => {
    $refresh.classList.add('spin');
    await loadMeta(true);
    await render(true);
    $refresh.classList.remove('spin');
  });

  window.addEventListener('hashchange', () => {
    render();
    window.scrollTo({ top: 0 });
  });

  // 앱을 다시 열었을 때(백그라운드 → 전면) 새 데이터가 있으면 갱신
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !meta) return;
    const before = meta.updatedAt;
    await loadMeta(true);
    if (meta && meta.updatedAt !== before) render(true);
  });

  // ── PWA: 서비스워커 + 설치 안내 ──────────────
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  const $install = document.getElementById('install');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferred = null;

  function showInstall(html) {
    if (standalone || store.get('installDismissed', false)) return;
    $install.innerHTML = html + '<button class="btn ghost" data-install="close">닫기</button>';
    $install.hidden = false;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    showInstall('<p>홈 화면에 설치하면 앱처럼 바로 열 수 있어요.</p><button class="btn primary" data-install="go">설치</button>');
  });
  window.addEventListener('appinstalled', () => ($install.hidden = true));
  if (isIOS) showInstall('<p>사파리 하단 <b>공유(□↑)</b> → <b>홈 화면에 추가</b>로 설치할 수 있어요.</p>');

  $install.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-install]')?.dataset.install;
    if (act === 'go' && deferred) {
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      $install.hidden = true;
    } else if (act === 'close') {
      store.set('installDismissed', true);
      $install.hidden = true;
    }
  });

  loadMeta(false).then(() => render());
})();
