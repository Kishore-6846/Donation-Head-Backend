const express = require('express');
const router = express.Router();
const storageService = require('../services/storageService');

// Default initial report types
const defaultReportTypes = [
  {
    "_id": "rt_10bd_compliance",
    "name": "Form No. 10BD Statutory Filing",
    "code": "REP_10BD_FILING",
    "category": "Statutory Compliance",
    "frequency": "Annual",
    "scope": "Donation Receipts",
    "columns": [
      "Donor Name",
      "PAN / Unique ID",
      "Address",
      "Donation Type",
      "Payment Mode",
      "Amount",
      "Receipt No",
      "Date"
    ],
    "sectionClause": "Section 80G(5)(vi) & Rule 18AB of IT Rules",
    "description": "Statutory certificate of donation required for furnishing electronically under Form 10BD to the Principal Director General of Income Tax (Systems).",
    "disclaimer": "Filing is mandatory under sub-rule (1) of rule 18AB. Delay attracts penalty under section 234G of the Income Tax Act.",
    "status": "Active",
    "createdAt": "2026-01-10T10:00:00.000Z",
    "updatedAt": "2026-09-16T12:00:00.000Z"
  },
  {
    "_id": "rt_receipt_audit",
    "name": "Receipts Audit Register",
    "code": "REP_RECEIPT_AUDIT",
    "category": "Financial Audit",
    "frequency": "Monthly",
    "scope": "Donation Receipts",
    "columns": [
      "Receipt No",
      "Donor Name",
      "Amount",
      "Donation Head",
      "Payment Mode",
      "Issue Date",
      "Status"
    ],
    "sectionClause": "Internal Audit & General Register",
    "description": "Chronological audit register of all numbered donation receipts issued, tracking payment modes and cancellation status.",
    "disclaimer": "For internal trust accounting and auditor verification. Matches physical counterfoils.",
    "status": "Active",
    "createdAt": "2026-01-12T11:00:00.000Z",
    "updatedAt": "2026-09-16T12:00:00.000Z"
  },
  {
    "_id": "rt_donor_directory",
    "name": "Donor Contribution Directory",
    "code": "REP_DONOR_DIR",
    "category": "Donor Analytics",
    "frequency": "Quarterly",
    "scope": "Donors Registry",
    "columns": [
      "Donor Name",
      "Mobile / Phone",
      "Email Address",
      "City / State",
      "Total Contributions",
      "Lifetime Amount",
      "PAN Number"
    ],
    "sectionClause": "Donor CRM & Stewardship",
    "description": "Comprehensive directory of patron donors, categorizing recurring supporters, HNIs, and cumulative contribution tiers.",
    "disclaimer": "Confidential donor information protected under Trust Data Governance Policy.",
    "status": "Active",
    "createdAt": "2026-02-01T09:30:00.000Z",
    "updatedAt": "2026-09-16T12:00:00.000Z"
  },
  {
    "_id": "rt_80g_exemption",
    "name": "80G Exemption Audit Report",
    "code": "REP_80G_AUDIT",
    "category": "Tax Compliance",
    "frequency": "Quarterly",
    "scope": "Donation Receipts",
    "columns": [
      "Receipt No",
      "Donor PAN",
      "Donor Name",
      "Eligible 80G Amount",
      "Approval Order No",
      "Date of Receipt"
    ],
    "sectionClause": "Section 80G(2)(a)(iv) of Income Tax Act 1961",
    "description": "Audit reconciliation of all 80G-eligible tax deductible donations issued with active provisional/perpetual registration credentials.",
    "disclaimer": "Eligible for 50% tax deduction in the hands of the donor subject to statutory limits.",
    "status": "Active",
    "createdAt": "2026-02-15T14:00:00.000Z",
    "updatedAt": "2026-09-16T12:00:00.000Z"
  },
  {
    "_id": "rt_fcra_remittance",
    "name": "FCRA Foreign Remittance Analysis",
    "code": "REP_FCRA_ANNUAL",
    "category": "Statutory Compliance",
    "frequency": "Annual",
    "scope": "Donation Receipts",
    "columns": [
      "Foreign Donor Name",
      "Country of Origin",
      "Foreign Currency",
      "INR Realized",
      "Purpose Code",
      "Designated Bank A/C",
      "FC-4 Reference"
    ],
    "sectionClause": "Foreign Contribution (Regulation) Act, 2010 (FCRA)",
    "description": "Statutory tracking for foreign inward contributions deposited exclusively in the designated SBI Main Branch New Delhi account.",
    "disclaimer": "Strictly subject to Form FC-4 annual return submission to the Ministry of Home Affairs (MHA).",
    "status": "Active",
    "createdAt": "2026-03-01T10:15:00.000Z",
    "updatedAt": "2026-09-16T12:00:00.000Z"
  },
  {
    "_id": "rt_head_utilization",
    "name": "Head-Wise Fund Utilization Summary",
    "code": "REP_HEAD_UTIL",
    "category": "Financial Audit",
    "frequency": "Monthly",
    "scope": "Donation Heads",
    "columns": [
      "Donation Head Name",
      "Total Receipts Count",
      "Total Inflow Amount",
      "Corpus vs General",
      "Share %"
    ],
    "sectionClause": "Section 11(1)(d) Corpus Funds & General Utilization",
    "description": "Breakdown of donations tagged by specific cause, educational scholarship, healthcare aid, food distribution, and capital projects.",
    "disclaimer": "Corpus donations are to be invested in specified modes under section 11(5) and cannot be diverted.",
    "status": "Active",
    "createdAt": "2026-03-10T16:00:00.000Z",
    "updatedAt": "2026-09-16T12:00:00.000Z"
  }
];

