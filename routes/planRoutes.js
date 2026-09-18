const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/db');
const Plan = require('../models/Plan');
const { getCollection, saveCollection } = require('../services/storageService');

// Initial seed plans
const initialPlans = [
  {
    _id: 'plan_standard',
    name: 'Standard',
    code: 'standard',
    price: 4000,
    billingCycle: 'Annual',
    validityDays: 365,
    receiptLimit: 'Unlimited Receipts',
    staffUserLimit: '4 Staff Users',
    features: [
      'Unlimited Donation Receipts',
      '4 Staff User Logins',
      'WhatsApp Receipt Sharing',
      'Form No. 10BD Compliance Reports',
      '80G Tax Exemption Certificates',
      'Standard Email & Chat Support'
    ],
    badge: 'Popular',
    description: 'Perfect for small to medium trusts and non-profit organizations.',
    status: 'Active',
    createdAt: new Date('2026-01-10T10:00:00.000Z').toISOString()
  },
  {
    _id: 'plan_advanced',
    name: 'Advanced',
    code: 'advanced',
    price: 7000,
    billingCycle: 'Annual',
    validityDays: 365,
    receiptLimit: 'Unlimited Receipts',
    staffUserLimit: '9 Staff Users',
    features: [
      'Everything in Standard Plan',
      '9 Staff User Logins with Custom Roles',
      'Bulk Receipt PDF Downloader (ZIP)',
      'Custom Trust Logo & Digital Signature',
      'Automated WhatsApp Notification Alerts',
      'Priority Phone & WhatsApp Support'
    ],
    badge: 'Most Popular',
    description: 'Ideal for growing trusts managing multiple drives and active donor communities.',
    status: 'Active',
    createdAt: new Date('2026-01-15T10:00:00.000Z').toISOString()
  },
  {
    _id: 'plan_enterprise',
    name: 'Enterprise',
    code: 'enterprise',
    price: 10000,
    billingCycle: 'Annual',
    validityDays: 365,
    receiptLimit: 'Unlimited Receipts',
    staffUserLimit: 'Unlimited Staff',
    features: [
      'Everything in Advanced Plan',
      'Unlimited Staff Member Logins',
      'Dedicated Account Manager',
      'Custom Form 10BD Format Adjustments',
      'Multi-Branch & Multi-Chapter Vault',
      '24/7 VIP Priority Hotline'
    ],
    badge: 'Best Value',
    description: 'Designed for large charitable trusts, multi-state NGOs, and educational foundations.',
    status: 'Active',
    createdAt: new Date('2026-01-20T10:00:00.000Z').toISOString()
  },
  {
    _id: 'plan_starter',
    name: 'Starter',
    code: 'starter',
    price: 1999,
    billingCycle: 'Annual',
    validityDays: 365,
    receiptLimit: '500 Receipts/Year',
    staffUserLimit: '1 Staff User',
    features: [
      '500 Donation Receipts per year',
      '1 Admin User Access',
      'Instant PDF Receipt Generation',
      'Head-Wise & Donor Reports',
      'Standard Email Support'
    ],
    badge: 'Basic',
    description: 'Entry-level package for newly registered trusts starting their digital journey.',
    status: 'Active',
    createdAt: new Date('2026-02-01T10:00:00.000Z').toISOString()
  }
];

const getPlans = () => getCollection('plans', initialPlans);
const savePlans = (list) => saveCollection('plans', list);

// GET /api/plans - List all plans
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;

    if (getIsConnected()) {
      const filter = status ? { status } : {};
      const plans = await Plan.find(filter).sort({ price: 1 }).lean();
      if (plans.length > 0) {
        return res.json({ success: true, count: plans.length, data: plans });
      }
      // If DB empty, seed mock plans
      await Plan.insertMany(getPlans());
      return res.json({ success: true, count: getPlans().length, data: getPlans() });
    }

    let filtered = getPlans();
    if (status) {
      filtered = filtered.filter(p => p.status.toLowerCase() === status.toLowerCase());
    }
    return res.json({ success: true, count: filtered.length, data: filtered });
  } catch (error) {
    console.error('Error fetching plans:', error);
    return res.status(500).json({ success: false, message: error.message, data: getPlans() });
  }
});

