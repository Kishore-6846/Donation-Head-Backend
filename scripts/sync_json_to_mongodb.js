const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const fs = require('fs');

const User = require('../models/User');
const Plan = require('../models/Plan');
const DonationReceipt = require('../models/DonationReceipt');
const DonationHead = require('../models/DonationHead');
const Staff = require('../models/Staff');
const Role = require('../models/Role');
const Employee = require('../models/Employee');
const Notification = require('../models/Notification');
const Certificate = require('../models/Certificate');
const ReceiptType = require('../models/ReceiptType');

function readJsonFile(filename) {
  const filePath = path.join(__dirname, '../data', filename);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Could not read ${filename}:`, e.message);
    return [];
  }
}

function cleanDoc(obj) {
  const copy = { ...obj };
  if (copy._id && String(copy._id).length !== 24) {
    delete copy._id;
  }
  return copy;
}

async function syncAllToMongoDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('No MONGODB_URI found in .env');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000
  });
  console.log('Connected to MongoDB database:', mongoose.connection.name);

  // Drop unique roleName index if exists
  try {
    await mongoose.connection.collection('roles').dropIndex('roleName_1');
  } catch (e) {}

  // 1. Sync Users
  const users = readJsonFile('users.json');
  console.log(`Syncing ${users.length} users...`);
  for (const u of users) {
    if (!u.email) continue;
    const cleanEmail = u.email.toLowerCase().trim();
    const doc = cleanDoc(u);
    try {
      const existing = await User.findOne({ email: cleanEmail });
      if (!existing) {
        await User.create(doc);
        console.log(`  + Inserted User: ${cleanEmail}`);
      } else {
        const updateData = { ...doc };
        delete updateData._id;
        await User.updateOne({ _id: existing._id }, { $set: updateData });
      }
    } catch (err) {
      console.warn(`  User sync error for ${cleanEmail}:`, err.message);
    }
  }

  // 2. Sync Plans
  const plans = readJsonFile('plans.json');
  console.log(`Syncing ${plans.length} plans...`);
  for (const p of plans) {
    const code = (p.code || p.name).toLowerCase().trim();
    try {
      const existing = await Plan.findOne({ $or: [{ code }, { name: p.name }] });
      if (!existing) {
        const planDoc = { ...p, code };
        if (!planDoc._id) planDoc._id = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await Plan.create(planDoc);
        console.log(`  + Inserted Plan: ${p.name}`);
      } else {
        const updateData = { ...p };
        delete updateData._id;
        await Plan.updateOne({ _id: existing._id }, { $set: updateData });
      }
    } catch (err) {
      console.warn(`  Plan sync error for ${p.name}:`, err.message);
    }
  }

  // 3. Sync Donation Receipts
  const receipts = readJsonFile('receipts.json');
  console.log(`Syncing ${receipts.length} receipts...`);
  for (const r of receipts) {
    if (!r.receiptNo) continue;
    const doc = cleanDoc(r);
    try {
      const existing = await DonationReceipt.findOne({ receiptNo: r.receiptNo });
      if (!existing) {
        await DonationReceipt.create(doc);
        console.log(`  + Inserted Receipt: ${r.receiptNo}`);
      } else {
        const updateData = { ...doc };
        delete updateData._id;
        await DonationReceipt.updateOne({ _id: existing._id }, { $set: updateData });
      }
    } catch (err) {
      console.warn(`  Receipt sync error for ${r.receiptNo}:`, err.message);
    }
  }

  // 4. Sync Donation Heads
  const heads = readJsonFile('donationHeads.json');
  console.log(`Syncing ${heads.length} donation heads...`);
  for (const h of heads) {
    if (!h.name) continue;
    const doc = cleanDoc(h);
    const filter = h.isGlobal
      ? { name: h.name, isGlobal: true }
      : { name: h.name, trustEmail: (h.trustEmail || '').toLowerCase().trim() };
    try {
      const existing = await DonationHead.findOne(filter);
      if (!existing) {
        await DonationHead.create(doc);
        console.log(`  + Inserted Head: ${h.name}`);
      } else {
        const updateData = { ...doc };
        delete updateData._id;
        await DonationHead.updateOne({ _id: existing._id }, { $set: updateData });
      }
    } catch (err) {
      console.warn(`  Head sync error for ${h.name}:`, err.message);
    }
  }

  // 5. Sync Staff
  const staff = readJsonFile('staff.json');
  console.log(`Syncing ${staff.length} staff members...`);
  for (const s of staff) {
    if (!s.email) continue;
    const doc = cleanDoc(s);
    try {
      const existing = await Staff.findOne({
        email: s.email.toLowerCase().trim(),
        trustEmail: (s.trustEmail || '').toLowerCase().trim()
      });
      if (!existing) {
        await Staff.create(doc);
        console.log(`  + Inserted Staff: ${s.name} (${s.email})`);
      } else {
        const updateData = { ...doc };
        delete updateData._id;
        await Staff.updateOne({ _id: existing._id }, { $set: updateData });
      }
    } catch (err) {
      console.warn(`  Staff sync error for ${s.email}:`, err.message);
    }
  }

  // 6. Sync Roles
  const roles = readJsonFile('roles.json');
  console.log(`Syncing ${roles.length} roles...`);
  for (const ro of roles) {
    if (!ro.roleName) continue;
    const doc = cleanDoc(ro);
    try {
      const existing = await Role.findOne({
        roleName: ro.roleName,
        trustEmail: (ro.trustEmail || '').toLowerCase().trim()
      });
      if (!existing) {
        await Role.create(doc);
        console.log(`  + Inserted Role: ${ro.roleName}`);
      } else {
        const updateData = { ...doc };
        delete updateData._id;
        await Role.updateOne({ _id: existing._id }, { $set: updateData });
      }
    } catch (err) {
      console.warn(`  Role sync error for ${ro.roleName}:`, err.message);
    }
  }

  // 7. Sync Employees
  const emps = readJsonFile('employees.json');
  console.log(`Syncing ${emps.length} employees...`);
  for (const e of emps) {
    if (!e.empId && !e.email) continue;
    const doc = cleanDoc(e);
    try {
      const existing = await Employee.findOne({ $or: [{ empId: e.empId }, { email: e.email }] });
      if (!existing) {
        await Employee.create(doc);
        console.log(`  + Inserted Employee: ${e.name}`);
      } else {
        const updateData = { ...doc };
        delete updateData._id;
        await Employee.updateOne({ _id: existing._id }, { $set: updateData });
      }
    } catch (err) {
      console.warn(`  Employee sync error for ${e.name}:`, err.message);
    }
  }

  // 8. Sync Notifications
  const notifs = readJsonFile('notifications.json');
  console.log(`Syncing ${notifs.length} notifications...`);
  for (const n of notifs) {
    if (!n.title) continue;
    const doc = cleanDoc(n);
    try {
      const existing = await Notification.findOne({ title: n.title });
      if (!existing) {
        await Notification.create(doc);
        console.log(`  + Inserted Notification: ${n.title}`);
      } else {
        const updateData = { ...doc };
        delete updateData._id;
        await Notification.updateOne({ _id: existing._id }, { $set: updateData });
      }
    } catch (err) {
      console.warn(`  Notification sync error for ${n.title}:`, err.message);
    }
  }

  // 9. Sync Certificates
  const certs = readJsonFile('certificates.json');
  console.log(`Syncing ${certs.length} certificates...`);
  for (const c of certs) {
    if (!c.regNo && !c.trustEmail) continue;
    const doc = cleanDoc(c);
    try {
      const existing = await Certificate.findOne({
        regNo: c.regNo || '',
        trustEmail: (c.trustEmail || '').toLowerCase().trim()
      });
      if (!existing) {
        await Certificate.create(doc);
        console.log(`  + Inserted Certificate: ${c.regNo || c.trustName}`);
      }
    } catch (err) {
      console.warn(`  Certificate sync error:`, err.message);
    }
  }

  console.log('✅ ALL JSON DATA HAS BEEN SYNCHRONIZED TO MONGODB SUCCESSFULLY!');
  await mongoose.connection.close();
}

syncAllToMongoDB().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
