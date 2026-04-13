// CC Remote v3 — Service Worker DISABLED (self-unregistering stub)
// Build: 20260409-2040
// Purpose: clean up any existing caches and unregister self on next activation.
// Once all clients have run this stub once, no more SW will be active.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Delete all caches
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch {}
    // Unregister this SW
    try {
      await self.registration.unregister();
    } catch {}
    // Force-reload all controlled clients so they pick up the latest HTML
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.navigate(client.url);
      }
    } catch {}
  })());
});

// Fetch handler: pass through, no cache.
self.addEventListener('fetch', (event) => {
  // Let the browser handle it directly, no SW intervention.
  return;
});