// GET /api/plans/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (getIsConnected()) {
      try {
        let plan = null;
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
          plan = await Plan.findById(id).lean();
        } else {
          plan = await Plan.findOne({ $or: [{ _id: id }, { code: id }] }).lean();
        }
        if (plan) return res.json({ success: true, data: plan });
      } catch (e) {
        console.warn('MongoDB plan fetch error:', e.message);
      }
    }
    const plans = getPlans();
    const found = plans.find(p => p._id === id || p.code === id || (p.name && p.name.toLowerCase() === id.toLowerCase()));
    if (!found) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }
    return res.json({ success: true, data: found });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/plans - Create new plan
router.post('/', async (req, res) => {
  try {
    const {
      name,
      code,
      price,
      billingCycle,
      validityDays,
      receiptLimit,
      staffUserLimit,
      features,
      badge,
      description,
      status
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ success: false, message: 'Plan name and price are required' });
    }

    const planCode = (code || name.toLowerCase().replace(/[^a-z0-9]/g, '_')).trim();

    const newPlanData = {
      _id: 'plan_' + Date.now(),
      name: name.trim(),
      code: planCode,
      price: Number(price),
      billingCycle: billingCycle || 'Annual',
      validityDays: Number(validityDays) || 365,
      receiptLimit: receiptLimit || 'Unlimited Receipts',
      staffUserLimit: staffUserLimit || '4 Staff Users',
      features: Array.isArray(features) ? features : (typeof features === 'string' ? features.split('\n').map(s => s.trim()).filter(Boolean) : []),
      badge: badge || '',
      description: description || '',
      status: status || 'Active',
      createdAt: new Date().toISOString()
    };

    if (getIsConnected()) {
      try {
        const created = await Plan.create(newPlanData);
        newPlanData._id = created._id.toString();
      } catch (e) {
        console.warn('DB Plan create error:', e.message);
      }
    }

    const currentPlans = getPlans();
    currentPlans.unshift(newPlanData);
    savePlans(currentPlans);

    return res.status(201).json({
      success: true,
      message: 'Plan created successfully',
      data: newPlanData
    });
  } catch (error) {
    console.error('Error creating plan:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/plans/:id - Update existing plan
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (updates.features && typeof updates.features === 'string') {
      updates.features = updates.features.split('\n').map(s => s.trim()).filter(Boolean);
    }
    if (updates.price !== undefined) {
      updates.price = Number(updates.price);
    }
    if (updates.validityDays !== undefined) {
      updates.validityDays = Number(updates.validityDays);
    }

    let updatedPlan = null;

    if (getIsConnected()) {
      try {
        updatedPlan = await Plan.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
      } catch (e) {}
    }

    const currentPlans = getPlans();
    const index = currentPlans.findIndex(p => p._id === id || p.code === id);
    if (index !== -1) {
      currentPlans[index] = { ...currentPlans[index], ...updates };
      updatedPlan = currentPlans[index];
      savePlans(currentPlans);
    }

    if (!updatedPlan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    return res.json({
      success: true,
      message: 'Plan updated successfully',
      data: updatedPlan
    });
  } catch (error) {
    console.error('Error updating plan:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/plans/:id - Delete or deactivate plan
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (getIsConnected()) {
      try {
        await Plan.findByIdAndDelete(id);
      } catch (e) {}
    }

    const currentPlans = getPlans();
    const filtered = currentPlans.filter(p => p._id !== id && p.code !== id);
    savePlans(filtered);

    return res.json({
      success: true,
      message: 'Plan deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting plan:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
module.exports.getPlans = getPlans;
