const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ReceiptType = require('../models/ReceiptType');
const ReportType = require('../models/ReportType');
const DynamicReport = require('../models/DynamicReport');
const User = require('../models/User');
const Plan = require('../models/Plan');
const DonationReceipt = require('../models/DonationReceipt');
const DonationHead = require('../models/DonationHead');
const Staff = require('../models/Staff');
const Role = require('../models/Role');
const Employee = require('../models/Employee');
const Notification = require('../models/Notification');
const Certificate = require('../models/Certificate');
const { getCollection } = require('../services/storageService');

async function syncAll() {
  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB database:', mongoose.connection.name);

  // Sync Receipt Types
  const receiptTypeRoutes = require('../routes/receiptTypeRoutes');
  const rTypes = receiptTypeRoutes.getReceiptTypes();
  for (const rt of rTypes) {
    await ReceiptType.updateOne({ code: rt.code }, { $set: rt }, { upsert: true });
  }


  // Sync Report Types
  const repTypes = getCollection('reportTypes', []);
  for (const rt of repTypes) {
    await ReportType.updateOne({ _id: rt._id }, { $set: rt }, { upsert: true });
  }

  // Sync Dynamic Reports
  const dynReports = getCollection('dynamicReports', []);
  for (const dr of dynReports) {
    await DynamicReport.updateOne({ _id: dr._id }, { $set: dr }, { upsert: true });
  }

  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('\n=============================================');
  console.log('MongoDB Atlas Live Collections & Document Counts:');
  console.log('=============================================');
  for (const c of collections) {
    const count = await mongoose.connection.db.collection(c.name).countDocuments();
    console.log(` - ${c.name.padEnd(20)}: ${count} documents`);
  }
  console.log('=============================================\n');

  await mongoose.disconnect();
  console.log('MongoDB sync completed successfully!');
}

syncAll().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
