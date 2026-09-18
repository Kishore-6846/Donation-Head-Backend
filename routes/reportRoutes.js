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
      mongoList = await DonationReceipt.find(query).sort({ createdAt: -1 }).lean();
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
    const { financialYear = '2026-2027', reportType = 'Full Report' } = req.query;
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
      amount: Number(r.amount || 0).toFixed(2)
    }));

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
        totalDonationsCount: c.count
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
    const { financialYear = '2026-2027', fromDate = '', toDate = '' } = req.query;
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
      createdBy: r.createdBy || 'Admin'
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
    const { donationHead = 'General', fromDate = '', toDate = '' } = req.query;
    const { trustEmail, trustId, trustName } = extractTrustInfo(req);
    const live = await getLiveReceiptsList(trustEmail, trustId, trustName);
    const isAllHeads = !donationHead || donationHead === '--Select Donation Head--' || donationHead === 'All' || donationHead === 'General';

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
        donationDate: formatDateDisplay(r.receiptDate)
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
      donationHead: donationHead || 'General',
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
          lastDonationDate: formatDateDisplay(r.receiptDate)
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
    const { donationType = 'Voluntary Donation', fromDate = '', toDate = '' } = req.query;
    const { trustEmail, trustId, trustName } = extractTrustInfo(req);
    const live = await getLiveReceiptsList(trustEmail, trustId, trustName);
    const isAllTypes = !donationType || donationType === '--Select Donation Type--' || donationType === 'All' || donationType === 'Voluntary Donation';

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
        donationDate: formatDateDisplay(r.receiptDate)
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
      donationType: donationType || 'Voluntary Donation',
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
    const { paymentMode = 'Wallet/UPI', fromDate = '', toDate = '' } = req.query;
    const { trustEmail, trustId, trustName } = extractTrustInfo(req);
    const live = await getLiveReceiptsList(trustEmail, trustId, trustName);
    const isAllModes = !paymentMode || paymentMode === '--Select Payment Mode--' || paymentMode === 'All' || paymentMode === 'Wallet/UPI';

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
        donationDate: formatDateDisplay(r.receiptDate)
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

    const subscriptionRevenue = {
      totalRevenue: 228000,
      monthlyRevenue: [
        { month: 'Oct 2025', amount: 24000, subscriptions: 4 },
        { month: 'Nov 2025', amount: 31000, subscriptions: 5 },
        { month: 'Dec 2025', amount: 38000, subscriptions: 6 },
        { month: 'Jan 2026', amount: 45000, subscriptions: 7 },
        { month: 'Feb 2026', amount: 42000, subscriptions: 6 },
        { month: 'Mar 2026', amount: 48000, subscriptions: 8 }
      ],
      planBreakdown: [
        { plan: 'Standard Plan (₹4,000)', count: 18, revenue: 72000, percentage: 31.6 },
        { plan: 'Advanced Plan (₹7,000)', count: 14, revenue: 98000, percentage: 43.0 },
        { plan: 'Enterprise Plan (₹10,000)', count: 5, revenue: 50000, percentage: 21.9 },
        { plan: 'Starter Plan (₹1,999)', count: 4, revenue: 7996, percentage: 3.5 }
      ]
    };

    const receiptsAnalytics = {
      totalReceiptsIssued: 2145,
      totalDonationVolume: 8450000,
      avgReceiptValue: 3939.39,
      headBreakdown: [
        { head: 'General', count: 1240, amount: 4950000 },
        { head: 'Anna Chathiram', count: 420, amount: 1680000 },
        { head: 'Food Drive', count: 265, amount: 890000 },
        { head: 'Kind / Support', count: 135, amount: 540000 },
        { head: 'Fengal Cyclone Relief', count: 85, amount: 390000 }
      ],
      paymentModeBreakdown: [
        { mode: 'Online / UPI', count: 1480, amount: 5620000, percentage: 66.5 },
        { mode: 'Bank Transfer / NEFT', count: 390, amount: 1980000, percentage: 23.4 },
        { mode: 'Cheque', count: 185, amount: 650000, percentage: 7.7 },
        { mode: 'Cash', count: 90, amount: 200000, percentage: 2.4 }
      ]
    };

    // Incorporate live receipts into Super Admin analytics
    const live = await getLiveReceiptsList();
    const liveVolume = live.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    receiptsAnalytics.totalReceiptsIssued += live.length;
    receiptsAnalytics.totalDonationVolume += liveVolume;
    if (receiptsAnalytics.totalReceiptsIssued > 0) {
      receiptsAnalytics.avgReceiptValue = Number(
        (receiptsAnalytics.totalDonationVolume / receiptsAnalytics.totalReceiptsIssued).toFixed(2)
      );
    }

    const usersGrowth = {
      totalTrusts: 41,
      activeTrusts: 38,
      trialTrusts: 3,
      monthlyRegistrations: [
        { month: 'Oct 2025', count: 5 },
        { month: 'Nov 2025', count: 6 },
        { month: 'Dec 2025', count: 7 },
        { month: 'Jan 2026', count: 8 },
        { month: 'Feb 2026', count: 6 },
        { month: 'Mar 2026', count: 9 }
      ]
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
// Custom & Published Reports with Details
// ==========================================
const storageService = require('../services/storageService');

// GET all reports with details
router.get('/records', (req, res) => {
  try {
    let reports = storageService.getCollection('reports', []);
    const { trust, type, financialYear, status, search } = req.query;

    if (trust && trust !== 'all') {
      reports = reports.filter(r => 
        !r.targetTrust || 
        r.targetTrust === 'All Trusts' || 
        r.targetTrust.toLowerCase().includes(trust.toLowerCase())
      );
    }
    if (type) {
      reports = reports.filter(r => r.reportTypeId === type || r.reportTypeName === type);
    }
    if (financialYear) {
      reports = reports.filter(r => r.financialYear === financialYear);
    }
    if (status) {
      reports = reports.filter(r => r.status && r.status.toLowerCase() === status.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      reports = reports.filter(r =>
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.reportTypeName && r.reportTypeName.toLowerCase().includes(q)) ||
        (r.executiveSummary && r.executiveSummary.toLowerCase().includes(q)) ||
        (r.targetTrust && r.targetTrust.toLowerCase().includes(q))
      );
    }

    return res.json({ success: true, count: reports.length, data: reports });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET single report by ID
router.get('/records/:id', (req, res) => {
  try {
    const reports = storageService.getCollection('reports', []);
    const report = reports.find(r => r._id === req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report record not found' });
    }
    return res.json({ success: true, data: report });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// CREATE report with details
router.post('/records', (req, res) => {
  try {
    const {
      title,
      reportTypeId,
      reportTypeName,
      targetTrust,
      financialYear,
      fromDate,
      toDate,
      totalVolume,
      totalRecords,
      executiveSummary,
      keyFindings,
      remarks,
      status,
      publishedToAdmin
    } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Report title is required' });
    }

    const reports = storageService.getCollection('reports', []);
    const newReport = {
      _id: 'rep_' + Date.now(),
      title: title.trim(),
      reportTypeId: reportTypeId || 'rt_custom',
      reportTypeName: reportTypeName || 'Custom Audit Report',
      targetTrust: targetTrust || 'All Trusts',
      financialYear: financialYear || '2026-2027',
      fromDate: fromDate || '',
      toDate: toDate || '',
      totalVolume: totalVolume !== undefined ? Number(totalVolume) : 0,
      totalRecords: totalRecords !== undefined ? Number(totalRecords) : 0,
      executiveSummary: executiveSummary || '',
      keyFindings: Array.isArray(keyFindings) 
        ? keyFindings 
        : (keyFindings ? keyFindings.split('\n').map(s => s.trim()).filter(Boolean) : []),
      remarks: remarks || '',
      status: status || 'Published',
      publishedToAdmin: publishedToAdmin !== undefined ? Boolean(publishedToAdmin) : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    reports.unshift(newReport);
    storageService.saveCollection('reports', reports);

    return res.status(201).json({ success: true, message: 'Report generated and published successfully', data: newReport });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// UPDATE report with details
router.put('/records/:id', (req, res) => {
  try {
    const reports = storageService.getCollection('reports', []);
    const index = reports.findIndex(r => r._id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Report record not found' });
    }

    const {
      title,
      reportTypeId,
      reportTypeName,
      targetTrust,
      financialYear,
      fromDate,
      toDate,
      totalVolume,
      totalRecords,
      executiveSummary,
      keyFindings,
      remarks,
      status,
      publishedToAdmin
    } = req.body;

    reports[index] = {
      ...reports[index],
      title: title !== undefined ? title.trim() : reports[index].title,
      reportTypeId: reportTypeId !== undefined ? reportTypeId : reports[index].reportTypeId,
      reportTypeName: reportTypeName !== undefined ? reportTypeName : reports[index].reportTypeName,
      targetTrust: targetTrust !== undefined ? targetTrust : reports[index].targetTrust,
      financialYear: financialYear !== undefined ? financialYear : reports[index].financialYear,
      fromDate: fromDate !== undefined ? fromDate : reports[index].fromDate,
      toDate: toDate !== undefined ? toDate : reports[index].toDate,
      totalVolume: totalVolume !== undefined ? Number(totalVolume) : reports[index].totalVolume,
      totalRecords: totalRecords !== undefined ? Number(totalRecords) : reports[index].totalRecords,
      executiveSummary: executiveSummary !== undefined ? executiveSummary : reports[index].executiveSummary,
      keyFindings: keyFindings !== undefined 
        ? (Array.isArray(keyFindings) ? keyFindings : keyFindings.split('\n').map(s => s.trim()).filter(Boolean))
        : reports[index].keyFindings,
      remarks: remarks !== undefined ? remarks : reports[index].remarks,
      status: status !== undefined ? status : reports[index].status,
      publishedToAdmin: publishedToAdmin !== undefined ? Boolean(publishedToAdmin) : reports[index].publishedToAdmin,
      updatedAt: new Date().toISOString()
    };

    storageService.saveCollection('reports', reports);
    return res.json({ success: true, message: 'Report updated successfully', data: reports[index] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE report
router.delete('/records/:id', (req, res) => {
  try {
    let reports = storageService.getCollection('reports', []);
    const existing = reports.find(r => r._id === req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Report record not found' });
    }

    reports = reports.filter(r => r._id !== req.params.id);
    storageService.saveCollection('reports', reports);

    return res.json({ success: true, message: 'Report deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Delegate /types route to reportTypeRoutes logic
const reportTypeRouter = require('./reportTypeRoutes');
router.use('/types', reportTypeRouter);

module.exports = router;
