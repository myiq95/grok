/**
 * IndexedDB wrapper for book storage and reading progress
 */
const DB_NAME = 'SeojaeReader';
const DB_VERSION = 1;
const STORE_BOOKS = 'books';
const STORE_SETTINGS = 'settings';

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_BOOKS)) {
        const store = database.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!database.objectStoreNames.contains(STORE_SETTINGS)) {
        database.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
  });
}

async function saveBook(book) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_BOOKS, 'readwrite');
    const store = tx.objectStore(STORE_BOOKS);
    book.updatedAt = Date.now();
    const req = store.put(book);
    req.onsuccess = () => resolve(book);
    req.onerror = () => reject(req.error);
  });
}

async function getBook(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_BOOKS, 'readonly');
    const req = tx.objectStore(STORE_BOOKS).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllBooks() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_BOOKS, 'readonly');
    const req = tx.objectStore(STORE_BOOKS).getAll();
    req.onsuccess = () => {
      const books = req.result || [];
      books.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      resolve(books);
    };
    req.onerror = () => reject(req.error);
  });
}

async function deleteBook(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_BOOKS, 'readwrite');
    const req = tx.objectStore(STORE_BOOKS).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function updateProgress(id, progress) {
  const book = await getBook(id);
  if (!book) return;
  book.progress = progress; // { percent, scrollY, chapterId }
  book.updatedAt = Date.now();
  await saveBook(book);
}

async function saveSetting(key, value) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_SETTINGS, 'readwrite');
    const req = tx.objectStore(STORE_SETTINGS).put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getSetting(key, defaultValue = null) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_SETTINGS, 'readonly');
    const req = tx.objectStore(STORE_SETTINGS).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
    req.onerror = () => reject(req.error);
  });
}

window.SeojaeDB = {
  openDB,
  saveBook,
  getBook,
  getAllBooks,
  deleteBook,
  updateProgress,
  saveSetting,
  getSetting
};
