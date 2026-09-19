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

function getDynamicReports() {
  const custom = storageService.getCollection('dynamicReports', []);
  const map = new Map();
  // Standard templates serve as base defaults; custom reports can override them or add new ones
  initialDynamicReports.forEach(r => map.set(r._id, r));
  custom.forEach(r => map.set(r._id, r));
  return Array.from(map.values());
}

function saveDynamicReports(data) {
  return storageService.saveCollection('dynamicReports', data);
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
router.post('/', (req, res) => {
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

    const reports = getDynamicReports();
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

    reports.unshift(newReport);
    saveDynamicReports(reports);

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
router.put('/:id', (req, res) => {
  try {
    const reports = getDynamicReports();
    const target = req.params.id;
    const index = reports.findIndex(r => r._id === target || r.code === target || (r.id && r.id === target));
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Report template not found' });
    }

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

    const existing = reports[index];

    let safeRows = existing.dataRows;
    if (Array.isArray(dataRows)) {
      safeRows = dataRows.map((r, i) => ({
        rowId: r.rowId || 'row_' + (Date.now() + i),
        ...r
      }));
    }

    const totalVolume = safeRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

    reports[index] = {
      ...existing,
      title: title !== undefined ? title.trim() : existing.title,
      code: code !== undefined ? code.toUpperCase() : existing.code,
      category: category !== undefined ? category : existing.category,
      reportBase: reportBase !== undefined ? reportBase : (existing.reportBase || 'receipts'),
      reportBaseLabel: reportBaseLabel !== undefined ? reportBaseLabel : (existing.reportBaseLabel || 'Receipts & Transactions'),
      filters: filters !== undefined ? filters : (existing.filters || {}),
      enabledFilters: enabledFilters !== undefined ? enabledFilters : (existing.enabledFilters || {}),
      selectedFieldKeys: selectedFieldKeys !== undefined ? selectedFieldKeys : (existing.selectedFieldKeys || []),
      targetTrust: targetTrust !== undefined ? targetTrust : existing.targetTrust,
      financialYear: financialYear !== undefined ? financialYear : existing.financialYear,
      fromDate: fromDate !== undefined ? fromDate : existing.fromDate,
      toDate: toDate !== undefined ? toDate : existing.toDate,
      description: description !== undefined ? description : existing.description,
      columns: Array.isArray(columns) && columns.length > 0 ? columns : existing.columns,
      dataRows: safeRows,
      totalVolume,
      totalRecords: safeRows.length,
      status: status !== undefined ? status : existing.status,
      updatedAt: new Date().toISOString()
    };

    saveDynamicReports(reports);

    return res.json({
      success: true,
      message: 'Report template and data rows updated successfully',
      data: reports[index]
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE report template
router.delete('/:id', (req, res) => {
  try {
    let reports = getDynamicReports();
    const existing = reports.find(r => r._id === req.params.id || r.code === req.params.id || r.id === req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Report template not found' });
    }

    const targetId = existing._id;
    reports = reports.filter(r => r._id !== targetId);
    saveDynamicReports(reports);

    return res.json({ success: true, message: 'Report template deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ADD a single data row inside the template
router.post('/:id/rows', (req, res) => {
  try {
    const reports = getDynamicReports();
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

    saveDynamicReports(reports);

    return res.status(201).json({ success: true, message: 'Data row added', data: newRow, report: reports[index] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ALTER/UPDATE a specific row inside the template
router.put('/:id/rows/:rowId', (req, res) => {
  try {
    const reports = getDynamicReports();
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

    saveDynamicReports(reports);

    return res.json({ success: true, message: 'Data row updated', data: reports[index].dataRows[rowIndex], report: reports[index] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE a specific row from the template
router.delete('/:id/rows/:rowId', (req, res) => {
  try {
    const reports = getDynamicReports();
    const index = reports.findIndex(r => r._id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Report template not found' });
    }

    reports[index].dataRows = reports[index].dataRows.filter(r => r.rowId !== req.params.rowId);
    reports[index].totalVolume = reports[index].dataRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    reports[index].totalRecords = reports[index].dataRows.length;
    reports[index].updatedAt = new Date().toISOString();

    saveDynamicReports(reports);

    return res.json({ success: true, message: 'Data row deleted', report: reports[index] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
