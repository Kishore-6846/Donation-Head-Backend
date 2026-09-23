const express = require('express');
const router = express.Router();
const storageService = require('../services/storageService');

// Master Seed of Standard System Reports
const initialDynamicReports = [
  {
    _id: 'std_receipts_master',
    isStandard: true,
    title: 'Receipt Reports',
    code: 'REP-RCPT-MASTER',
    category: 'Financial Audit',
    reportBase: 'receipts',
    reportBaseLabel: 'Receipt Reports',
    targetTrust: 'All Trusts',
    financialYear: '2026-2027',
    fromDate: '2026-04-01',
    toDate: '2026-09-30',
    description: 'Master audit register of all individual donation receipts with serial nos, PAN, payment mode and 80G tax status.',
    status: 'Published',
    filters: {
      donationHead: 'All Heads',
      donationType: 'All Types',
      paymentMode: 'All Modes',
      section80G: 'all',
      minAmount: ''
    },
    selectedFieldKeys: ['receiptNo', 'receiptDate', 'donorName', 'panNumber', 'donationHead', 'amount', 'paymentMode', 'section80G'],
    columns: [
      { key: 'receiptNo', label: 'Receipt No.', type: 'text' },
      { key: 'receiptDate', label: 'Receipt Date', type: 'date' },
      { key: 'donorName', label: 'Donor / Devotee Name', type: 'text' },
      { key: 'panNumber', label: 'PAN Card Number', type: 'text' },
      { key: 'donationHead', label: 'Donation Head / Seva', type: 'text' },
      { key: 'amount', label: 'Amount (₹)', type: 'number' },
      { key: 'paymentMode', label: 'Payment Mode', type: 'text' },
      { key: 'section80G', label: '80G Tax Exemption Status', type: 'text' }
    ],
    dataRows: [],
    totalRecords: 2145,
    totalVolume: 8450000,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString()
  },
  {
    _id: 'std_10bd_statutory',
    isStandard: true,
    title: 'Form No. 10BD',
    code: 'REP-10BD-STATUTORY',
    category: 'Statutory Compliance',
    reportBase: '10bd',
    reportBaseLabel: 'Form No. 10BD',
    targetTrust: 'All Trusts',
    financialYear: '2026-2027',
    fromDate: '2026-04-01',
    toDate: '2026-09-30',
    description: 'Official Income Tax Form 10BD statement for aggregate donor filings under Section 80G(5)(vi).',
    status: 'Published',
    filters: {
      donationHead: 'All Heads',
      donationType: 'All Types',
      paymentMode: 'All Modes',
      section80G: 'all',
      minAmount: ''
    },
    selectedFieldKeys: ['receiptNo', 'receiptDate', 'donorName', 'panNumber', 'address', 'donationType', 'amount', 'paymentMode'],
    columns: [
      { key: 'receiptNo', label: 'Pre-Ack / Receipt No.', type: 'text' },
      { key: 'receiptDate', label: 'Issuance Date', type: 'date' },
      { key: 'donorName', label: 'Donor / Devotee Name', type: 'text' },
      { key: 'panNumber', label: 'Unique ID (PAN/Aadhaar)', type: 'text' },
      { key: 'address', label: 'Donor Address', type: 'text' },
      { key: 'donationType', label: 'Donation Type', type: 'text' },
      { key: 'amount', label: 'Amount (₹)', type: 'number' },
      { key: 'paymentMode', label: 'Mode of Receipt', type: 'text' }
    ],
    dataRows: [],
    totalRecords: 2145,
    totalVolume: 8450000,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString()
  },
  {
    _id: 'std_head_collection',
    isStandard: true,
    title: 'Head-Wise Reports',
    code: 'REP-HEAD-COLLECTION',
    category: 'Temple Endowment',
    reportBase: 'donation-head',
    reportBaseLabel: 'Head-Wise Reports',
    targetTrust: 'All Trusts',
    financialYear: '2026-2027',
    fromDate: '2026-04-01',
    toDate: '2026-09-30',
    description: 'Head-wise allocation breakdown across Annadanam, General Corpus, Pooja Services, and Temple Renovations.',
    status: 'Published',
    filters: {
      donationHead: 'All Heads',
      donationType: 'All Types',
      paymentMode: 'All Modes',
      section80G: 'all',
      minAmount: ''
    },
    selectedFieldKeys: ['receiptNo', 'receiptDate', 'donorName', 'donationHead', 'amount', 'paymentMode'],
    columns: [
      { key: 'receiptNo', label: 'Receipt No.', type: 'text' },
      { key: 'receiptDate', label: 'Receipt Date', type: 'date' },
      { key: 'donorName', label: 'Donor Name', type: 'text' },
      { key: 'donationHead', label: 'Donation Head / Seva', type: 'text' },
      { key: 'amount', label: 'Amount (₹)', type: 'number' },
      { key: 'paymentMode', label: 'Payment Mode', type: 'text' }
    ],
    dataRows: [],
    totalRecords: 5,
    totalVolume: 8450000,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString()
  },
  {
    _id: 'std_donor_directory',
    isStandard: true,
    title: 'Donor Reports',
    code: 'REP-DONOR-DIRECTORY',
    category: 'Donor Analytics',
    reportBase: 'donor',
    reportBaseLabel: 'Donor Reports',
    targetTrust: 'All Trusts',
    financialYear: '2026-2027',
    fromDate: '2026-04-01',
    toDate: '2026-09-30',
    description: 'Comprehensive donor database with lifetime donation totals, recurrence metrics, and contact registries.',
    status: 'Published',
    filters: {
      donationHead: 'All Heads',
      donationType: 'All Types',
      paymentMode: 'All Modes',
      section80G: 'all',
      minAmount: ''
    },
    selectedFieldKeys: ['donorName', 'phone', 'email', 'panNumber', 'address', 'amount'],
    columns: [
      { key: 'donorName', label: 'Donor / Devotee Name', type: 'text' },
      { key: 'phone', label: 'Phone Number', type: 'text' },
      { key: 'email', label: 'Email Address', type: 'text' },
      { key: 'panNumber', label: 'PAN Card Number', type: 'text' },
      { key: 'address', label: 'Donor Address', type: 'text' },
      { key: 'amount', label: 'Total Contribution (₹)', type: 'number' }
    ],
    dataRows: [],
    totalRecords: 2145,
    totalVolume: 8450000,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString()
  },
  {
    _id: 'std_donation_type',
    isStandard: true,
    title: 'Donation Type Report',
    code: 'REP-TYPE-MATRIX',
    category: 'Financial Audit',
    reportBase: 'donation-type',
    reportBaseLabel: 'Donation Type Report',
    targetTrust: 'All Trusts',
    financialYear: '2026-2027',
    fromDate: '2026-04-01',
    toDate: '2026-09-30',
    description: 'Cross-tabulated breakdown between Corpus Fund, General Donations, and Specified Purpose contributions.',
    status: 'Published',
    filters: {
      donationHead: 'All Heads',
      donationType: 'All Types',
      paymentMode: 'All Modes',
      section80G: 'all',
      minAmount: ''
    },
    selectedFieldKeys: ['receiptNo', 'receiptDate', 'donorName', 'donationType', 'amount', 'paymentMode'],
    columns: [
      { key: 'receiptNo', label: 'Receipt No.', type: 'text' },
      { key: 'receiptDate', label: 'Receipt Date', type: 'date' },
      { key: 'donorName', label: 'Donor / Devotee Name', type: 'text' },
      { key: 'donationType', label: 'Donation Type', type: 'text' },
      { key: 'amount', label: 'Amount (₹)', type: 'number' },
      { key: 'paymentMode', label: 'Payment Mode', type: 'text' }
    ],
    dataRows: [],
    totalRecords: 2145,
    totalVolume: 8450000,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString()
  },
  {
    _id: 'std_payment_mode',
    isStandard: true,
    title: 'Payment Mode Report',
    code: 'REP-PAYMENT-RECON',
    category: 'Financial Audit',
    reportBase: 'payment-mode',
    reportBaseLabel: 'Payment Mode Report',
    targetTrust: 'All Trusts',
    financialYear: '2026-2027',
    fromDate: '2026-04-01',
    toDate: '2026-09-30',
    description: 'Bank settlement and channel audit for UPI, NEFT/RTGS, Net Banking, Cheque, and Cash collections.',
    status: 'Published',
    filters: {
      donationHead: 'All Heads',
      donationType: 'All Types',
      paymentMode: 'All Modes',
      section80G: 'all',
      minAmount: ''
    },
    selectedFieldKeys: ['receiptNo', 'receiptDate', 'donorName', 'paymentMode', 'paymentDetails', 'amount'],
    columns: [
      { key: 'receiptNo', label: 'Receipt No.', type: 'text' },
      { key: 'receiptDate', label: 'Receipt Date', type: 'date' },
      { key: 'donorName', label: 'Donor / Devotee Name', type: 'text' },
      { key: 'paymentMode', label: 'Payment Mode', type: 'text' },
      { key: 'paymentDetails', label: 'Payment Details / Ref', type: 'text' },
      { key: 'amount', label: 'Amount (₹)', type: 'number' }
    ],
    dataRows: [],
    totalRecords: 4,
    totalVolume: 8450000,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString()
  },
  {
    _id: 'std_exec_intelligence',
    isStandard: true,
    title: 'Platform Reports & Executive Intelligence',
    code: 'REP-EXEC-INTELLIGENCE',
    category: 'Executive Intelligence',
    reportBase: 'custom',
    reportBaseLabel: 'Platform Executive Intelligence',
    targetTrust: 'Platform Wide',
    financialYear: '2026-2027',
    fromDate: '2026-04-01',
    toDate: '2026-09-30',
    description: 'Consolidated platform-wide intelligence on trust subscription revenues, overall receipts issued, and growth trends.',
    status: 'Published',
    filters: {
      donationHead: 'All Heads',
      donationType: 'All Types',
      paymentMode: 'All Modes',
      section80G: 'all',
      minAmount: ''
    },
    selectedFieldKeys: ['receiptNo', 'receiptDate', 'donorName', 'amount'],
    columns: [
      { key: 'receiptNo', label: 'Metric / Identifier', type: 'text' },
      { key: 'receiptDate', label: 'Period / Date', type: 'date' },
      { key: 'donorName', label: 'Scope / Category', type: 'text' },
      { key: 'amount', label: 'Volume / Value (₹)', type: 'number' }
    ],
    dataRows: [],
    totalRecords: 1,
    totalVolume: 8450000,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString()
  }
];

