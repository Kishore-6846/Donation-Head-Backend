const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getIsConnected } = require('../config/db');
const User = require('../models/User');
const DonationReceipt = require('../models/DonationReceipt');
const Staff = require('../models/Staff');
const Plan = require('../models/Plan');
const { getCollection, saveCollection } = require('../services/storageService');

const initialUsers = [];

const getUsers = () => getCollection('users', initialUsers);
const saveUsers = (list) => saveCollection('users', list);

// Helper to combine DB and File collections without duplicates
const combineUniqueItems = (dbList = [], fileList = [], keyFn) => {
  const map = new Map();
  (fileList || []).forEach(item => {
    if (!item) return;
    const key = keyFn(item);
    if (key) map.set(key, item);
  });
  (dbList || []).forEach(item => {
    if (!item) return;
    const key = keyFn(item);
    if (key) map.set(key, item);
    else map.set(Math.random().toString(), item);
  });
  return Array.from(map.values());
};

const getStaffKey = (s) => (s._id || s.id || s.email || '').toString();
const getReceiptKey = (r) => (r._id || r.id || r.receiptNo || '').toString();

const matchTrustStaff = (user, staffList) => {
  const uEmail = (user.email || '').trim().toLowerCase();
  const uId = (user._id || user.id || '').toString();
  const uName = (user.trustName || user.name || '').trim().toLowerCase();

  return (staffList || []).filter(s => {
    if (!s) return false;
    if (s.status && s.status.toLowerCase() === 'inactive') return false;
    const sEmail = (s.trustEmail || '').trim().toLowerCase();
    const sId = (s.trustId || '').toString();
    const sName = (s.trustName || '').trim().toLowerCase();

    const matchEmail = uEmail && sEmail && sEmail === uEmail;
    const matchId = uId && sId && sId === uId;
    const matchName = uName && sName && uName !== 'trust organization' && sName === uName;

    return Boolean(matchEmail || matchId || matchName);
  }).length;
};

const matchTrustReceipts = (user, receiptsList) => {
  const uEmail = (user.email || '').trim().toLowerCase();
  const uId = (user._id || user.id || '').toString();
  const uName = (user.trustName || user.name || '').trim().toLowerCase();

  return (receiptsList || []).filter(r => {
    if (!r) return false;
    if (r.status && r.status.toLowerCase() === 'inactive') return false;

    const rEmail = (r.trustEmail || '').trim().toLowerCase();
    const rCreated = (r.createdBy || '').trim().toLowerCase();
    const rId = (r.trustId || '').toString();
    const rTrust = (r.trustName || '').trim().toLowerCase();

    const matchEmail = uEmail && (rEmail === uEmail || rCreated === uEmail);
    const matchId = uId && rId && rId === uId;
    const matchName = uName && rTrust && uName !== 'trust organization' && rTrust === uName;

    return Boolean(matchEmail || matchId || matchName);
  }).length;
};

