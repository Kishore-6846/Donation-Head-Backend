const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

// In-Memory fast RAM cache
const memoryCache = new Map();

/**
 * Get data by collection key with high-performance in-memory caching.
 * Does not write any files to folder.
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
  } catch (err) {}

  const data = Array.isArray(initialData) ? [...initialData] : [];
  memoryCache.set(key, data);
  return data;
}

/**
 * In-memory state updater (Never writes to disk folder).
 * All database records are stored directly and solely in MongoDB.
 */
function saveCollection(key, data) {
  const safeData = Array.isArray(data) ? [...data] : data;
  memoryCache.set(key, safeData);
  // Zero disk writes — all persistence is handled purely by MongoDB
  return true;
}

module.exports = {
  getCollection,
  saveCollection
};
