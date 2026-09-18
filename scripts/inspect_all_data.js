const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { connectDB } = require('../config/db');

const User = require('../models/User');
const DonationReceipt = require('../models/DonationReceipt');
const DonationHead = require('../models/DonationHead');
const Employee = require('../models/Employee');
const Plan = require('../models/Plan');
const Role = require('../models/Role');
const Notification = require('../models/Notification');
const ReceiptType = require('../models/ReceiptType');
const fs = require('fs');

async function inspect() {
  await connectDB();

  console.log('=== MongoDB Collections ===');
  console.log('Users count:', await User.countDocuments());
  console.log('DonationReceipts count:', await DonationReceipt.countDocuments());
  console.log('DonationHeads count:', await DonationHead.countDocuments());
  console.log('Employees count:', await Employee.countDocuments());
  console.log('Plans count:', await Plan.countDocuments());
  console.log('Roles count:', await Role.countDocuments());
  console.log('Notifications count:', await Notification.countDocuments());
  console.log('ReceiptTypes count:', await ReceiptType.countDocuments());

  const users = await User.find().lean();
  console.log('\nUsers in DB:', users.map(u => ({ email: u.email, role: u.role, name: u.name })));

  const receipts = await DonationReceipt.find().lean();
  console.log('\nReceipts in DB:', receipts.map(r => ({ receiptNo: r.receiptNo, donorName: r.donorName, amount: r.amount, createdBy: r.createdBy })));

  console.log('\n=== JSON Files in backend/data ===');
  const dataDir = path.join(__dirname, '..', 'data');
  const files = fs.readdirSync(dataDir);
  for (const f of files) {
    if (f.endsWith('.json')) {
      const content = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));
      console.log(`${f}: ${Array.isArray(content) ? content.length : typeof content} items`);
    }
  }

  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
