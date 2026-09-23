// IndexedDB queue for tasks created while offline. Each queued task already
// has its final UUID, so syncing is idempotent: a retry after a partial
// sync can never create a duplicate.

const DB_NAME = 'cwi-offline'
const STORE = 'pendingTasks'

export const PENDING_CHANGED_EVENT = 'cwi:pending-changed'

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore(mode, operation) {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = operation(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

function notifyChanged() {
  window.dispatchEvent(new Event(PENDING_CHANGED_EVENT))
}

export async function queueTask(task) {
  await withStore('readwrite', (store) => store.put(task))
  notifyChanged()
}

export function getPendingTasks() {
  return withStore('readonly', (store) => store.getAll())
}

export async function removePendingTask(id) {
  await withStore('readwrite', (store) => store.delete(id))
  notifyChanged()
}
