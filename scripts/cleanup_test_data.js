const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { saveCollection } = require('../services/storageService');

async function cleanup() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const usersDel = await db.collection('users').deleteMany({
    $or: [
      { email: { $regex: /testngo\.org/i } },
      { email: { $regex: /annapoornatrust\.org/i } },
      { email: { $regex: /omshantitrust\.org/i } }
    ]
  });
  console.log(`Deleted ${usersDel.deletedCount} test trust users from MongoDB.`);

  const recsDel = await db.collection('donationreceipts').deleteMany({
    $or: [
      { trustEmail: { $regex: /testngo\.org/i } },
      { trustEmail: { $regex: /annapoornatrust\.org/i } },
      { trustEmail: { $regex: /omshantitrust\.org/i } }
    ]
  });
  console.log(`Deleted ${recsDel.deletedCount} test receipts from MongoDB.`);

  saveCollection('users', []);
  saveCollection('receipts', []);

  await mongoose.disconnect();
  console.log('Cleanup completed successfully!');
}

cleanup();
