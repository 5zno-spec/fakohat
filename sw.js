// عامل خدمة: الصفحة من الشبكة أولًا (لتصل التحديثات دائمًا) مع مهلة قصيرة تعود بعدها للنسخة المحفوظة،
// والصور والأيقونات من الذاكرة أولًا (لا تتغير إلا برفع رقم V)، والخطوط تُعرض من الذاكرة وتُحدَّث في الخلفية.
// ارفع رقم V عند تغيير أي صورة أو أيقونة.
const V = "fakohat-v3";
const PRE = [
  "index.html", "manifest.webmanifest", "icon-192.png",
  "img/logo.webp", "img/h0.webp", "img/h1.webp", "img/h2.webp",
  "img/wintree.webp", "img/bgi.webp", "img/trimg.webp"
];
const PAGE_TIMEOUT = 3000;

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(V)
      .then(c => Promise.allSettled(PRE.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const save = (r, res) => {
  if (res && (res.ok || res.type === "opaque")) {
    const copy = res.clone();
    caches.open(V).then(c => c.put(r, copy));
  }
  return res;
};

// الصفحة وما يتغير: الشبكة أولًا، وإن تأخرت أكثر من المهلة أو انقطعت نعرض المحفوظ
const networkFirst = r =>
  new Promise(resolve => {
    let done = false;
    const fromCache = () =>
      caches.match(r, { ignoreSearch: true }).then(m =>
        m || (r.mode === "navigate" ? caches.match("index.html") : null)
      );
    const timer = setTimeout(() => {
      fromCache().then(m => { if (m && !done) { done = true; resolve(m); } });
    }, PAGE_TIMEOUT);
    fetch(r)
      .then(res => {
        clearTimeout(timer);
        // نحفظ صفحات التنقل كلها تحت مفتاح واحد حتى لا تتكرر النسخ بسبب معاملات الاستعلام
        if (r.mode === "navigate") { if (res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put("index.html", copy)); } }
        else save(r, res);
        if (!done) { done = true; resolve(res); }
      })
      .catch(() => {
        clearTimeout(timer);
        fromCache().then(m => { if (!done) { done = true; resolve(m || Response.error()); } });
      });
  });

// الصور والأيقونات: الذاكرة أولًا
const cacheFirst = r =>
  caches.match(r).then(m => m || fetch(r).then(res => save(r, res)).catch(() => Response.error()));

// الخطوط: نعرض المحفوظ فورًا ونحدّثه في الخلفية
const staleWhileRevalidate = r =>
  caches.match(r).then(m => {
    const net = fetch(r).then(res => save(r, res)).catch(() => null);
    return m || net.then(res => res || Response.error());
  });

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    const isAsset = /\.(?:webp|png|jpe?g|svg|ico)$/i.test(u.pathname);
    e.respondWith(isAsset ? cacheFirst(r) : networkFirst(r));
  } else if (u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com") {
    e.respondWith(staleWhileRevalidate(r));
  }
});
