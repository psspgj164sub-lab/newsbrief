// 같은 사건을 다룬 기사들을 제목 유사도(글자 2-gram 자카드)로 묶는다.
const NOISE = /\[[^\]]*\]|\([^)]*\)|【[^】]*】|<[^>]*>|["'“”‘’…·,.!?:;|]/g;

export function bigrams(title) {
  const s = title.replace(NOISE, ' ').replace(/\s+/g, '').toLowerCase();
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * @param {Array<{title, source, publishedAt}>} articles
 * @param {{threshold?: number, prefix?: string}} opts
 * @returns {Array<{id, articles, sourceCount, score}>} 중요도순
 */
export function clusterArticles(articles, { threshold = 0.3, prefix = 't' } = {}) {
  const sorted = [...articles].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  const clusters = [];

  for (const article of sorted) {
    const grams = bigrams(article.title);
    let best = null;
    let bestSim = 0;
    for (const c of clusters) {
      for (const g of c.grams.slice(0, 6)) {
        const sim = jaccard(grams, g);
        if (sim > bestSim) {
          bestSim = sim;
          best = c;
        }
      }
    }
    if (best && bestSim >= threshold) {
      best.articles.push(article);
      best.grams.push(grams);
    } else {
      clusters.push({ articles: [article], grams: [grams] });
    }
  }

  return clusters
    .map((c) => {
      const sources = new Set(c.articles.map((a) => a.source));
      const press = c.articles.some((a) => a.kind === 'press') ? 2 : 0; // 공식 발표는 가산점
      return { articles: c.articles, sourceCount: sources.size, score: c.articles.length * 2 + sources.size * 3 + press };
    })
    .sort((a, b) => b.score - a.score)
    .map((c, i) => ({ id: `${prefix}${i}`, ...c }));
}

/** 링크·제목 기준 중복 제거 */
export function dedupe(articles) {
  const links = new Set();
  const titles = new Set();
  return articles.filter((a) => {
    if (!a.title || !a.link) return false;
    const t = a.title.replace(/\s+/g, '').toLowerCase();
    if (links.has(a.link) || titles.has(t)) return false;
    links.add(a.link);
    titles.add(t);
    return true;
  });
}
