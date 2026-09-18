const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function clearReceipts() {
  await mongoose.connect(process.env.MONGODB_URI);
  const res = await mongoose.connection.db.collection('donationreceipts').deleteMany({});
  console.log(`Cleared ${res.deletedCount} old receipts from MongoDB.`);
  await mongoose.disconnect();
}
clearReceipts();
