// 手ざわり集中 Service Worker
// - アプリ本体（シェル）は事前キャッシュ。ページはネット優先→落ちたらキャッシュ（更新がすぐ届く）
// - フォント（自前ホスト）等の同一オリジン資産はキャッシュ優先で使い回し（オフラインでも文字化けなし）
var CACHE = 'tezawari-focus-v1';
var SHELL = [
  './',
  './manifest.webmanifest'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (req.mode === 'navigate') {
    ev.respondWith(
      fetch(req, { cache: 'reload' }).then(function (res) {   // HTTPキャッシュも飛ばして常に最新HTML
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put('./', copy); });
        return res;
      }).catch(function () { return caches.match('./'); })
    );
    return;
  }

  if (url.origin !== location.origin) return;

  ev.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res.ok || res.type === 'opaque') {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      });
    })
  );
});
