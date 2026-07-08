'use strict';

// Bump CACHE whenever a precached asset changes so clients pull the new copy.
const CACHE = 'brainwave-v2';

// Relative URLs so the app works both at the site root and under a GitHub Pages
// project subpath (/binaural_music/). The service worker's own scope is the
// directory it is served from, which anchors these paths.
const ASSETS = [
	'./',
	'./index.html',
	'./css/styles.css',
	'./js/app.js',
	'./manifest.webmanifest',
	'./icons/icon.svg',
	'./icons/icon-192.png',
	'./icons/icon-512.png',
	'./icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;

	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;

	// Navigations: network-first so an updated app is picked up when online,
	// falling back to the cached shell when offline.
	if (req.mode === 'navigate') {
		event.respondWith(
			fetch(req)
				.then((res) => {
					const copy = res.clone();
					caches.open(CACHE).then((cache) => cache.put(req, copy));
					return res;
				})
				.catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
		);
		return;
	}

	// Static assets: cache-first, then fill the cache from the network.
	event.respondWith(
		caches.match(req).then((hit) => {
			if (hit) return hit;
			return fetch(req).then((res) => {
				if (res.ok && res.type === 'basic') {
					const copy = res.clone();
					caches.open(CACHE).then((cache) => cache.put(req, copy));
				}
				return res;
			});
		})
	);
});
