// お勉強ペット Service Worker
// - アプリ本体（シェル）は事前キャッシュ。ページはネット優先→落ちたらキャッシュ（更新がすぐ届く）
// - フォント（自前ホスト）等の同一オリジン資産はキャッシュ優先で使い回し（オフラインでも文字化けなし）
// - Cache Storageはオリジン単位で共有され、姉妹アプリ（手ざわり手帳・手ざわり計画表）も同じ
//   github.io オリジン上にいる。activate時の掃除は必ずこのアプリのプレフィックスだけに絞り、
//   他アプリのキャッシュを誤って消さないようにする
var CACHE_PREFIX = 'tezawari-focus-';   // 印は据え置き。変えると古いキャッシュが掃除されずに残る
var CACHE = CACHE_PREFIX + 'v39';
var SHELL = [
  './',
  './privacy.html'
];
// manifest はアプリ名とアイコンの出どころ。キャッシュ優先で配ると
// 名前を変えてもホーム画面に古い名前が出てしまうので、必ずネットから取り直す
function isAlwaysFresh(url) {
  return /manifest\.webmanifest$/.test(url.pathname);
}
var SCOPE_URL = self.registration.scope;   // 例: https://.../paper-focus/

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE) return caches.delete(k);
      }));
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
        // アプリ本体（起点URL）への遷移のときだけ './' の控えを更新する。
        // privacy.html等の別ページで './' を上書きしてしまわないように
        if (res.ok && (req.url === SCOPE_URL || req.url === SCOPE_URL + 'index.html')) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put('./', copy); });
        }
        return res;
      }).catch(function () {
        // オフライン時は、いま実際に開こうとしたページを優先して返す（privacy.html等）。
        // それも無ければアプリ本体にフォールバック
        return caches.open(CACHE).then(function (cache) {
          return cache.match(req).then(function (hit) { return hit || cache.match('./'); });
        });
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // manifest はネット優先。落ちているときだけ控えを使う
  if (isAlwaysFresh(url)) {
    ev.respondWith(
      fetch(req, { cache: 'reload' }).then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.open(CACHE).then(function (cache) {
          return cache.match(req).then(function (hit) { return hit || Response.error(); });
        });
      })
    );
    return;
  }

  ev.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
          return res;
        });
      });
    })
  );
});
