const Plan = require('../models/Plan');
const { getIsConnected } = require('../config/db');
const { getCollection, saveCollection } = require('../services/storageService');

const initialPlans = [
  {
    _id: 'plan_starter',
    name: 'Basic',
    code: 'basic',
    price: 1200,
    billingCycle: 'Annual',
    validityDays: 365,
    receiptLimit: 'Unlimited',
    staffUserLimit: '1 Staff User',
    features: ['1 Admin', '1 Staff'],
    badge: 'Basic',
    description: 'Entry-level package for newly registered trusts starting their digital journey.',
    status: 'Active',
    createdAt: new Date('2026-02-01T10:00:00.000Z').toISOString()
  },
  {
    _id: 'plan_standard',
    name: 'Standard',
    code: 'standard',
    price: 2500,
    billingCycle: 'Annual',
    validityDays: 365,
    receiptLimit: 'Unlimited Receipts',
    staffUserLimit: '2 Staff Users',
    features: ['1 Admin', '2 Staffs'],
    badge: 'Standard',
    description: 'Perfect for small to medium trusts and non-profit organizations.',
    status: 'Active',
    createdAt: new Date('2026-01-10T10:00:00.000Z').toISOString()
  }
];

const getPlans = () => getCollection('plans', initialPlans);
const savePlans = (list) => saveCollection('plans', list);

/**
 * Controller: List all plans
 */
const getAllPlans = async (req, res) => {
  try {
    const { status } = req.query;

    if (getIsConnected()) {
      const filter = status ? { status } : {};
      const plans = await Plan.find(filter).sort({ price: 1 }).lean();
      if (plans.length > 0) {
        return res.json({ success: true, count: plans.length, data: plans });
      }
      await Plan.insertMany(getPlans());
      return res.json({ success: true, count: getPlans().length, data: getPlans() });
    }

    let filtered = getPlans();
    if (status) {
      filtered = filtered.filter(p => p.status.toLowerCase() === status.toLowerCase());
    }
    return res.json({ success: true, count: filtered.length, data: filtered });
  } catch (error) {
    console.error('Error fetching plans in planController:', error);
    return res.status(500).json({ success: false, message: error.message, data: getPlans() });
  }
};

/**
 * Controller: Get plan by ID or code
 */
const getPlanById = async (req, res) => {
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
};

/**
 * Controller: Create a new plan
 */
const createPlan = async (req, res) => {
  try {
    const { name, code, price, billingCycle, validityDays, receiptLimit, staffUserLimit, features, badge, description, status } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ success: false, message: 'Plan name and price are required' });
    }

    const planCode = code || name.toLowerCase().replace(/\s+/g, '_');
    const newPlanData = {
      name,
      code: planCode,
      price: Number(price),
      billingCycle: billingCycle || 'Annual',
      validityDays: Number(validityDays) || 365,
      receiptLimit: receiptLimit || 'Unlimited Receipts',
      staffUserLimit: staffUserLimit || '4 Staff Users',
      features: Array.isArray(features) ? features : (features ? features.split('\n').filter(Boolean) : []),
      badge: badge || '',
      description: description || '',
      status: status || 'Active',
      createdAt: new Date().toISOString()
    };

    let saved = null;
    if (getIsConnected()) {
      try {
        saved = await Plan.create(newPlanData);
      } catch (dbErr) {
        console.warn('DB create plan error:', dbErr.message);
      }
    }

    const plans = getPlans();
    const diskPlan = {
      _id: saved ? saved._id.toString() : `plan_${Date.now()}`,
      ...newPlanData
    };
    plans.push(diskPlan);
    savePlans(plans);

    return res.status(201).json({ success: true, message: 'Plan created successfully', data: saved || diskPlan });
  } catch (error) {
    console.error('Error creating plan:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Controller: Update plan
 */
const updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    if (updates.price !== undefined) updates.price = Number(updates.price);
    if (updates.validityDays !== undefined) updates.validityDays = Number(updates.validityDays);

    let updated = null;
    if (getIsConnected()) {
      try {
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
          updated = await Plan.findByIdAndUpdate(id, updates, { new: true }).lean();
        } else {
          updated = await Plan.findOneAndUpdate({ $or: [{ _id: id }, { code: id }] }, updates, { new: true }).lean();
        }
      } catch (e) {
        console.warn('DB update plan error:', e.message);
      }
    }

    const plans = getPlans();
    const idx = plans.findIndex(p => p._id === id || p.code === id);
    if (idx !== -1) {
      plans[idx] = { ...plans[idx], ...updates, updatedAt: new Date().toISOString() };
      savePlans(plans);
      return res.json({ success: true, message: 'Plan updated successfully', data: updated || plans[idx] });
    }

    if (updated) {
      return res.json({ success: true, message: 'Plan updated successfully', data: updated });
    }

    return res.status(404).json({ success: false, message: 'Plan not found' });
  } catch (error) {
    console.error('Error updating plan:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Controller: Delete plan
 */
const deletePlan = async (req, res) => {
  try {
    const { id } = req.params;
    if (getIsConnected()) {
      try {
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
          await Plan.findByIdAndDelete(id);
        } else {
          await Plan.findOneAndDelete({ $or: [{ _id: id }, { code: id }] });
        }
      } catch (e) {}
    }

    const plans = getPlans();
    const filtered = plans.filter(p => p._id !== id && p.code !== id);
    savePlans(filtered);

    return res.json({ success: true, message: 'Plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting plan:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAllPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan
};
