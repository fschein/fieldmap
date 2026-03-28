// worker/index.ts
declare let self: ServiceWorkerGlobalScope

self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const data = event.data.json()
    const options = {
      body: data.message,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/'
      },
      actions: [
        { action: 'open', title: 'Ver Agora' }
      ]
    }

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    )
  } catch (err) {
    console.error('Erro ao processar push event:', err)
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  
  const urlToOpen = event.notification.data.url

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i]
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen)
      }
    })
  )
})