// GET /api/users - List users (trusts)
router.get('/', async (req, res) => {
  try {
    const { search, plan, status } = req.query;
    let usersList = null;

    let allDbStaff = [];
    let allDbReceipts = [];

    if (getIsConnected()) {
      try {
        allDbStaff = await Staff.find({}).lean();
      } catch (sErr) {
        console.warn('Error fetching allDbStaff in GET /api/users:', sErr.message);
        allDbStaff = [];
      }
      try {
        allDbReceipts = await DonationReceipt.find({}).lean();
      } catch (rErr) {
        console.warn('Error fetching allDbReceipts in GET /api/users:', rErr.message);
        allDbReceipts = [];
      }
    }

    const allStaff = combineUniqueItems(allDbStaff, getCollection('staff', []), getStaffKey);
    const allReceipts = combineUniqueItems(allDbReceipts, getCollection('receipts', []), getReceiptKey);

    if (getIsConnected()) {
      try {
        const query = {
          $and: [
            { role: { $not: /super/i } },
            { isSuperAdmin: { $ne: true } }
          ]
        };
        if (status && status !== 'All') {
          query.status = { $regex: new RegExp(`^${status}$`, 'i') };
        }
        if (plan && plan !== 'All') {
          query.plan = { $regex: new RegExp(`^${plan}$`, 'i') };
        }
        if (search) {
          query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { trustName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { contactPerson: { $regex: search, $options: 'i' } }
          ];
        }
        const dbUsers = await User.find(query).sort({ createdAt: -1 }).lean();

        usersList = dbUsers.map(u => {
          const staffCount = matchTrustStaff(u, allStaff);
          const receiptsCount = matchTrustReceipts(u, allReceipts);

          return {
            _id: u._id.toString(),
            name: u.name || u.trustName || 'Trust Organization',
            trustName: u.trustName || u.name || 'Trust Organization',
            contactPerson: u.contactPerson || u.name || 'Admin',
            contactPersonEmail: u.contactPersonEmail || '',
            contactPersonMobile: u.contactPersonMobile || '',
            email: u.email || '',
            mobile: u.mobile || u.phone || '',
            address: u.address || '',
            state: u.state || '',
            website: u.website || '',
            registrationNo: u.registrationNo || '',
            panNo: u.panNo || '',
            fcraNo: u.fcraNo || '',
            section80GRegNo: u.section80GRegNo || '',
            plan: u.plan || 'Standard',
            receiptsCount: receiptsCount,
            staffCount: staffCount,
            status: u.status || 'Active',
            joinedDate: u.joinedDate || (u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB') : 'Today'),
            createdAt: u.createdAt,
            logo: u.logo || '',
            role: u.role || 'Admin'
          };
        });
      } catch (e) {
        console.warn('DB read error for users:', e.message);
      }
    }

    if (usersList === null) {
      usersList = getUsers()
        .filter(u => !u.isSuperAdmin && (!u.role || !u.role.toLowerCase().includes('super')))
        .map(u => {
          const staffCount = matchTrustStaff(u, allStaff);
          const receiptsCount = matchTrustReceipts(u, allReceipts);

          return {
            ...u,
            staffCount: staffCount,
            receiptsCount: receiptsCount
          };
        });
    }

    if (status && status !== 'All') {
      usersList = usersList.filter(u => (u.status || 'Active').toLowerCase() === status.toLowerCase());
    }

    if (plan && plan !== 'All') {
      usersList = usersList.filter(u => (u.plan || 'Standard').toLowerCase() === plan.toLowerCase());
    }

    if (search) {
      const q = search.toLowerCase();
      usersList = usersList.filter(u =>
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.trustName && u.trustName.toLowerCase().includes(q)) ||
        (u.contactPerson && u.contactPerson.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.mobile && u.mobile.includes(q))
      );
    }

    return res.json({
      success: true,
      count: usersList.length,
      data: usersList
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ success: false, message: error.message, data: getUsers() });
  }
});

