const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

// In-Memory fast RAM cache for lightning-fast retrievals
const memoryCache = new Map();

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (err) {
    console.error('Error creating data directory:', err);
  }
}

/**
 * Get data by collection key with high-performance in-memory caching.
 */
function getCollection(key, initialData = []) {
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }

  const filePath = path.join(dataDir, `${key}.json`);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        memoryCache.set(key, parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.error(`Error reading ${key}.json:`, err.message);
  }

  // File doesn't exist or empty -> initialize
  const data = Array.isArray(initialData) ? [...initialData] : [];
  memoryCache.set(key, data);

  // Asynchronous background write to avoid blocking event loop
  fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8', () => {});
  return data;
}

/**
 * Save data by collection key with instant in-memory update and non-blocking disk sync.
 */
function saveCollection(key, data) {
  const safeData = Array.isArray(data) ? [...data] : data;
  memoryCache.set(key, safeData);

  const filePath = path.join(dataDir, `${key}.json`);
  // Async write to keep request response times sub-millisecond
  fs.writeFile(filePath, JSON.stringify(safeData, null, 2), 'utf-8', (err) => {
    if (err) {
      console.error(`Error writing ${key}.json:`, err.message);
    }
  });

  return true;
}

module.exports = {
  getCollection,
  saveCollection
};
