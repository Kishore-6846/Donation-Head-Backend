const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function inspect() {
  await mongoose.connect(process.env.MONGODB_URI);
  const receipts = await mongoose.connection.db.collection('donationreceipts').find().toArray();
  console.log('Total receipts in MongoDB:', receipts.length);
  console.log(JSON.stringify(receipts.map(r => ({
    _id: r._id,
    receiptNo: r.receiptNo,
    donorName: r.donorName,
    amount: r.amount,
    trustName: r.trustName,
    trustEmail: r.trustEmail,
    createdBy: r.createdBy,
    isSuperAdminReceipt: r.isSuperAdminReceipt
  })), null, 2));
  await mongoose.disconnect();
}
inspect();
