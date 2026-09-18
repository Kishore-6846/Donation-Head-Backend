const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

const mirrorDir = path.resolve('c:/Users/sivah/OneDrive/Desktop/office-Folder/Donation-Receipt/backend/data');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (err) {
    console.error('Error creating data directory:', err);
  }
}

/**
 * Get data by collection key.
 * If file does not exist, initialize with initialData and write to disk.
 */
function getCollection(key, initialData = []) {
  const filePath = path.join(dataDir, `${key}.json`);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      if (raw && raw.trim()) {
        return JSON.parse(raw);
      }
    }
  } catch (err) {
    console.error(`Error reading ${key}.json:`, err.message);
  }

  // File doesn't exist or error reading -> write initialData
  try {
    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2), 'utf-8');
    if (fs.existsSync(mirrorDir)) {
      fs.writeFileSync(path.join(mirrorDir, `${key}.json`), JSON.stringify(initialData, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error(`Error initializing ${key}.json:`, err.message);
  }
  return [...initialData];
}

/**
 * Save data by collection key.
 */
function saveCollection(key, data) {
  const filePath = path.join(dataDir, `${key}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    // Mirror to Admin backend directory if available
    try {
      if (fs.existsSync(mirrorDir)) {
        fs.writeFileSync(path.join(mirrorDir, `${key}.json`), JSON.stringify(data, null, 2), 'utf-8');
      }
    } catch (mirrorErr) {
      console.warn('Could not mirror data to admin folder:', mirrorErr.message);
    }
    return true;
  } catch (err) {
    console.error(`Error writing ${key}.json:`, err.message);
    return false;
  }
}

module.exports = {
  getCollection,
  saveCollection
};
