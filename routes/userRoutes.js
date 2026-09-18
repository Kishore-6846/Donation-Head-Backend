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

// GET /api/users - List users (trusts)
router.get('/', async (req, res) => {
  try {
    const { search, plan, status } = req.query;
    let usersList = null;

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
        let allDbStaff = [];
        try {
          allDbStaff = await Staff.find({}).lean();
        } catch (sErr) {
          console.warn('Error fetching allDbStaff in GET /api/users:', sErr.message);
          allDbStaff = getCollection('staff', []);
        }

        usersList = dbUsers.map(u => {
          const uEmail = (u.email || '').trim().toLowerCase();
          const uId = u._id ? u._id.toString() : '';
          const uName = (u.trustName || u.name || '').trim().toLowerCase();
          const matchingStaff = allDbStaff.filter(s =>
            (s.trustEmail && s.trustEmail.trim().toLowerCase() === uEmail) ||
            (s.trustId && s.trustId.toString() === uId) ||
            (s.trustName && s.trustName.trim().toLowerCase() === uName)
          );
          const staffCount = matchingStaff.length;
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
            receiptsCount: u.receiptsCount || 0,
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
      const allStaff = getCollection('staff', []);
      usersList = getUsers()
        .filter(u => !u.isSuperAdmin && (!u.role || !u.role.toLowerCase().includes('super')))
        .map(u => {
          const uEmail = (u.email || '').toLowerCase();
          const uId = (u._id || '').toString();
          const uName = (u.trustName || u.name || '').toLowerCase();
          const count = allStaff.filter(s =>
            (s.trustEmail && s.trustEmail.toLowerCase() === uEmail) ||
            (s.trustId && s.trustId === uId) ||
            (s.trustName && s.trustName.toLowerCase() === uName)
          ).length;
          return { ...u, staffCount: count || u.staffCount || 0 };
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
    let receipts = [];
    if (getIsConnected()) {
      try {
        receipts = await DonationReceipt.find({
          $or: [
            { trustEmail: safeUser.email },
            { createdBy: safeUser.email },
            { trustName: safeUser.trustName },
            { trustName: safeUser.name }
          ]
        }).sort({ createdAt: -1 }).lean();
      } catch (e) {
        console.warn('Error fetching receipts for trust summary:', e.message);
      }
    }

    if (receipts.length === 0) {
      const allReceipts = getCollection('receipts', []);
      receipts = allReceipts.filter(r =>
        (r.trustEmail && r.trustEmail.toLowerCase() === safeUser.email?.toLowerCase()) ||
        (r.createdBy && r.createdBy.toLowerCase() === safeUser.email?.toLowerCase()) ||
        (r.trustName && r.trustName.toLowerCase() === (safeUser.trustName || safeUser.name)?.toLowerCase())
      );
    }

    // Fetch Staff for this trust
    let staffMembers = [];
    if (getIsConnected()) {
      try {
        staffMembers = await Staff.find({
          $or: [
            { trustEmail: safeUser.email },
            { trustId: safeUser._id ? safeUser._id.toString() : '' },
            { trustName: safeUser.trustName }
          ]
        }).sort({ createdAt: -1 }).lean();
      } catch (e) {
        console.warn('Error fetching staff for trust summary:', e.message);
      }
    }

    if (staffMembers.length === 0) {
      const allStaff = getCollection('staff', []);
      staffMembers = allStaff.filter(s =>
        (s.trustEmail && s.trustEmail.toLowerCase() === safeUser.email?.toLowerCase()) ||
        (s.trustId && s.trustId === safeUser._id?.toString()) ||
        (s.trustName && s.trustName.toLowerCase() === (safeUser.trustName || safeUser.name)?.toLowerCase())
      );
    }

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
    return res.json({ success: true, data: user });
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
        } else {
          updated = await User.findOneAndUpdate({ $or: [{ _id: id }, { email: id }] }, { $set: updates }, { new: true }).lean();
        }
      } catch (e) {}
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
