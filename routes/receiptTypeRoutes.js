const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/db');
const ReceiptType = require('../models/ReceiptType');
const { getCollection, saveCollection } = require('../services/storageService');

const initialReceiptTypes = [
  {
    _id: 'rtype_1',
    name: '80G Tax Exemption Receipt',
    code: '80G_TAX_EXEMPT',
    is80GEligible: true,
    taxSection: 'Section 80G(5)(vi)',
    description: 'Eligible for 50% income tax deduction under Section 80G. Form 10BD compliant.',
    defaultNotes: 'Donation eligible for tax deduction under Section 80G of Income Tax Act 1961.',
    usageCount: 382,
    status: 'Active',
    createdAt: '2026-01-01T10:00:00.000Z'
  },
  {
    _id: 'rtype_2',
    name: 'General / Voluntary Donation',
    code: 'VOLUNTARY_DONATION',
    is80GEligible: false,
    taxSection: 'General',
    description: 'Unrestricted voluntary contributions used for charitable trust operational activities.',
    defaultNotes: 'Voluntary contribution towards general charitable trust objectives.',
    usageCount: 154,
    status: 'Active',
    createdAt: '2026-01-05T10:00:00.000Z'
  },
  {
    _id: 'rtype_3',
    name: 'Corpus Fund Donation',
    code: 'CORPUS_FUND',
    is80GEligible: true,
    taxSection: 'Section 11(1)(d)',
    description: 'Capital donations with specific donor direction to be treated as capital corpus.',
    defaultNotes: 'Donation directed specifically towards the Trust Capital Corpus Fund.',
    usageCount: 65,
    status: 'Active',
    createdAt: '2026-01-15T10:00:00.000Z'
  },
  {
    _id: 'rtype_4',
    name: 'CSR Project Grant',
    code: 'CSR_PROJECT',
    is80GEligible: true,
    taxSection: 'Section 135 & 80G',
    description: 'Corporate Social Responsibility statutory grants received from companies.',
    defaultNotes: 'CSR contribution received in accordance with Section 135 of Companies Act 2013.',
    usageCount: 28,
    status: 'Active',
    createdAt: '2026-02-01T10:00:00.000Z'
  },
  {
    _id: 'rtype_5',
    name: 'In-Kind / Material Donation',
    code: 'IN_KIND',
    is80GEligible: false,
    taxSection: 'Non-Monetary',
    description: 'Donations of ration, medicines, stationery, clothing, and equipment.',
    defaultNotes: 'Donation received in-kind. Values mentioned are indicative fair market values.',
    usageCount: 42,
    status: 'Active',
    createdAt: '2026-02-15T10:00:00.000Z'
  },
  {
    _id: 'rtype_6',
    name: 'Anonymous / Hundi Donation',
    code: 'ANONYMOUS_HUNDI',
    is80GEligible: false,
    taxSection: 'Section 115BBC',
    description: 'Collections from hundi boxes or anonymous community drives.',
    defaultNotes: 'Anonymous contribution collected through donation boxes.',
    usageCount: 19,
    status: 'Active',
    createdAt: '2026-03-01T10:00:00.000Z'
  }
];

const getReceiptTypes = () => getCollection('receiptTypes', initialReceiptTypes);
const saveReceiptTypes = (list) => saveCollection('receiptTypes', list);

// GET /api/receipt-types
router.get('/', async (req, res) => {
  try {
    const { status, search } = req.query;
    let list = getReceiptTypes();

    if (getIsConnected()) {
      try {
        const dbTypes = await ReceiptType.find().sort({ createdAt: 1 }).lean();
        if (dbTypes.length > 0) {
          list = dbTypes.map(t => ({
            _id: t._id.toString(),
            name: t.name,
            code: t.code,
            is80GEligible: t.is80GEligible,
            taxSection: t.taxSection || 'Section 80G',
            description: t.description || '',
            defaultNotes: t.defaultNotes || '',
            usageCount: t.usageCount || 0,
            status: t.status,
            createdAt: t.createdAt
          }));
        }
      } catch (e) {
        console.warn('DB read error for receipt types:', e.message);
      }
    }

    if (status && status !== 'All') {
      list = list.filter(t => t.status.toLowerCase() === status.toLowerCase());
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        (t.taxSection && t.taxSection.toLowerCase().includes(q))
      );
    }

    return res.json({
      success: true,
      count: list.length,
      data: list
    });
  } catch (error) {
    console.error('Error fetching receipt types:', error);
    return res.status(500).json({ success: false, message: error.message, data: getReceiptTypes() });
  }
});

// GET /api/receipt-types/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const types = getReceiptTypes();
    let item = types.find(t => t._id === id || t.code === id);
    if (!item && getIsConnected()) {
      item = await ReceiptType.findById(id).lean();
    }
    if (!item) {
      return res.status(404).json({ success: false, message: 'Receipt type not found' });
    }
    return res.json({ success: true, data: item });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/receipt-types - Create new receipt type
router.post('/', async (req, res) => {
  try {
    const {
      name,
      code,
      is80GEligible,
      taxSection,
      description,
      defaultNotes,
      status
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Receipt type name is required' });
    }

    const typeCode = (code || name.toUpperCase().replace(/[^A-Z0-9]/g, '_')).trim();

    const newType = {
      _id: 'rtype_' + Date.now(),
      name: name.trim(),
      code: typeCode,
      is80GEligible: Boolean(is80GEligible),
      taxSection: taxSection || (is80GEligible ? 'Section 80G' : 'General'),
      description: description || '',
      defaultNotes: defaultNotes || '',
      usageCount: 0,
      status: status || 'Active',
      createdAt: new Date().toISOString()
    };

    if (getIsConnected()) {
      try {
        const created = await ReceiptType.create(newType);
        newType._id = created._id.toString();
      } catch (e) {
        console.warn('DB receipt type create skipped:', e.message);
      }
    }

    const currentTypes = getReceiptTypes();
    currentTypes.push(newType);
    saveReceiptTypes(currentTypes);

    return res.status(201).json({
      success: true,
      message: 'Receipt type created successfully',
      data: newType
    });
  } catch (error) {
    console.error('Error creating receipt type:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/receipt-types/:id - Update receipt type
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    let updated = null;

    if (getIsConnected()) {
      try {
        updated = await ReceiptType.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
      } catch (e) {}
    }

    const currentTypes = getReceiptTypes();
    const index = currentTypes.findIndex(t => t._id === id || t.code === id);
    if (index !== -1) {
      currentTypes[index] = { ...currentTypes[index], ...updates };
      updated = currentTypes[index];
      saveReceiptTypes(currentTypes);
    }

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Receipt type not found' });
    }

    return res.json({
      success: true,
      message: 'Receipt type updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Error updating receipt type:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/receipt-types/:id - Delete receipt type
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (getIsConnected()) {
      try {
        await ReceiptType.findByIdAndDelete(id);
      } catch (e) {}
    }

    const currentTypes = getReceiptTypes();
    const filtered = currentTypes.filter(t => t._id !== id && t.code !== id);
    saveReceiptTypes(filtered);

    return res.json({
      success: true,
      message: 'Receipt type deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting receipt type:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
module.exports.getReceiptTypes = getReceiptTypes;
