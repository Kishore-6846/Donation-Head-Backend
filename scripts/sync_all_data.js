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
const ReportType = require('../models/ReportType');
const DynamicReport = require('../models/DynamicReport');
const { compressImageString } = require('../utils/imageCompressor');

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
  if (copy._id && String(copy._id).length !== 24 && !String(copy._id).startsWith('plan_')) {
    delete copy._id;
  }
  return copy;
}

async function syncAndOptimize() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('MongoDB URI is not provided in .env');
    return;
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected to database:', mongoose.connection.name);

  // 1. Sync Employees
  const fileEmps = readJsonFile('employees.json');
  for (const e of fileEmps) {
    if (!e.email && !e.empId) continue;
    const filter = e.empId ? { empId: e.empId } : { email: e.email };
    const exists = await Employee.findOne(filter);
    if (!exists) {
      await Employee.create(cleanDoc(e));
      console.log(`[+] Migrated missing Employee to DB: ${e.name} (${e.empId})`);
    }
  }

  // 2. Sync Users
  const fileUsers = readJsonFile('users.json');
  for (const u of fileUsers) {
    if (!u.email) continue;
    const cleanEmail = u.email.toLowerCase().trim();
    const exists = await User.findOne({ email: cleanEmail });
    if (!exists) {
      const doc = cleanDoc(u);
      if (doc.logo) doc.logo = compressImageString(doc.logo);
      if (doc.signature) doc.signature = compressImageString(doc.signature);
      await User.create(doc);
      console.log(`[+] Migrated missing User to DB: ${cleanEmail}`);
    }
  }

  // 3. Sync Donation Heads
  const fileHeads = readJsonFile('donationHeads.json');
  for (const h of fileHeads) {
    if (!h.name) continue;
    const filter = h.isGlobal
      ? { name: h.name, isGlobal: true }
      : { name: h.name, trustEmail: (h.trustEmail || '').toLowerCase().trim() };
    const exists = await DonationHead.findOne(filter);
    if (!exists) {
      await DonationHead.create(cleanDoc(h));
      console.log(`[+] Migrated missing DonationHead to DB: ${h.name}`);
    }
  }

  // 4. Sync Receipts
  const fileReceipts = readJsonFile('receipts.json');
  for (const r of fileReceipts) {
    if (!r.receiptNo) continue;
    const exists = await DonationReceipt.findOne({ receiptNo: r.receiptNo });
    if (!exists) {
      await DonationReceipt.create(cleanDoc(r));
      console.log(`[+] Migrated missing Receipt to DB: ${r.receiptNo}`);
    }
  }

  // 5. Sync Staff
  const fileStaff = readJsonFile('staff.json');
  for (const s of fileStaff) {
    if (!s.email) continue;
    const exists = await Staff.findOne({
      email: s.email.toLowerCase().trim(),
      trustEmail: (s.trustEmail || '').toLowerCase().trim()
    });
    if (!exists) {
      await Staff.create(cleanDoc(s));
      console.log(`[+] Migrated missing Staff to DB: ${s.name} (${s.email})`);
    }
  }

  // 6. Sync Roles
  const fileRoles = readJsonFile('roles.json');
  for (const ro of fileRoles) {
    if (!ro.roleName) continue;
    const exists = await Role.findOne({
      roleName: ro.roleName,
      trustEmail: (ro.trustEmail || '').toLowerCase().trim()
    });
    if (!exists) {
      await Role.create(cleanDoc(ro));
      console.log(`[+] Migrated missing Role to DB: ${ro.roleName}`);
    }
  }

  // 7. Sync Certificates
  const fileCerts = readJsonFile('certificates.json');
  for (const c of fileCerts) {
    if (!c.regNo) continue;
    const exists = await Certificate.findOne({ regNo: c.regNo });
    if (!exists) {
      const doc = cleanDoc(c);
      if (doc.page1) doc.page1 = compressImageString(doc.page1);
      if (doc.page2) doc.page2 = compressImageString(doc.page2);
      await Certificate.create(doc);
      console.log(`[+] Migrated missing Certificate to DB: ${c.regNo}`);
    }
  }

  // 8. Sync Plans
  const filePlans = readJsonFile('plans.json');
  for (const p of filePlans) {
    const code = (p.code || p.name).toLowerCase().trim();
    const exists = await Plan.findOne({ $or: [{ code }, { name: p.name }] });
    if (!exists) {
      await Plan.create(cleanDoc(p));
      console.log(`[+] Migrated missing Plan to DB: ${p.name}`);
    }
  }

  // 9. Sync Notifications
  const fileNotifs = readJsonFile('notifications.json');
  for (const n of fileNotifs) {
    if (!n.title) continue;
    const exists = await Notification.findOne({ title: n.title });
    if (!exists) {
      await Notification.create(cleanDoc(n));
      console.log(`[+] Migrated missing Notification to DB: ${n.title}`);
    }
  }

  // 10. Sync Dynamic Reports
  const fileDynReports = readJsonFile('dynamicReports.json');
  for (const dr of fileDynReports) {
    if (!dr.reportName) continue;
    const exists = await DynamicReport.findOne({ reportName: dr.reportName });
    if (!exists) {
      await DynamicReport.create(cleanDoc(dr));
      console.log(`[+] Migrated missing DynamicReport to DB: ${dr.reportName}`);
    }
  }

  // 11. Sync Report Types
  const fileReportTypes = readJsonFile('reportTypes.json');
  for (const rt of fileReportTypes) {
    if (!rt.name) continue;
    const exists = await ReportType.findOne({ name: rt.name });
    if (!exists) {
      await ReportType.create(cleanDoc(rt));
      console.log(`[+] Migrated missing ReportType to DB: ${rt.name}`);
    }
  }

  console.log('\n--- MongoDB Current Status ---');
  const counts = {
    Users: await User.countDocuments(),
    Receipts: await DonationReceipt.countDocuments(),
    DonationHeads: await DonationHead.countDocuments(),
    Staff: await Staff.countDocuments(),
    Roles: await Role.countDocuments(),
    Employees: await Employee.countDocuments(),
    Certificates: await Certificate.countDocuments(),
    Plans: await Plan.countDocuments(),
    Notifications: await Notification.countDocuments(),
    DynamicReports: await DynamicReport.countDocuments(),
    ReportTypes: await ReportType.countDocuments(),
    ReceiptTypes: await ReceiptType.countDocuments()
  };
  console.table(counts);

  await mongoose.connection.close();
}

syncAndOptimize().catch(err => {
  console.error('Sync error:', err);
  process.exit(1);
});