// GET /api/users/:id/summary - Comprehensive view of a trust (profile, receipts, staff, donors, analytics)
router.get('/:id/summary', async (req, res) => {
  try {
    const { id } = req.params;
    let user = null;

    if (getIsConnected()) {
      try {
        if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
          user = await User.findById(id).lean();
        } else {
          user = await User.findOne({ $or: [{ _id: id }, { email: id }] }).lean();
        }
      } catch (e) {}
    }

    if (!user) {
      const users = getUsers();
      user = users.find(u => u._id === id || u.email === id);
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'Trust user not found' });
    }

    // Strip password
    const { password, ...safeUser } = user;

    // Fetch Receipts for this trust
    let dbReceipts = [];
    if (getIsConnected()) {
      try {
        const orClauses = [];
        if (safeUser.email) {
          orClauses.push({ trustEmail: new RegExp(`^${safeUser.email.trim()}$`, 'i') });
          orClauses.push({ createdBy: new RegExp(`^${safeUser.email.trim()}$`, 'i') });
        }
        if (safeUser.trustName && safeUser.trustName.trim().toLowerCase() !== 'trust organization') {
          orClauses.push({ trustName: new RegExp(`^${safeUser.trustName.trim()}$`, 'i') });
        }
        if (safeUser.name && safeUser.name.trim().toLowerCase() !== 'trust organization') {
          orClauses.push({ trustName: new RegExp(`^${safeUser.name.trim()}$`, 'i') });
        }
        if (orClauses.length > 0) {
          dbReceipts = await DonationReceipt.find({
            $and: [
              { $or: orClauses },
              { status: { $ne: 'Inactive' } }
            ]
          }).sort({ createdAt: -1 }).lean();
        }
      } catch (e) {
        console.warn('Error fetching receipts for trust summary:', e.message);
      }
    }

    const allFileReceipts = getCollection('receipts', []);
    const fileReceipts = allFileReceipts.filter(r => {
      if (!r) return false;
      if (r.status && r.status.toLowerCase() === 'inactive') return false;
      const rEmail = (r.trustEmail || '').trim().toLowerCase();
      const rCreated = (r.createdBy || '').trim().toLowerCase();
      const rTrust = (r.trustName || '').trim().toLowerCase();
      const uEmail = (safeUser.email || '').trim().toLowerCase();
      const uTrust = (safeUser.trustName || safeUser.name || '').trim().toLowerCase();
      const matchEmail = uEmail && (rEmail === uEmail || rCreated === uEmail);
      const matchTrust = uTrust && uTrust !== 'trust organization' && (rTrust === uTrust);
      return Boolean(matchEmail || matchTrust);
    });

    const receipts = combineUniqueItems(dbReceipts, fileReceipts, getReceiptKey);

    // Fetch Staff for this trust
    let dbStaffMembers = [];
    if (getIsConnected()) {
      try {
        const orClauses = [];
        if (safeUser.email) {
          orClauses.push({ trustEmail: new RegExp(`^${safeUser.email.trim()}$`, 'i') });
        }
        if (safeUser._id) {
          orClauses.push({ trustId: safeUser._id.toString() });
        }
        if (safeUser.trustName && safeUser.trustName.trim().toLowerCase() !== 'trust organization') {
          orClauses.push({ trustName: new RegExp(`^${safeUser.trustName.trim()}$`, 'i') });
        }
        if (orClauses.length > 0) {
          dbStaffMembers = await Staff.find({ $or: orClauses }).sort({ createdAt: -1 }).lean();
        }
      } catch (e) {
        console.warn('Error fetching staff for trust summary:', e.message);
      }
    }

    const allFileStaff = getCollection('staff', []);
    const fileStaff = allFileStaff.filter(s => {
      if (!s) return false;
      const sEmail = (s.trustEmail || '').trim().toLowerCase();
      const sId = (s.trustId || '').toString();
      const sName = (s.trustName || '').trim().toLowerCase();
      const uEmail = (safeUser.email || '').trim().toLowerCase();
      const uId = (safeUser._id || safeUser.id || '').toString();
      const uTrust = (safeUser.trustName || safeUser.name || '').trim().toLowerCase();

      const matchEmail = uEmail && sEmail === uEmail;
      const matchId = uId && sId === uId;
      const matchTrust = uTrust && uTrust !== 'trust organization' && sName === uTrust;
      return Boolean(matchEmail || matchId || matchTrust);
    });

    const staffMembers = combineUniqueItems(dbStaffMembers, fileStaff, getStaffKey);

    // Calculate aggregated statistics
    const totalAmount = receipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const totalReceipts = receipts.length;

    // Aggregate unique donors
    const donorMap = new Map();
    receipts.forEach(r => {
      const key = (r.phone || r.email || r.donorName || '').trim().toLowerCase();
      if (!key) return;
      if (!donorMap.has(key)) {
        donorMap.set(key, {
          name: r.donorName || 'Anonymous',
          phone: r.phone || '',
          email: r.email || '',
          panNo: r.panNo || '',
          totalDonated: 0,
          donationsCount: 0,
          lastDonationDate: r.receiptDate || ''
        });
      }
      const d = donorMap.get(key);
      d.totalDonated += Number(r.amount) || 0;
      d.donationsCount += 1;
      d.lastDonationDate = r.receiptDate || d.lastDonationDate;
    });
    const donorsList = Array.from(donorMap.values());

    // Aggregate donation heads breakdown
    const headsMap = {};
    receipts.forEach(r => {
      const h = r.donationHead || 'General';
      if (!headsMap[h]) headsMap[h] = { head: h, count: 0, totalAmount: 0 };
      headsMap[h].count += 1;
      headsMap[h].totalAmount += Number(r.amount) || 0;
    });

    // Aggregate payment modes breakdown
    const modesMap = {};
    receipts.forEach(r => {
      const m = r.paymentMode || 'Online / UPI';
      if (!modesMap[m]) modesMap[m] = { mode: m, count: 0, totalAmount: 0 };
      modesMap[m].count += 1;
      modesMap[m].totalAmount += Number(r.amount) || 0;
    });

    // Fetch plan details if exists
    let planDetails = null;
    if (safeUser.plan) {
      if (getIsConnected()) {
        try {
          planDetails = await Plan.findOne({ name: { $regex: new RegExp(`^${safeUser.plan}$`, 'i') } }).lean();
        } catch (e) {}
      }
      if (!planDetails) {
        const allPlans = getCollection('plans', []);
        planDetails = allPlans.find(p => p.name && p.name.toLowerCase() === safeUser.plan.toLowerCase());
      }
    }

    return res.json({
      success: true,
      data: {
        user: safeUser,
        stats: {
          totalReceipts,
          totalAmount,
          totalStaff: staffMembers.length,
          activeStaff: staffMembers.filter(s => (s.status || 'Active').toLowerCase() === 'active').length,
          totalDonors: donorsList.length
        },
        plan: planDetails || { name: safeUser.plan || 'Standard', staffAllowed: 5, price: 999 },
        receipts,
        staff: staffMembers,
        donors: donorsList,
        headsBreakdown: Object.values(headsMap),
        modesBreakdown: Object.values(modesMap)
      }
    });
  } catch (error) {
    console.error('Error fetching trust summary:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let user = null;

    if (getIsConnected()) {
      try {
        if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
          user = await User.findById(id).lean();
        } else {
          user = await User.findOne({ $or: [{ _id: id }, { email: id }] }).lean();
        }
      } catch (e) {}
    }

    if (!user) {
      const users = getUsers();
      user = users.find(u => u._id === id || u.email === id);
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let allDbStaff = [];
    let allDbReceipts = [];
    if (getIsConnected()) {
      try { allDbStaff = await Staff.find({}).lean(); } catch (e) {}
      try { allDbReceipts = await DonationReceipt.find({}).lean(); } catch (e) {}
    }
    const allStaff = combineUniqueItems(allDbStaff, getCollection('staff', []), getStaffKey);
    const allReceipts = combineUniqueItems(allDbReceipts, getCollection('receipts', []), getReceiptKey);

    const safeUser = {
      ...user,
      staffCount: matchTrustStaff(user, allStaff),
      receiptsCount: matchTrustReceipts(user, allReceipts)
    };

    return res.json({ success: true, data: safeUser });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/users - Create new user / trust organization
router.post('/', async (req, res) => {
  try {
    const {
      trustName,
      name,
      contactPerson,
      email,
      mobile,
      password,
      registrationNo,
      panNo,
      fcraNo,
      section80GRegNo,
      plan,
      status
    } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }

    const cleanMobile = (mobile || '').replace(/\D/g, '').slice(0, 10);
    if (mobile && cleanMobile.length !== 10) {
      return res.status(400).json({ success: false, message: 'Mobile number must be exactly 10 digits' });
    }

    const tName = (trustName || name || 'New Trust Organization').trim();
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    const rawPassword = password || 'Admin@123';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    const userDoc = {
      name: tName,
      trustName: tName,
      contactPerson: (contactPerson || name || 'Trust Admin').trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      mobile: mobile || '',
      registrationNo: registrationNo || '',
      panNo: (panNo || '').toUpperCase(),
      fcraNo: fcraNo || '',
      section80GRegNo: section80GRegNo || '',
      plan: plan || 'Standard',
      receiptsCount: 0,
      status: status || 'Active',
      role: 'Admin',
      isSuperAdmin: false,
      joinedDate: formattedDate,
      createdAt: new Date().toISOString()
    };

    let finalUser = { ...userDoc };

    if (getIsConnected()) {
      try {
        const created = await User.create(userDoc);
        finalUser = created.toObject ? created.toObject() : created;
        finalUser._id = created._id ? created._id.toString() : 'usr_' + Date.now();
      } catch (e) {
        console.warn('DB user create error:', e.message);
        finalUser._id = 'usr_' + Date.now();
      }
    } else {
      finalUser._id = 'usr_' + Date.now();
    }

    const currentUsers = getUsers();
    currentUsers.unshift(finalUser);
    saveUsers(currentUsers);

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: finalUser
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/users/:id - Update user details
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    if (updates.password && updates.password.trim()) {
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(updates.password, salt);
    } else {
      delete updates.password;
    }

    let updated = null;

    if (getIsConnected()) {
      try {
        if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
          updated = await User.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
        }
        if (!updated) {
          const cleanEmail = decodeURIComponent(id).trim();
          updated = await User.findOneAndUpdate(
            { email: new RegExp(`^${cleanEmail}$`, 'i') },
            { $set: updates },
            { new: true }
          ).lean();
        }
      } catch (e) {
        console.warn('DB error in PUT /api/users/:id:', e.message);
      }
    }

    const currentUsers = getUsers();
    const target = decodeURIComponent(id).toLowerCase().trim();
    const index = currentUsers.findIndex(u =>
      (u._id && u._id.toString().toLowerCase() === target) ||
      (u.id && u.id.toString().toLowerCase() === target) ||
      (u.email && u.email.toLowerCase().trim() === target)
    );
    if (index !== -1) {
      currentUsers[index] = { ...currentUsers[index], ...updates };
      updated = currentUsers[index];
      saveUsers(currentUsers);
    } else {
      const newUser = { _id: id, ...updates };
      currentUsers.push(newUser);
      updated = newUser;
      saveUsers(currentUsers);
    }

    return res.json({
      success: true,
      message: 'User updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/users/:id - Delete user (trust)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (getIsConnected()) {
      try {
        if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
          await User.findByIdAndDelete(id);
        } else {
          await User.deleteOne({ $or: [{ _id: id }, { email: id }] });
        }
      } catch (e) {}
    }

    const currentUsers = getUsers();
    const filtered = currentUsers.filter(u => u._id !== id && u.email !== id);
    saveUsers(filtered);

    return res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
module.exports.getUsers = getUsers;
