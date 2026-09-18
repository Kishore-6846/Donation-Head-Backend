const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { connectDB } = require('../config/db');

const User = require('../models/User');
const DonationReceipt = require('../models/DonationReceipt');
const DonationHead = require('../models/DonationHead');
const Employee = require('../models/Employee');
const Role = require('../models/Role');
const Notification = require('../models/Notification');
const ReceiptType = require('../models/ReceiptType');
const fs = require('fs');

async function wipeAll() {
  await connectDB();

  console.log('--- Wiping MongoDB Collections ---');
  await DonationReceipt.deleteMany({});
  console.log('DonationReceipts wiped. Count:', await DonationReceipt.countDocuments());

  await User.deleteMany({});
  console.log('Users wiped. Count:', await User.countDocuments());

  await Employee.deleteMany({});
  console.log('Employees wiped. Count:', await Employee.countDocuments());

  await DonationHead.deleteMany({});
  console.log('DonationHeads wiped. Count:', await DonationHead.countDocuments());

  await Role.deleteMany({});
  console.log('Roles wiped. Count:', await Role.countDocuments());

  await Notification.deleteMany({});
  console.log('Notifications wiped. Count:', await Notification.countDocuments());

  await ReceiptType.deleteMany({});
  console.log('ReceiptTypes wiped. Count:', await ReceiptType.countDocuments());

  console.log('\n--- Wiping JSON Files in backend/data ---');
  const dataDir = path.join(__dirname, '..', 'data');
  const filesToEmpty = [
    'receipts.json',
    'users.json',
    'employees.json',
    'donationHeads.json',
    'dynamicReports.json',
    'notifications.json',
    'receiptTypes.json',
    'reports.json',
    'roles.json'
  ];

  for (const file of filesToEmpty) {
    const filePath = path.join(dataDir, file);
    fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf-8');
    console.log(`Emptied ${file}`);
  }

  console.log('\nAll data wiped successfully! System is now 100% clean and ready for scratch start.');
  process.exit(0);
}

wipeAll().catch(err => {
  console.error(err);
  process.exit(1);
});
