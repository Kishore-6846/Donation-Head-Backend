const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/db');
const DonationReceipt = require('../models/DonationReceipt');
const DonationHead = require('../models/DonationHead');
const Certificate = require('../models/Certificate');
const Plan = require('../models/Plan');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Notification = require('../models/Notification');
const { getCollection } = require('../services/storageService');

// Import persistent store getters
const { getPlans } = require('./planRoutes');
const { getUsers } = require('./userRoutes');
const { getEmployees } = require('./employeeRoutes');
const { getNotifications } = require('./notificationRoutes');
const { getReceipts } = require('./receiptRoutes');
const { getHeads } = require('./headRoutes');

// GET Trust Dashboard Stats
const getTrustStats = async (req, res) => {
  try {
    const { trustEmail } = req.query;
    let allReceipts = null;
    let allHeads = null;
    let activeNotifs = null;
    let dbVaultCount = null;

    if (getIsConnected()) {
      try {
        const receiptQuery = { status: { $ne: 'Inactive' } };
        const certQuery = {};
        if (trustEmail && trustEmail !== 'admin@donationreceipt.in') {
          const emailRegex = new RegExp(`^${trustEmail.trim()}$`, 'i');
          receiptQuery.$or = [
            { trustEmail: emailRegex },
            { createdBy: emailRegex }
          ];
          certQuery.$or = [
            { trustEmail: emailRegex },
            { createdBy: emailRegex }
          ];
        }
        allReceipts = await DonationReceipt.find(receiptQuery).lean();
        allHeads = await DonationHead.find({ status: { $ne: 'Inactive' } }).lean();
        activeNotifs = await Notification.find({ status: { $ne: 'Draft' } }).sort({ createdAt: -1 }).lean();
        dbVaultCount = await Certificate.countDocuments(certQuery);
      } catch (dbErr) {
        console.warn('DB error in getTrustStats:', dbErr.message);
      }
    }

    if (allReceipts === null) {
      allReceipts = getReceipts().filter(r => (r.status || 'Active') !== 'Inactive');
      if (trustEmail && trustEmail !== 'admin@donationreceipt.in') {
        const tLower = trustEmail.trim().toLowerCase();
        allReceipts = allReceipts.filter(r =>
          (r.trustEmail && r.trustEmail.toLowerCase() === tLower) ||
          (r.createdBy && r.createdBy.toLowerCase() === tLower)
        );
      }
    }
    if (allHeads === null) {
      allHeads = getHeads().filter(h => (h.status || 'Active') !== 'Inactive');
    }
    if (activeNotifs === null) {
      activeNotifs = getNotifications().filter(n => !n.status || n.status.toLowerCase() !== 'draft');
    }

    let vaultCount = (dbVaultCount !== null && dbVaultCount !== undefined && dbVaultCount > 0) ? dbVaultCount : 0;
    if (vaultCount === 0) {
      const fileCerts = getCollection('certificates', []);
      if (trustEmail && trustEmail !== 'admin@donationreceipt.in') {
        const tLower = trustEmail.trim().toLowerCase();
        vaultCount = fileCerts.filter(c =>
          (c.trustEmail && c.trustEmail.toLowerCase() === tLower) ||
          (c.createdBy && c.createdBy.toLowerCase() === tLower)
        ).length;
      } else {
        vaultCount = fileCerts.length;
      }
    }

    const receiptsCount = allReceipts.length;
    const headsCount = allHeads.length;

    const formattedNotifs = activeNotifs.map((n, idx) => ({
      id: (n._id || idx + 1).toString(),
      _id: (n._id || idx + 1).toString(),
      date: n.publishDate || 'Today',
      publishDate: n.publishDate || 'Today',
      title: n.title,
      message: n.message,
      category: n.category,
      text: n.text || (n.title ? `${n.title} — ${n.message}` : n.message),
      actionText: n.actionText || '',
      actionLink: n.actionLink || n.link || '',
      link: n.actionLink || n.link || ''
    }));

    return res.json({
      success: true,
      stats: {
        allReceipts: receiptsCount,
        vaultCount: vaultCount,
        donationHeads: headsCount,
        activeReceipts: receiptsCount
      },
      notifications: formattedNotifs
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET Super Admin Dashboard Stats & Recent Activity
const getSuperAdminStats = async (req, res) => {
  try {
    let plansList = null;
    let usersList = null;
    let employeesList = null;
    let receiptsList = null;
    let notifsList = null;

    if (getIsConnected()) {
      try {
        const [dbPlans, dbUsers, dbEmps, dbReceipts, dbNotifs] = await Promise.all([
          Plan.find().lean(),
          User.find().sort({ createdAt: -1 }).lean(),
          Employee.find().sort({ createdAt: -1 }).lean(),
          DonationReceipt.find().sort({ createdAt: -1 }).lean(),
          Notification.find().sort({ createdAt: -1 }).lean()
        ]);

        plansList = dbPlans;
        // Concept: A Trust is run by an Admin user. SuperAdmin manages all Trust Admins (Users).
        // Filter non-superadmin users (Trust Admin accounts)
        usersList = dbUsers.filter(u => !u.isSuperAdmin && (!u.role || !u.role.toLowerCase().includes('super')));
        employeesList = dbEmps;
        receiptsList = dbReceipts;
        notifsList = dbNotifs;
      } catch (dbErr) {
        console.warn('DB superadmin-stats fetch error:', dbErr.message);
      }
    }

    // Only fallback to local storage if MongoDB is NOT connected or query failed
    if (plansList === null) plansList = getPlans();
    if (usersList === null) usersList = getUsers().filter(u => !u.isSuperAdmin && (!u.role || !u.role.toLowerCase().includes('super')));
    if (employeesList === null) employeesList = getEmployees();
    if (receiptsList === null) receiptsList = getReceipts();
    if (notifsList === null) notifsList = getNotifications();

    const totalPlans = plansList.length;
    const activePlans = plansList.filter(p => !p.status || p.status.toLowerCase() === 'active').length;

    const totalUsers = usersList.length;
    const activeUsers = usersList.filter(u => !u.status || u.status.toLowerCase() === 'active').length;
    const pendingUsers = usersList.filter(u => u.status && (u.status.toLowerCase() === 'pending' || u.status.toLowerCase().includes('approval'))).length;

    const totalEmployees = employeesList.length;
    const activeEmployees = employeesList.filter(e => !e.status || e.status.toLowerCase() === 'active').length;

    const totalReceipts = receiptsList.length;
    const activeReceipts = receiptsList.filter(r => !r.status || r.status.toLowerCase() === 'active').length;
    const totalDonationAmount = receiptsList.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    const recentReceipts = receiptsList.slice(0, 8).map(r => ({
      _id: (r._id || '').toString(),
      receiptNo: r.receiptNo,
      donorName: r.donorName,
      trustName: r.trustName || 'Trust Organization',
      donationHead: r.donationHead,
      amount: r.amount,
      paymentMode: r.paymentMode,
      receiptDate: r.receiptDate || (r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB') : 'Today'),
      status: r.status || 'Active'
    }));

    const recentUsers = usersList.slice(0, 5).map(u => {
      const uEmail = (u.email || '').trim().toLowerCase();
      const uId = (u._id || '').toString();
      const uName = (u.trustName || u.name || '').trim().toLowerCase();
      const count = (receiptsList || []).filter(r => {
        if (!r) return false;
        if (r.status && r.status.toLowerCase() === 'inactive') return false;
        const rEmail = (r.trustEmail || '').trim().toLowerCase();
        const rCreated = (r.createdBy || '').trim().toLowerCase();
        const rTrust = (r.trustName || '').trim().toLowerCase();
        return (uEmail && (rEmail === uEmail || rCreated === uEmail)) || (uName && uName !== 'trust organization' && rTrust === uName);
      }).length;

      return {
        _id: (u._id || '').toString(),
        name: u.name || u.trustName || 'Trust Organization',
        trustName: u.trustName || u.name || 'Trust Organization',
        contactPerson: u.contactPerson || u.name || 'Admin',
        email: u.email || '',
        mobile: u.mobile || u.phone || '',
        plan: u.plan || 'Standard',
        receiptsCount: count || u.receiptsCount || 0,
        status: u.status || 'Active',
        joinedDate: u.joinedDate || (u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB') : 'Today')
      };
    });

    const notifications = notifsList.slice(0, 5).map(n => ({
      _id: (n._id || '').toString(),
      title: n.title,
      message: n.message,
      category: n.category,
      targetAudience: n.targetAudience,
      actionText: n.actionText,
      actionLink: n.actionLink,
      publishDate: n.publishDate || (n.createdAt ? new Date(n.createdAt).toLocaleDateString('en-GB') : 'Today')
    }));

    return res.json({
      success: true,
      stats: {
        plans: {
          total: totalPlans,
          active: activePlans
        },
        users: {
          total: totalUsers,
          active: activeUsers,
          pending: pendingUsers
        },
        employees: {
          total: totalEmployees,
          active: activeEmployees
        },
        receipts: {
          total: totalReceipts,
          active: activeReceipts,
          totalAmount: totalDonationAmount
        }
      },
      recentReceipts,
      recentUsers,
      notifications
    });
  } catch (error) {
    console.error('Super Admin stats error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Route registrations
router.get('/stats', getTrustStats);
router.get('/superadmin-stats', getSuperAdminStats);
router.get(['/', '/summary'], async (req, res) => {
  const isSuper = req.originalUrl.toLowerCase().includes('superadmin') || req.query.scope === 'superadmin';
  if (isSuper) {
    return getSuperAdminStats(req, res);
  }
  return getTrustStats(req, res);
});

module.exports = router;
