// 뉴스브리핑 서비스워커
// - 앱 화면(셸)은 미리 캐시 → 오프라인에서도 열림
// - data/*.json 은 네트워크 우선 → 실패하면 마지막으로 받은 브리핑
// 앱 파일(index.html, app.js, styles.css 등)을 고치면 VERSION 을 올리세요.
const VERSION = 'v1.1.0';
const SHELL = `shell-${VERSION}`;
const DATA = 'data-v1';
const RUNTIME = `runtime-${VERSION}`;

const SHELL_FILES = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-48.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, DATA, RUNTIME].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 기사 원문 등 다른 사이트는 관여하지 않음 (글꼴 CDN만 런타임 캐시)
  if (url.origin !== self.location.origin) {
    if (url.hostname === 'cdn.jsdelivr.net') event.respondWith(cacheFirst(req, RUNTIME));
    return;
  }

  // 브리핑 데이터: 네트워크 우선 (?t= 강제 새로고침 파라미터는 캐시 키에서 제외)
  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    const key = url.origin + url.pathname;
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          if (res.ok) (await caches.open(DATA)).put(key, res.clone());
          return res;
        })
        .catch(async () => (await caches.open(DATA)).match(key).then((r) => r || Response.error())),
    );
    return;
  }

  // 페이지 이동: 네트워크 우선, 오프라인이면 캐시된 index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match(req)) || caches.match('index.html')),
    );
    return;
  }

  // 그 외 앱 파일: 캐시 우선 + 뒤에서 갱신
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then(async (res) => {
          if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});

async function cacheFirst(req, name) {
  const hit = await caches.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') (await caches.open(name)).put(req, res.clone());
    return res;
  } catch {
    return Response.error();
  }
}