const DynamicReport = require('../models/DynamicReport');
const { getIsConnected } = require('../config/db');

async function getDynamicReports() {
  if (getIsConnected()) {
    try {
      const dbReports = await DynamicReport.find({}).lean();
      const map = new Map();
      initialDynamicReports.forEach(r => map.set(r._id, r));
      (dbReports || []).forEach(r => map.set(r._id, r));
      return Array.from(map.values());
    } catch (e) {
      console.warn('DB dynamic reports error:', e.message);
    }
  }
  const custom = storageService.getCollection('dynamicReports', []);
  const map = new Map();
  initialDynamicReports.forEach(r => map.set(r._id, r));
  custom.forEach(r => map.set(r._id, r));
  return Array.from(map.values());
}

// GET all dynamic reports
router.get('/', (req, res) => {
  try {
    let reports = getDynamicReports();
    const { trust, status, category, search } = req.query;

    if (trust && trust !== 'all' && trust !== 'All Trusts') {
      // Exclude platform standard reports from trust admin view - trust admins only see their custom reports
      reports = reports.filter(r =>
        !r.isStandard &&
        (!r.targetTrust || r.targetTrust === 'All Trusts' || r.targetTrust.toLowerCase().includes(trust.toLowerCase()))
      );
    }
    if (status) {
      reports = reports.filter(r => r.status && r.status.toLowerCase() === status.toLowerCase());
    }
    if (category) {
      reports = reports.filter(r => r.category && r.category.toLowerCase() === category.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      reports = reports.filter(r =>
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.code && r.code.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.targetTrust && r.targetTrust.toLowerCase().includes(q))
      );
    }

    return res.json({ success: true, count: reports.length, data: reports });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET single dynamic report by ID or code
router.get('/:id', (req, res) => {
  try {
    const reports = getDynamicReports();
    const target = req.params.id;
    const report = reports.find(r => r._id === target || r.code === target || (r.id && r.id === target));
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report template not found' });
    }
    return res.json({ success: true, data: report });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// CREATE new dynamic report template with data rows
router.post('/', async (req, res) => {
  try {
    const {
      title,
      code,
      category,
      reportBase,
      reportBaseLabel,
      filters,
      enabledFilters,
      selectedFieldKeys,
      targetTrust,
      financialYear,
      fromDate,
      toDate,
      description,
      columns,
      dataRows,
      status
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Report title is required' });
    }

    const reports = await getDynamicReports();
    const generatedCode = code || 'REP_' + title.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 16);

    const defaultColumns = [
      { key: 'receiptNo', label: 'Receipt No', type: 'text' },
      { key: 'donorName', label: 'Donor / Devotee Name', type: 'text' },
      { key: 'head', label: 'Donation Head', type: 'text' },
      { key: 'paymentMode', label: 'Payment Mode', type: 'text' },
      { key: 'amount', label: 'Amount (₹)', type: 'number' },
      { key: 'date', label: 'Receipt Date', type: 'date' }
    ];

    const safeRows = Array.isArray(dataRows) ? dataRows.map((r, i) => ({
      rowId: r.rowId || 'row_' + (Date.now() + i),
      ...r
    })) : [];

    const totalVolume = safeRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

    const newReport = {
      _id: 'rep_' + Date.now(),
      title: title.trim(),
      code: generatedCode,
      category: category || 'General Audit',
      reportBase: reportBase || 'receipts',
      reportBaseLabel: reportBaseLabel || 'Receipts & Transactions',
      filters: filters || {},
      enabledFilters: enabledFilters || {},
      selectedFieldKeys: selectedFieldKeys || [],
      targetTrust: targetTrust || 'All Trusts',
      financialYear: financialYear || '2026-2027',
      fromDate: fromDate || '',
      toDate: toDate || '',
      description: description || '',
      columns: Array.isArray(columns) && columns.length > 0 ? columns : defaultColumns,
      dataRows: safeRows,
      totalVolume,
      totalRecords: safeRows.length,
      status: status || 'Published',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (getIsConnected()) {
      try {
        await DynamicReport.create(newReport);
      } catch (e) {
        console.warn('DB error creating dynamic report:', e.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Report template created and published successfully',
      data: newReport
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// UPDATE report template, columns, and data rows
router.put('/:id', async (req, res) => {
  try {
    const target = req.params.id;
    const {
      title,
      code,
      category,
      reportBase,
      reportBaseLabel,
      filters,
      enabledFilters,
      selectedFieldKeys,
      targetTrust,
      financialYear,
      fromDate,
      toDate,
      description,
      columns,
      dataRows,
      status
    } = req.body;

    let safeRows = Array.isArray(dataRows) ? dataRows.map((r, i) => ({
      rowId: r.rowId || 'row_' + (Date.now() + i),
      ...r
    })) : undefined;

    const updates = {
      updatedAt: new Date().toISOString()
    };
    if (title !== undefined) updates.title = title.trim();
    if (code !== undefined) updates.code = code.toUpperCase();
    if (category !== undefined) updates.category = category;
    if (reportBase !== undefined) updates.reportBase = reportBase;
    if (reportBaseLabel !== undefined) updates.reportBaseLabel = reportBaseLabel;
    if (filters !== undefined) updates.filters = filters;
    if (enabledFilters !== undefined) updates.enabledFilters = enabledFilters;
    if (selectedFieldKeys !== undefined) updates.selectedFieldKeys = selectedFieldKeys;
    if (targetTrust !== undefined) updates.targetTrust = targetTrust;
    if (financialYear !== undefined) updates.financialYear = financialYear;
    if (fromDate !== undefined) updates.fromDate = fromDate;
    if (toDate !== undefined) updates.toDate = toDate;
    if (description !== undefined) updates.description = description;
    if (columns !== undefined) updates.columns = columns;
    if (safeRows !== undefined) {
      updates.dataRows = safeRows;
      updates.totalVolume = safeRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
      updates.totalRecords = safeRows.length;
    }
    if (status !== undefined) updates.status = status;

    let updated = null;
    if (getIsConnected()) {
      try {
        updated = await DynamicReport.findOneAndUpdate(
          { $or: [{ _id: target }, { code: target }] },
          { $set: updates },
          { new: true }
        ).lean();
      } catch (e) {}
    }

    const reports = await getDynamicReports();
    const item = reports.find(r => r._id === target || r.code === target);

    return res.json({
      success: true,
      message: 'Report template and data rows updated successfully',
      data: updated || item
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE report template
router.delete('/:id', async (req, res) => {
  try {
    const target = req.params.id;
    if (getIsConnected()) {
      try {
        await DynamicReport.findOneAndDelete({ $or: [{ _id: target }, { code: target }] });
      } catch (e) {}
    }

    return res.json({ success: true, message: 'Report template deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ADD a single data row inside the template
router.post('/:id/rows', async (req, res) => {
  try {
    const reports = await getDynamicReports();
    const index = reports.findIndex(r => r._id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Report template not found' });
    }

    const rowData = req.body;
    const newRow = {
      rowId: 'row_' + Date.now(),
      ...rowData
    };

    reports[index].dataRows.push(newRow);
    reports[index].totalVolume = reports[index].dataRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    reports[index].totalRecords = reports[index].dataRows.length;
    reports[index].updatedAt = new Date().toISOString();

    if (getIsConnected()) {
      try {
        await DynamicReport.findOneAndUpdate(
          { _id: req.params.id },
          { $set: { dataRows: reports[index].dataRows, totalVolume: reports[index].totalVolume, totalRecords: reports[index].totalRecords, updatedAt: reports[index].updatedAt } }
        );
      } catch (e) {}
    }

    saveDynamicReports(reports);

    return res.status(201).json({ success: true, message: 'Data row added', data: newRow, report: reports[index] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ALTER/UPDATE a specific row inside the template
router.put('/:id/rows/:rowId', async (req, res) => {
  try {
    const reports = await getDynamicReports();
    const index = reports.findIndex(r => r._id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Report template not found' });
    }

    const rowIndex = reports[index].dataRows.findIndex(r => r.rowId === req.params.rowId);
    if (rowIndex === -1) {
      return res.status(404).json({ success: false, message: 'Data row not found' });
    }

    reports[index].dataRows[rowIndex] = {
      ...reports[index].dataRows[rowIndex],
      ...req.body,
      rowId: req.params.rowId
    };

    reports[index].totalVolume = reports[index].dataRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    reports[index].updatedAt = new Date().toISOString();

    if (getIsConnected()) {
      try {
        await DynamicReport.findOneAndUpdate(
          { _id: req.params.id },
          { $set: { dataRows: reports[index].dataRows, totalVolume: reports[index].totalVolume, totalRecords: reports[index].totalRecords, updatedAt: reports[index].updatedAt } }
        );
      } catch (e) {}
    }

    saveDynamicReports(reports);

    return res.json({ success: true, message: 'Data row updated', data: reports[index].dataRows[rowIndex], report: reports[index] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE a specific row from the template
router.delete('/:id/rows/:rowId', async (req, res) => {
  try {
    const reports = await getDynamicReports();
    const index = reports.findIndex(r => r._id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Report template not found' });
    }

    reports[index].dataRows = reports[index].dataRows.filter(r => r.rowId !== req.params.rowId);
    reports[index].totalVolume = reports[index].dataRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    reports[index].totalRecords = reports[index].dataRows.length;
    reports[index].updatedAt = new Date().toISOString();

    if (getIsConnected()) {
      try {
        await DynamicReport.findOneAndUpdate(
          { _id: req.params.id },
          { $set: { dataRows: reports[index].dataRows, totalVolume: reports[index].totalVolume, totalRecords: reports[index].totalRecords, updatedAt: reports[index].updatedAt } }
        );
      } catch (e) {}
    }

    saveDynamicReports(reports);

    return res.json({ success: true, message: 'Data row deleted', report: reports[index] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
