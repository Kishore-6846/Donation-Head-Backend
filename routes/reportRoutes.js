const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/db');
const DonationReceipt = require('../models/DonationReceipt');
const { initialDonationReceipts } = require('../data/seedData');
const { getReceipts } = require('./receiptRoutes');

const isSuperAdminEmail = (email) => {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return e.includes('superadmin') || e === 'superadmin@gmail.com';
};

const extractTrustInfo = (req) => {
  const trustEmail = (req.query.trustEmail || req.headers['x-trust-email'] || req.query.email || '').trim();
  const trustId = (req.query.trustId || req.headers['x-trust-id'] || '').trim();
  const trustName = (req.query.trustName || req.headers['x-trust-name'] || '').trim();
  return { trustEmail, trustId, trustName };
};

const getLiveReceiptsList = async (trustEmail = '', trustId = '', trustName = '') => {
  let mongoList = [];
  const query = {};
  
  const isFiltered = (trustEmail && !isSuperAdminEmail(trustEmail)) || (trustId && trustId !== 'all') || (trustName && trustName !== 'all' && trustName !== 'All Trusts');

  if (isFiltered) {
    const orConditions = [];
    if (trustEmail && !isSuperAdminEmail(trustEmail)) {
      const emailRegex = new RegExp(`^${trustEmail.trim()}$`, 'i');
      orConditions.push({ trustEmail: emailRegex });
      orConditions.push({ createdBy: emailRegex });
    }
    if (trustId && trustId.match(/^[0-9a-fA-F]{24}$/)) {
      orConditions.push({ trustId: trustId });
    }
    if (trustName && trustName.trim() && trustName !== 'all' && trustName !== 'All Trusts') {
      const nameRegex = new RegExp(`^${trustName.trim()}$`, 'i');
      orConditions.push({ trustName: nameRegex });
    }
    if (orConditions.length > 0) {
      query.$or = orConditions;
    }
  }

  if (getIsConnected()) {
    try {
      mongoList = await DonationReceipt.find(query)
        .select('-trustLogo -trustSignature -signature -logo -pdf -pdfData -file')
        .sort({ createdAt: -1 })
        .lean();
      return mongoList.filter(r => (r.status || 'Active') === 'Active');
    } catch (e) {
      console.warn('Error querying MongoDB receipts for reports:', e.message);
    }
  }

  let fileList = [];
  try {
    fileList = getReceipts();
    if (isFiltered) {
      fileList = fileList.filter(r => {
        const matchEmail = trustEmail && !isSuperAdminEmail(trustEmail) && (
          (r.trustEmail && r.trustEmail.toLowerCase() === trustEmail.toLowerCase()) ||
          (r.createdBy && r.createdBy.toLowerCase() === trustEmail.toLowerCase())
        );
        const matchId = trustId && r.trustId && r.trustId.toString() === trustId.toString();
        const matchName = trustName && trustName !== 'all' && trustName !== 'All Trusts' && r.trustName && r.trustName.toLowerCase() === trustName.toLowerCase();
        return matchEmail || matchId || matchName;
      });
    }
  } catch (e) {
    console.warn('Error querying JSON receipts for reports:', e.message);
  }

  return fileList.filter(r => (r.status || 'Active') === 'Active');
};

