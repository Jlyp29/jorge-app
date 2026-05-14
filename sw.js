const CACHE = 'misistema-v3.11.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
];
const REMOTE = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async c => {
      await c.addAll(SHELL);
      // CDN best-effort: si falla no bloquea la instalación
      await Promise.allSettled(REMOTE.map(url =>
        fetch(url).then(r => { if (r.ok) c.put(url, r); }).catch(() => {})
      ));
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Network-first para index.html (siempre la versión más nueva)
  if (e.request.url.includes('index.html') || e.request.url.endsWith('/')) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return resp;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  // Cache-first para el resto
  e.respondWith(
    caches.match(e.request).then(r =>
      r || fetch(e.request).then(resp => {
        if (resp && resp.status === 200 && resp.type !== 'opaque') {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => new Response('', { status: 503, statusText: 'Offline' }))
    )
  );
});

/* ── Notificaciones ────────────────────────────────────────
   El SW guarda los timers en memoria. Mientras el SW esté
   activo (PWA instalada o Chrome con app en background)
   las notificaciones llegan aunque el tab esté cerrado.
──────────────────────────────────────────────────────────── */
const _timers = new Map(); // tag → timeoutId

self.addEventListener('message', e => {
  if (!e.data) return;

  if (e.data.type === 'SCHEDULE_NOTIFS') {
    // Cancelar timers anteriores para evitar duplicados
    _timers.forEach(id => clearTimeout(id));
    _timers.clear();

    (e.data.notifs || []).forEach(n => {
      const ms = n.fireAt - Date.now();
      if (ms <= 0 || ms > 25 * 60 * 60 * 1000) return; // ignorar pasados o más de 25h
      const id = setTimeout(() => {
        self.registration.showNotification(n.title, {
          body: n.body,
          icon: './icon-192.png',
          badge: './icon-192.png',
          tag: n.tag,
          renotify: false,
        });
        _timers.delete(n.tag);
      }, Math.min(ms, 2147483647));
      _timers.set(n.tag, id);
    });
  }

  if (e.data.type === 'SHOW_NOW') {
    self.registration.showNotification(e.data.title, {
      body: e.data.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      ...(e.data.opts || {}),
    });
  }
});

// Abrir la app al tocar una notificación
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const open = cs.find(c => c.url.includes(self.location.origin));
      if (open) return open.focus();
      return clients.openWindow('./');
    })
  );
});
