const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const User = require('../models/User');
const DonationReceipt = require('../models/DonationReceipt');

async function fixPrefixes() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas:', mongoose.connection.name);

  // 1. Fix Ramu Illam receipt
  const res1 = await DonationReceipt.updateMany(
    {
      $or: [
        { receiptNo: 'KISH/2026-27/1' },
        { receiptNo: { $regex: /^KISH\//i } }
      ]
    },
    { $set: { receiptNo: 'RAMU/2026-27/1' } }
  );
  console.log('Updated receipts matching KISH prefix:', res1.modifiedCount);

  // 2. Audit and fix user trust prefixes in MongoDB
  const users = await User.find({}).lean();
  for (const u of users) {
    if (u.isSuperAdmin || (u.role && u.role.toLowerCase().includes('super'))) continue;
    const tName = u.trustName || u.name;
    if (!tName || tName === 'DONATION RECEIPT SUPER ADMIN' || tName === 'Trust Organization') continue;
    const rawP = tName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'REC';
    const expectedPrefix = rawP + '/2026-27/';
    
    if (!u.receiptPrefix || u.receiptPrefix.startsWith('KISH') || u.receiptPrefix.startsWith('REC')) {
      await User.updateOne(
        { _id: u._id },
        {
          $set: {
            receiptPrefix: expectedPrefix,
            receiptWatermarkText: rawP,
            name: tName,
            trustName: tName
          }
        }
      );
      console.log('Fixed user:', u.email, '-> receiptPrefix:', expectedPrefix, 'trustName:', tName);
    }
  }

  console.log('\n--- VERIFYING ALL RECEIPTS IN MONGODB ATLAS ---');
  const receipts = await DonationReceipt.find({ status: { $ne: 'Inactive' } }).lean();
  for (const r of receipts) {
    console.log(`Receipt: ${r.receiptNo.padEnd(20)} | Trust: ${(r.trustName || '').padEnd(20)} | Donor: ${r.donorName}`);
  }

  await mongoose.disconnect();
  console.log('\nFix script completed successfully!');
}

fixPrefixes().catch(err => {
  console.error('Error fixing prefixes:', err);
  process.exit(1);
});