const ReportType = require('../models/ReportType');
const { getIsConnected } = require('../config/db');

async function getReportTypes() {
  if (getIsConnected()) {
    try {
      const dbTypes = await ReportType.find({}).lean();
      if (dbTypes && dbTypes.length > 0) return dbTypes;
      const created = await ReportType.insertMany(defaultReportTypes);
      return created;
    } catch (e) {
      console.warn('DB reportTypes fetch error:', e.message);
    }
  }
  return storageService.getCollection('reportTypes', defaultReportTypes);
}

// GET all report types
router.get('/', async (req, res) => {
  try {
    let types = await getReportTypes();
    const { status, category, search } = req.query;

    if (status) {
      types = types.filter(t => t.status && t.status.toLowerCase() === status.toLowerCase());
    }
    if (category) {
      types = types.filter(t => t.category && t.category.toLowerCase() === category.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      types = types.filter(t =>
        (t.name && t.name.toLowerCase().includes(q)) ||
        (t.code && t.code.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    }

    return res.json({ success: true, count: types.length, data: types });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET report type by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (getIsConnected()) {
      try {
        const found = await ReportType.findOne({ $or: [{ _id: id }, { code: id }] }).lean();
        if (found) return res.json({ success: true, data: found });
      } catch (e) {}
    }
    const types = await getReportTypes();
    const item = types.find(t => t._id === id || t.code === id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Report type not found' });
    }
    return res.json({ success: true, data: item });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// CREATE new report type
router.post('/', async (req, res) => {
  try {
    const { name, code, category, frequency, scope, columns, sectionClause, description, disclaimer, status } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Report type name is required' });
    }

    const generatedCode = (code || 'REP_' + name.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 15)).toUpperCase();

    const newType = {
      _id: 'rt_' + Date.now(),
      name: name.trim(),
      code: generatedCode,
      category: category || 'Custom Report',
      frequency: frequency || 'Monthly',
      scope: scope || 'Donation Receipts',
      columns: Array.isArray(columns) ? columns : (columns ? columns.split(',').map(s => s.trim()) : ['Donor Name', 'Amount', 'Date']),
      sectionClause: sectionClause || '',
      description: description || '',
      disclaimer: disclaimer || '',
      status: status || 'Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (getIsConnected()) {
      try {
        await ReportType.create(newType);
      } catch (e) {
        console.warn('DB error creating report type:', e.message);
      }
    }

    return res.status(201).json({ success: true, message: 'Report type created successfully', data: newType });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// UPDATE report type
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, category, frequency, scope, columns, sectionClause, description, disclaimer, status } = req.body;

    const updates = {
      updatedAt: new Date().toISOString()
    };
    if (name !== undefined) updates.name = name.trim();
    if (code !== undefined) updates.code = code.toUpperCase();
    if (category !== undefined) updates.category = category;
    if (frequency !== undefined) updates.frequency = frequency;
    if (scope !== undefined) updates.scope = scope;
    if (columns !== undefined) updates.columns = Array.isArray(columns) ? columns : columns.split(',').map(s => s.trim());
    if (sectionClause !== undefined) updates.sectionClause = sectionClause;
    if (description !== undefined) updates.description = description;
    if (disclaimer !== undefined) updates.disclaimer = disclaimer;
    if (status !== undefined) updates.status = status;

    let updated = null;
    if (getIsConnected()) {
      try {
        updated = await ReportType.findOneAndUpdate({ $or: [{ _id: id }, { code: id }] }, { $set: updates }, { new: true }).lean();
      } catch (e) {}
    }

    if (updated) {
      return res.json({ success: true, message: 'Report type updated successfully', data: updated });
    }

    return res.status(404).json({ success: false, message: 'Report type not found' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE report type
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (getIsConnected()) {
      try {
        await ReportType.findOneAndDelete({ $or: [{ _id: id }, { code: id }] });
      } catch (e) {}
    }

    return res.json({ success: true, message: 'Report type deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
