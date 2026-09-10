self.addEventListener("fetch", () => {})

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim())
})