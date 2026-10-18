// Serves runtime-downloaded engine payloads back to the analysis page and
// its engine workers. The download manager (client/src/lib/engineDownloader.ts)
// stores the stockfish js/wasm/worker files under "wintrchess-engines-v1";
// this worker answers /engines/* from that cache when a file is present and
// falls through to the network otherwise, so engines the user never
// downloaded keep loading exactly as before.

const CACHE_NAME = "wintrchess-engines-v1";
const ENGINE_PATH_PREFIX = "/engines/";

// a fresh worker takes over immediately: downloads happen on demand, so
// waiting for a page reload would only delay the new cache layout
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        // drop caches from older engine cache versions: payload bytes are
        // only ever valid for the names they were built under
        const names = await caches.keys();
        await Promise.all(names
            .filter(name => name.startsWith("wintrchess-engines-") && name != CACHE_NAME)
            .map(name => caches.delete(name)));

        // claim the open pages so fetches from the session that registered
        // this worker are already served from the cache
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method != "GET") return;

    const url = new URL(request.url);
    if (url.origin != self.location.origin) return;
    if (!url.pathname.startsWith(ENGINE_PATH_PREFIX)) return;

    event.respondWith((async () => {
        try {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(request);
            if (cached) return cached;
        } catch {
            // fall through to the network on any cache failure
        }

        return fetch(request);
    })());
});