const formatDateDisplay = (dStr) => {
  if (!dStr) return new Date().toLocaleDateString('en-GB');
  if (dStr.includes('/')) return dStr;
  if (dStr.includes('-')) {
    const parts = dStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`; // YYYY-MM-DD -> DD/MM/YYYY
    }
  }
  return dStr;
};

const parseDateForFilter = (dStr) => {
  if (!dStr) return null;
  if (dStr.includes('-')) {
    const parts = dStr.split('-');
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  if (dStr.includes('/')) {
    const parts = dStr.split('/');
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  return new Date(dStr);
};

// Base reports catalog & summary
router.get(['/', '/list', '/summary'], async (req, res) => {
  try {
    const { trustEmail, trustId, trustName } = extractTrustInfo(req);
    const live = await getLiveReceiptsList(trustEmail, trustId, trustName);

    return res.json({
      success: true,
      message: 'Available platform reports',
      totalReceipts: live.length,
      reports: [
        { id: '10bd', name: 'Form 10BD Statutory Tax Report', path: '/api/reports/10bd' },
        { id: 'receipts', name: 'Donation Receipts Master Report', path: '/api/reports/receipts' },
        { id: 'head-wise', name: 'Donation Head Wise Collection Report', path: '/api/reports/head-wise' },
        { id: 'payment-mode', name: 'Payment Mode Reconciliation Report', path: '/api/reports/payment-mode' },
        { id: 'head-report', name: 'Donation Head Report Details', path: '/api/reports/head-report' },
        { id: 'donor-report', name: 'Donor Directory & Stewardship Report', path: '/api/reports/donor-report' },
        { id: 'type-report', name: 'Donation Type Classification Matrix', path: '/api/reports/type-report' },
        { id: 'payment-mode-report', name: 'Payment Mode Detailed Report', path: '/api/reports/payment-mode-report' },
        { id: 'superadmin', name: 'SuperAdmin Comprehensive Platform Report', path: '/api/reports/superadmin' },
        { id: 'records', name: 'Custom Dynamic Reports Records', path: '/api/reports/records' }
      ]
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Form 10BD compliance data matching exact government filing format
router.get('/10bd', async (req, res) => {
  try {
    const { financialYear = '2026-2027', reportType = 'Full Report', fromDate = '', toDate = '' } = req.query;
    const { trustEmail, trustId, trustName } = extractTrustInfo(req);
    const live = await getLiveReceiptsList(trustEmail, trustId, trustName);

    let allRecords = live.map((r, idx) => ({
      _id: (r._id || '').toString(),
      srNo: idx + 1,
      preAckNo: r.reference || '',
      idCode: r.panNo ? 'PAN' : (r.aadhaarNo ? 'Aadhaar' : 'PAN'),
      uniqueIdNo: r.panNo || r.aadhaarNo || 'PAN_NOT_GIVEN',
      sectionCode: 'Section 80G',
      urn: r.trustRegNo || 'AAVCA0216A25CH02',
      issuanceDate: formatDateDisplay(r.receiptDate),
      donorName: r.donorName || r.name || 'Anonymous Donor',
      address: r.address || '',
      donationType: r.donationType || r.type || 'General',
      modeOfReceipt: r.paymentDetails || (r.paymentMode ? `${r.paymentMode}` : 'Electronic modes including account payee cheque/draft'),
      amount: Number(r.amount || 0).toFixed(2),
      trustName: r.trustName || r.trust || 'Arulmigu Sivan Trust',
      trustEmail: r.trustEmail || ''
    }));

    if (fromDate || toDate) {
      const fromD = parseDateForFilter(fromDate);
      const toD = parseDateForFilter(toDate);

      allRecords = allRecords.filter(item => {
        const itemD = parseDateForFilter(item.issuanceDate);
        if (!itemD || isNaN(itemD.getTime())) return true;
        if (fromD && !isNaN(fromD.getTime()) && itemD < fromD) return false;
        if (toD && !isNaN(toD.getTime()) && itemD > toD) return false;
        return true;
      });
      allRecords = allRecords.map((r, i) => ({ ...r, srNo: i + 1 }));
    }

    if (reportType === 'Consolidated') {
      const consolidatedMap = new Map();
      allRecords.forEach(r => {
        const key = (r.donorName || '').trim().toLowerCase();
        if (!consolidatedMap.has(key)) {
          consolidatedMap.set(key, {
            ...r,
            count: 1,
            totalAmountNum: parseFloat(r.amount) || 0
          });
        } else {
          const existing = consolidatedMap.get(key);
          existing.count += 1;
          existing.totalAmountNum += parseFloat(r.amount) || 0;
          if (!existing.address && r.address) existing.address = r.address;
          if (!existing.trustName && r.trustName) existing.trustName = r.trustName;
        }
      });

      const consolidatedList = Array.from(consolidatedMap.values()).map((c, i) => ({
        srNo: i + 1,
        preAckNo: c.preAckNo,
        idCode: c.idCode,
        uniqueIdNo: c.uniqueIdNo,
        sectionCode: c.sectionCode,
        urn: c.urn,
        issuanceDate: c.issuanceDate,
        donorName: c.donorName,
        address: c.address,
        donationType: c.donationType,
        modeOfReceipt: c.modeOfReceipt,
        amount: c.totalAmountNum.toFixed(2),
        totalDonationsCount: c.count,
        trustName: c.trustName || 'Arulmigu Sivan Trust',
        trustEmail: c.trustEmail || ''
      }));

      return res.json({
        success: true,
        financialYear,
        reportType,
        totalEntries: consolidatedList.length,
        totalAmount: consolidatedList.reduce((acc, c) => acc + parseFloat(c.amount), 0).toFixed(2),
        data: consolidatedList
      });
    }

    return res.json({
      success: true,
      financialYear,
      reportType,
      totalEntries: allRecords.length,
      totalAmount: allRecords.reduce((acc, c) => acc + parseFloat(c.amount), 0).toFixed(2),
      data: allRecords
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Detailed Receipt Report endpoint matching donationreceipt.in/trust/reports.php
router.get('/receipts', async (req, res) => {
  try {
    const { financialYear = '2026-2027', fromDate = '', toDate = '', donationHead = '', paymentMode = '' } = req.query;
    const { trustEmail, trustId, trustName } = extractTrustInfo(req);
    const live = await getLiveReceiptsList(trustEmail, trustId, trustName);

    let allReceipts = live.map(r => ({
      _id: (r._id || '').toString(),
      receiptNo: r.receiptNo,
      name: r.donorName || r.name || 'Anonymous Donor',
      phone: r.phone || '',
      donationHead: r.donationHead || 'General',
      panNumber: r.panNo || '',
      aadhaarNumber: r.aadhaarNo || '',
      address: r.address || '',
      amount: Number(r.amount || 0).toFixed(2),
      donationDate: formatDateDisplay(r.receiptDate),
      paymentMode: r.paymentMode || 'Online / UPI',
      paymentDetails: r.paymentDetails || (r.reference ? `Ref: ${r.reference}` : (r.paymentMode || 'Online/UPI')),
      reference: r.reference || '',
      additionalNotes: r.notes || '',
      createdBy: r.createdBy || 'Admin',
      trustName: r.trustName || r.trust || 'Arulmigu Sivan Trust',
      trustEmail: r.trustEmail || ''
    }));

    if (fromDate || toDate) {
      const fromD = parseDateForFilter(fromDate);
      const toD = parseDateForFilter(toDate);

      allReceipts = allReceipts.filter(item => {
        const itemD = parseDateForFilter(item.donationDate);
        if (!itemD || isNaN(itemD.getTime())) return true;
        if (fromD && !isNaN(fromD.getTime()) && itemD < fromD) return false;
        if (toD && !isNaN(toD.getTime()) && itemD > toD) return false;
        return true;
      });
    }

    if (donationHead && donationHead.trim() && donationHead !== 'All' && donationHead !== 'All Donation Heads') {
      const targetHead = donationHead.trim().toLowerCase();
      allReceipts = allReceipts.filter(r => (r.donationHead || '').toLowerCase() === targetHead);
    }

    if (paymentMode && paymentMode.trim() && paymentMode !== 'All' && paymentMode !== 'All Payment Modes') {
      const targetMode = paymentMode.trim().toLowerCase();
      allReceipts = allReceipts.filter(r => (r.paymentMode || '').toLowerCase() === targetMode);
    }

    return res.json({
      success: true,
      financialYear,
      totalEntries: allReceipts.length,
      data: allReceipts
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Head-wise aggregate report
router.get('/head-wise', async (req, res) => {
  try {
    const { trustEmail, trustId, trustName } = extractTrustInfo(req);
    const receipts = await getLiveReceiptsList(trustEmail, trustId, trustName);
    const headMap = {};
    receipts.forEach(r => {
      const head = r.donationHead || 'General';
      if (!headMap[head]) {
        headMap[head] = { count: 0, totalAmount: 0 };
      }
      headMap[head].count += 1;
      headMap[head].totalAmount += Number(r.amount || 0);
    });

    const result = Object.keys(headMap).map(head => ({
      headName: head,
      count: headMap[head].count,
      totalAmount: headMap[head].totalAmount
    }));

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Payment mode aggregate report
router.get('/payment-mode', async (req, res) => {
  try {
    const { trustEmail, trustId, trustName } = extractTrustInfo(req);
    const receipts = await getLiveReceiptsList(trustEmail, trustId, trustName);
    const modeMap = {};
    receipts.forEach(r => {
      const mode = r.paymentMode || 'Online / UPI';
      if (!modeMap[mode]) {
        modeMap[mode] = { count: 0, totalAmount: 0 };
      }
      modeMap[mode].count += 1;
      modeMap[mode].totalAmount += Number(r.amount || 0);
    });

    const result = Object.keys(modeMap).map(mode => ({
      mode,
      count: modeMap[mode].count,
      totalAmount: modeMap[mode].totalAmount
    }));

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Detailed Donation Head Report endpoint
router.get(['/head-report', '/head-reports', '/donation-head-report'], async (req, res) => {
  try {
    const { donationHead = '', fromDate = '', toDate = '' } = req.query;
    const { trustEmail, trustId, trustName } = extractTrustInfo(req);
    const live = await getLiveReceiptsList(trustEmail, trustId, trustName);
    const isAllHeads = !donationHead || donationHead === '--Select Donation Head--' || donationHead.toLowerCase() === 'all' || donationHead === '';

    let allHeadRecords = live
      .filter(r => isAllHeads || (r.donationHead && r.donationHead.toLowerCase().includes(donationHead.toLowerCase())))
      .map(r => ({
        _id: (r._id || '').toString(),
        receiptNo: r.receiptNo,
        name: r.donorName || r.name || 'Anonymous Donor',
        panNumber: r.panNo || '',
        aadhaarNumber: r.aadhaarNo || '',
        donationHead: r.donationHead || donationHead || 'General',
        address: r.address || '',
        amount: Number(r.amount || 0).toFixed(2),
        reference: r.reference || '',
        donationDate: formatDateDisplay(r.receiptDate),
        trustName: r.trustName || r.trust || 'Arulmigu Sivan Trust',
        trustEmail: r.trustEmail || ''
      }));

    if (fromDate || toDate) {
      const fromD = parseDateForFilter(fromDate);
      const toD = parseDateForFilter(toDate);

      allHeadRecords = allHeadRecords.filter(item => {
        const itemD = parseDateForFilter(item.donationDate);
        if (!itemD || isNaN(itemD.getTime())) return true;
        if (fromD && !isNaN(fromD.getTime()) && itemD < fromD) return false;
        if (toD && !isNaN(toD.getTime()) && itemD > toD) return false;
        return true;
      });
    }

    return res.json({
      success: true,
      donationHead: donationHead || 'All',
      fromDate,
      toDate,
      totalEntries: allHeadRecords.length,
      data: allHeadRecords
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Detailed Donor Report endpoint
router.get(['/donor-report', '/donor-reports', '/donors'], async (req, res) => {
  try {
    const { fromDate = '', toDate = '' } = req.query;
    const { trustEmail, trustId, trustName } = extractTrustInfo(req);
    const live = await getLiveReceiptsList(trustEmail, trustId, trustName);

    const donorMap = new Map();
    for (const r of live) {
      const nameKey = (r.donorName || r.name || '').trim().toLowerCase();
      if (!nameKey) continue;

      if (!donorMap.has(nameKey)) {
        donorMap.set(nameKey, {
          name: (r.donorName || r.name || '').trim(),
          phone: r.phone || '',
          email: r.email || '',
          address: r.address || '',
          panNumber: r.panNo || '',
          aadhaarNumber: r.aadhaarNo || '',
          donationHead: r.donationHead || 'General',
          donationType: r.donationType || 'Voluntary Donation',
          paymentMode: r.paymentMode || 'Online / UPI',
          totalAmount: Number(r.amount || 0),
          receiptCount: 1,
          lastDonationDate: formatDateDisplay(r.receiptDate),
          trustName: r.trustName || r.trust || 'Arulmigu Sivan Trust',
          trustEmail: r.trustEmail || ''
        });
      } else {
        const existing = donorMap.get(nameKey);
        existing.totalAmount += Number(r.amount || 0);
        existing.receiptCount += 1;
        if (!existing.phone && r.phone) existing.phone = r.phone;
        if (!existing.email && r.email) existing.email = r.email;
        if (!existing.address && r.address) existing.address = r.address;
        if (!existing.panNumber && r.panNo) existing.panNumber = r.panNo;
        if (!existing.aadhaarNumber && r.aadhaarNo) existing.aadhaarNumber = r.aadhaarNo;
        if (!existing.trustName && r.trustName) existing.trustName = r.trustName;
      }
    }

    let allDonors = Array.from(donorMap.values());

    if (fromDate || toDate) {
      const fromD = parseDateForFilter(fromDate);
      const toD = parseDateForFilter(toDate);

      allDonors = allDonors.filter(item => {
        const itemD = parseDateForFilter(item.lastDonationDate);
        if (!itemD || isNaN(itemD.getTime())) return true;
        if (fromD && !isNaN(fromD.getTime()) && itemD < fromD) return false;
        if (toD && !isNaN(toD.getTime()) && itemD > toD) return false;
        return true;
      });
    }

    return res.json({
      success: true,
      fromDate,
      toDate,
      totalEntries: allDonors.length,
      data: allDonors
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Detailed Donation Type Report endpoint
router.get(['/type-report', '/type-reports', '/donation-type-report'], async (req, res) => {
  try {
    const { donationType = '', fromDate = '', toDate = '' } = req.query;
    const { trustEmail, trustId, trustName } = extractTrustInfo(req);
    const live = await getLiveReceiptsList(trustEmail, trustId, trustName);
    const isAllTypes = !donationType || donationType === '--Select Donation Type--' || donationType.toLowerCase() === 'all' || donationType === '';

    let allTypeRecords = live
      .filter(r => isAllTypes || (r.donationType && r.donationType.toLowerCase().includes(donationType.toLowerCase())))
      .map(r => ({
        _id: (r._id || '').toString(),
        receiptNo: r.receiptNo,
        name: r.donorName || r.name || 'Anonymous Donor',
        panNumber: r.panNo || '',
        aadhaarNumber: r.aadhaarNo || '',
        donationHead: r.donationHead || 'General',
        donationType: r.donationType || donationType || 'Voluntary Donation',
        address: r.address || '',
        amount: Number(r.amount || 0).toFixed(2),
        reference: r.reference || '',
        donationDate: formatDateDisplay(r.receiptDate),
        trustName: r.trustName || r.trust || 'Arulmigu Sivan Trust',
        trustEmail: r.trustEmail || ''
      }));

    if (fromDate || toDate) {
      const fromD = parseDateForFilter(fromDate);
      const toD = parseDateForFilter(toDate);

      allTypeRecords = allTypeRecords.filter(item => {
        const itemD = parseDateForFilter(item.donationDate);
        if (!itemD || isNaN(itemD.getTime())) return true;
        if (fromD && !isNaN(fromD.getTime()) && itemD < fromD) return false;
        if (toD && !isNaN(toD.getTime()) && itemD > toD) return false;
        return true;
      });
    }

    return res.json({
      success: true,
      donationType: donationType || 'All',
      fromDate,
      toDate,
      totalEntries: allTypeRecords.length,
      data: allTypeRecords
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Detailed Payment Mode Report endpoint
router.get(['/payment-mode-report', '/payment-mode-reports', '/payment-report', '/payment-reports'], async (req, res) => {
  try {
    const { paymentMode = '', fromDate = '', toDate = '' } = req.query;
    const { trustEmail, trustId, trustName } = extractTrustInfo(req);
    const live = await getLiveReceiptsList(trustEmail, trustId, trustName);
    const isAllModes = !paymentMode || paymentMode === '--Select Payment Mode--' || paymentMode.toLowerCase() === 'all' || paymentMode === '';

    let allModeRecords = live
      .filter(r => {
        if (isAllModes) return true;
        const searchMode = paymentMode.toLowerCase().split('/')[0].trim();
        return (r.paymentMode || '').toLowerCase().includes(searchMode);
      })
      .map(r => ({
        _id: (r._id || '').toString(),
        receiptNo: r.receiptNo,
        name: r.donorName || r.name || 'Anonymous Donor',
        panNumber: r.panNo || '',
        aadhaarNumber: r.aadhaarNo || '',
        donationHead: r.donationHead || 'General',
        donationType: r.donationType || 'Voluntary Donation',
        address: r.address || '',
        paymentMode: r.paymentMode || (paymentMode || 'Wallet/UPI'),
        amount: Number(r.amount || 0).toFixed(2),
        reference: r.reference || '',
        donationDate: formatDateDisplay(r.receiptDate),
        trustName: r.trustName || r.trust || 'Arulmigu Sivan Trust',
        trustEmail: r.trustEmail || ''
      }));

    if (fromDate || toDate) {
      const fromD = parseDateForFilter(fromDate);
      const toD = parseDateForFilter(toDate);

      allModeRecords = allModeRecords.filter(item => {
        const itemD = parseDateForFilter(item.donationDate);
        if (!itemD || isNaN(itemD.getTime())) return true;
        if (fromD && !isNaN(fromD.getTime()) && itemD < fromD) return false;
        if (toD && !isNaN(toD.getTime()) && itemD > toD) return false;
        return true;
      });
    }

    return res.json({
      success: true,
      paymentMode: paymentMode || 'Wallet/UPI',
      fromDate,
      toDate,
      totalEntries: allModeRecords.length,
      data: allModeRecords
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Super Admin Comprehensive Analytics & Reports
router.get('/superadmin', async (req, res) => {
  try {
    const { fromDate, toDate, reportCategory = 'overview' } = req.query;

    // 1. Fetch all registered trust admins
    let allUsers = [];
    if (getIsConnected()) {
      try {
        const User = require('../models/User');
        allUsers = await User.find({
          $and: [
            { role: { $not: /super/i } },
            { isSuperAdmin: { $ne: true } }
          ]
        }).select('name trustName email mobile phone plan status joinedDate createdAt role isSuperAdmin').lean();
      } catch (e) {
        console.warn('DB read error for users in reportRoutes:', e.message);
      }
    }

    if (!allUsers || allUsers.length === 0) {
      try {
        const { getCollection } = require('../services/storageService');
        allUsers = getCollection('users', []).filter(u => !u.isSuperAdmin && (!u.role || !u.role.toLowerCase().includes('super')));
      } catch (e) {
        console.warn('Fallback users read error:', e.message);
      }
    }

    // 2. Fetch staff members to calculate staff licenses
    let allStaff = [];
    if (getIsConnected()) {
      try {
        const Staff = require('../models/Staff');
        allStaff = await Staff.find({}).select('name email role status trustEmail trustId trustName').lean();
      } catch (e) {}
    }
    if (!allStaff || allStaff.length === 0) {
      try {
        const { getCollection } = require('../services/storageService');
        allStaff = getCollection('staff', []);
      } catch (e) {}
    }

    // Fetch active plans from DB / storage for dynamic pricing & limits
    let dbPlans = [];
    if (getIsConnected()) {
      try {
        const Plan = require('../models/Plan');
        dbPlans = await Plan.find({}).lean();
      } catch (e) {}
    }
    if (!dbPlans || dbPlans.length === 0) {
      try {
        const { getCollection } = require('../services/storageService');
        dbPlans = getCollection('plans', []);
      } catch (e) {}
    }

    // Plan pricing and staff limits map
    const planConfigMap = {
      'basic': { name: 'Basic', price: 1200, staffLimit: 1, badge: 'Basic' },
      'starter': { name: 'Basic', price: 1200, staffLimit: 1, badge: 'Basic' },
      'standard': { name: 'Standard', price: 2500, staffLimit: 2, badge: 'Standard' },
      'advanced': { name: 'Standard', price: 2500, staffLimit: 2, badge: 'Standard' },
      'enterprise': { name: 'Standard', price: 2500, staffLimit: 2, badge: 'Standard' }
    };

    (dbPlans || []).forEach(p => {
      if (!p || !p.name) return;
      const key = (p.code || p.name).toLowerCase().trim();
      const staffLimitNum = (p.staffUserLimit && typeof p.staffUserLimit === 'string')
        ? (p.staffUserLimit.toLowerCase().includes('unlimited') ? 999 : parseInt(p.staffUserLimit.replace(/\D/g, ''), 10) || 2)
        : (Number(p.staffUserLimit) || 2);
      planConfigMap[key] = {
        name: p.name,
        price: Number(p.price) || 2500,
        staffLimit: staffLimitNum,
        badge: p.badge || p.name
      };
      planConfigMap[p.name.toLowerCase().trim()] = planConfigMap[key];
    });

    // Deduplicate registered admins by email
    const existingEmails = new Set();
    const realAdmins = [];

    (allUsers || []).forEach(u => {
      const email = (u.email || '').toLowerCase().trim();
      if (!email || existingEmails.has(email)) return;
      if (isSuperAdminEmail(email)) return;
      existingEmails.add(email);
      realAdmins.push(u);
    });

    // Compute admin subscription revenue records strictly from real registered trusts
    const adminRevenueList = realAdmins.map((u, idx) => {
      const uEmail = (u.email || '').toLowerCase().trim();
      const uId = (u._id || u.id || '').toString();
      const uName = (u.trustName || u.name || '').toLowerCase().trim();

      // Count staff matching this trust
      let trustStaffCount = (u.staffCount !== undefined) ? Number(u.staffCount) : 0;
      if (allStaff && allStaff.length > 0) {
        const matchedStaff = allStaff.filter(s => {
          if (!s) return false;
          const sEmail = (s.trustEmail || s.email || '').toLowerCase().trim();
          const sCreated = (s.createdBy || '').toLowerCase().trim();
          const sTrust = (s.trustName || '').toLowerCase().trim();
          const sId = (s.trustId || '').toString();
          return (uEmail && (sEmail === uEmail || sCreated === uEmail)) || (uId && sId === uId) || (uName && sTrust === uName);
        }).length;
        if (matchedStaff > trustStaffCount) {
          trustStaffCount = matchedStaff;
        }
      }

      const planKey = (u.plan || 'Standard').toLowerCase().trim();
      const planCfg = planConfigMap[planKey] || { name: u.plan || 'Standard', price: 2500, staffLimit: 2, badge: 'Standard' };

      const basePlanPrice = Number(planCfg.price) || 2500;
      const includedStaff = planCfg.staffLimit;
      const purchasedExtra = Number(u.extraStaffUsers || u.purchasedStaffUsers || 0);
      const calculatedExtra = (includedStaff === 999) ? 0 : Math.max(0, trustStaffCount - includedStaff);
      const extraStaff = Math.max(purchasedExtra, calculatedExtra);

      // Cost per additional staff user is ₹861.23 (Pro-rata ₹800/365*333 + 18% GST = ₹861.23)
      const EXTRA_STAFF_UNIT_COST = 861.23;
      const extraStaffRevenue = Number((extraStaff * EXTRA_STAFF_UNIT_COST).toFixed(2));
      const totalRevenue = Number((basePlanPrice + extraStaffRevenue).toFixed(2));

      const joinedDateStr = u.joinedDate || (u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB') : '15/01/2026');
      const validTillStr = u.validTill || '31/03/2027';

      return {
        _id: uId || `adm_${idx + 1}`,
        trustName: u.trustName || u.name || 'Trust Organization',
        contactPerson: u.contactPerson || u.name || 'Admin',
        email: u.email || '',
        mobile: u.mobile || u.phone || '9876543210',
        plan: planCfg.name,
        planBadge: planCfg.badge,
        billingCycle: 'Annual',
        planPrice: basePlanPrice,
        staffCount: trustStaffCount,
        includedStaff: includedStaff === 999 ? 'Unlimited' : includedStaff,
        extraStaff: extraStaff,
        extraStaffRevenue: extraStaffRevenue,
        totalRevenue: totalRevenue,
        paymentGateway: u.paymentGateway || 'Razorpay (Online)',
        paymentId: u.paymentId || `pay_rzp_${(uId || (idx + 100)).slice(-6)}`,
        paymentStatus: 'Success',
        status: u.status || 'Active',
        joinedDate: joinedDateStr,
        validTill: validTillStr,
        isTrial: Boolean(u.trialEndsAt && new Date(u.trialEndsAt) > new Date())
      };
    });

    // Compute dynamic aggregate subscription totals from real registered trusts
    const grandTotalRevenue = Number(adminRevenueList.reduce((sum, a) => sum + Number(a.totalRevenue || 0), 0).toFixed(2));
    const totalAdminsCount = adminRevenueList.length;
    const activeSubscriptionsCount = adminRevenueList.filter(a => (a.status || '').toLowerCase() === 'active').length;

    // Dynamic Plan Breakdown from real trusts
    const planGroups = {};
    adminRevenueList.forEach(a => {
      const p = a.plan;
      if (!planGroups[p]) {
        planGroups[p] = { count: 0, revenue: 0 };
      }
      planGroups[p].count += 1;
      planGroups[p].revenue += a.totalRevenue;
    });

    const dynamicPlanBreakdown = Object.keys(planGroups).map(p => ({
      plan: `${p} Plan (₹${(planConfigMap[p.toLowerCase()]?.price || 2500).toLocaleString('en-IN')})`,
      count: planGroups[p].count,
      revenue: planGroups[p].revenue,
      percentage: grandTotalRevenue > 0 ? Number(((planGroups[p].revenue / grandTotalRevenue) * 100).toFixed(1)) : 0
    }));

    // Dynamic Monthly Revenue from real trusts
    const monthlyGroups = {};
    adminRevenueList.forEach(a => {
      let monthLabel = 'Sep 2026';
      if (a.joinedDate && a.joinedDate.includes('/')) {
        const parts = a.joinedDate.split('/');
        if (parts.length === 3) {
          const d = new Date(parts[2], parts[1] - 1, parts[0]);
          if (!isNaN(d.getTime())) {
            monthLabel = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
          }
        }
      }
      if (!monthlyGroups[monthLabel]) {
        monthlyGroups[monthLabel] = { month: monthLabel, amount: 0, subscriptions: 0 };
      }
      monthlyGroups[monthLabel].amount += a.totalRevenue;
      monthlyGroups[monthLabel].subscriptions += 1;
    });

    const dynamicMonthlyRevenue = Object.values(monthlyGroups);

    const subscriptionRevenue = {
      totalRevenue: grandTotalRevenue,
      totalAdmins: totalAdminsCount,
      activeSubscriptions: activeSubscriptionsCount,
      averageRevenuePerTrust: totalAdminsCount > 0 ? Math.round(grandTotalRevenue / totalAdminsCount) : 0,
      monthlyRevenue: dynamicMonthlyRevenue.length > 0 ? dynamicMonthlyRevenue : [
        { month: 'Sep 2026', amount: grandTotalRevenue, subscriptions: totalAdminsCount }
      ],
      planBreakdown: dynamicPlanBreakdown,
      adminRevenueList: adminRevenueList
    };

    // 3. Compute 100% dynamic receiptsAnalytics from actual live receipts
    const live = await getLiveReceiptsList();
    const realTotalReceipts = live.length;
    const realTotalVolume = live.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const realAvgValue = realTotalReceipts > 0 ? Number((realTotalVolume / realTotalReceipts).toFixed(2)) : 0;

    // Real Donation Head Breakdown
    const realHeadMap = new Map();
    live.forEach(r => {
      const head = (r.donationHead || r.head || 'General').trim();
      const amt = Number(r.amount) || 0;
      if (!realHeadMap.has(head)) {
        realHeadMap.set(head, { head, count: 0, amount: 0 });
      }
      const item = realHeadMap.get(head);
      item.count += 1;
      item.amount += amt;
    });

    let realHeadBreakdown = Array.from(realHeadMap.values())
      .sort((a, b) => b.amount - a.amount || b.count - a.count);

    if (realHeadBreakdown.length === 0) {
      realHeadBreakdown = [
        { head: 'General', count: 0, amount: 0 }
      ];
    }

    // Real Payment Mode Breakdown
    const realPaymentMap = new Map();
    live.forEach(r => {
      const rawMode = (r.paymentMode || r.mode || r.paymentDetails || 'Online / UPI').trim();
      let modeKey = 'Online / UPI';
      const mLower = rawMode.toLowerCase();
      if (mLower.includes('upi') || mLower.includes('online') || mLower.includes('gpay') || mLower.includes('phonepe') || mLower.includes('razorpay')) {
        modeKey = 'Online / UPI';
      } else if (mLower.includes('bank') || mLower.includes('neft') || mLower.includes('rtgs') || mLower.includes('imps') || mLower.includes('transfer')) {
        modeKey = 'Bank Transfer / NEFT';
      } else if (mLower.includes('cheque') || mLower.includes('check') || mLower.includes('draft') || mLower.includes('dd')) {
        modeKey = 'Cheque';
      } else if (mLower.includes('cash')) {
        modeKey = 'Cash';
      } else if (mLower.includes('card')) {
        modeKey = 'Debit / Credit Card';
      } else {
        modeKey = rawMode;
      }

      const amt = Number(r.amount) || 0;
      if (!realPaymentMap.has(modeKey)) {
        realPaymentMap.set(modeKey, { mode: modeKey, count: 0, amount: 0 });
      }
      const item = realPaymentMap.get(modeKey);
      item.count += 1;
      item.amount += amt;
    });

    let realPaymentModeBreakdown = Array.from(realPaymentMap.values())
      .map(pm => ({
        ...pm,
        percentage: realTotalVolume > 0 ? Number(((pm.amount / realTotalVolume) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    if (realPaymentModeBreakdown.length === 0) {
      realPaymentModeBreakdown = [
        { mode: 'Online / UPI', count: 0, amount: 0, percentage: 0 }
      ];
    }

    const receiptsAnalytics = {
      totalReceiptsIssued: realTotalReceipts,
      totalDonationVolume: realTotalVolume,
      avgReceiptValue: realAvgValue,
      headBreakdown: realHeadBreakdown,
      paymentModeBreakdown: realPaymentModeBreakdown
    };

    // 4. Compute 100% dynamic usersGrowth from actual registered trusts
    const monthlyTrustMap = new Map();
    realAdmins.forEach(u => {
      let monthLabel = '';
      if (u.createdAt) {
        const d = new Date(u.createdAt);
        if (!isNaN(d.getTime())) {
          monthLabel = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        }
      }
      if (!monthLabel && u.joinedDate) {
        const parts = u.joinedDate.split('/');
        if (parts.length === 3) {
          const d = new Date(parts[2], parts[1] - 1, parts[0]);
          if (!isNaN(d.getTime())) {
            monthLabel = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
          }
        }
      }
      if (!monthLabel) {
        monthLabel = new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' });
      }

      monthlyTrustMap.set(monthLabel, (monthlyTrustMap.get(monthLabel) || 0) + 1);
    });

    let realMonthlyRegistrations = Array.from(monthlyTrustMap.entries()).map(([month, count]) => ({
      month,
      count
    }));

    if (realMonthlyRegistrations.length === 0) {
      const currentMonthLabel = new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' });
      realMonthlyRegistrations.push({ month: currentMonthLabel, count: totalAdminsCount });
    }

    const usersGrowth = {
      totalTrusts: totalAdminsCount,
      activeTrusts: activeSubscriptionsCount,
      trialTrusts: adminRevenueList.filter(a => a.isTrial || (a.status || '').toLowerCase() === 'pending').length,
      monthlyRegistrations: realMonthlyRegistrations
    };

    return res.json({
      success: true,
      reportCategory,
      fromDate,
      toDate,
      data: {
        subscriptionRevenue,
        receiptsAnalytics,
        usersGrowth
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// Delegate /types route to reportTypeRoutes logic
const reportTypeRouter = require('./reportTypeRoutes');
router.use('/types', reportTypeRouter);

module.exports = router;
