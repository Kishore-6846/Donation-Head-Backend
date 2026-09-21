const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { getIsConnected } = require('../config/db');
const DonationHead = require('../models/DonationHead');
const { initialDonationHeads } = require('../data/seedData');
const { getCollection, saveCollection } = require('../services/storageService');

const getHeads = () => {
  const current = getCollection('donationHeads', initialDonationHeads);
  if (!current || current.length === 0) {
    saveCollection('donationHeads', initialDonationHeads);
    return [...initialDonationHeads];
  }
  const existingNames = new Set(current.map(h => (h.name || '').toLowerCase()));
  let updated = false;
  for (const init of initialDonationHeads) {
    if (!existingNames.has((init.name || '').toLowerCase())) {
      current.push(init);
      updated = true;
    }
  }
  if (updated) {
    saveCollection('donationHeads', current);
  }
  return current;
};
const saveHeads = (list) => saveCollection('donationHeads', list);

const formatTime = (d) => {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);

  try {
    const options = {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    };

    const formatter = new Intl.DateTimeFormat('en-GB', options);
    const parts = formatter.formatToParts(date);
    let day = '', month = '', year = '', hour = '', minute = '', dayPeriod = '';
    for (const p of parts) {
      if (p.type === 'day') day = p.value;
      else if (p.type === 'month') month = p.value;
      else if (p.type === 'year') year = p.value;
      else if (p.type === 'hour') hour = p.value;
      else if (p.type === 'minute') minute = p.value;
      else if (p.type === 'dayPeriod') dayPeriod = p.value;
    }

    let ampm = (dayPeriod || (date.getHours() >= 12 ? 'pm' : 'am')).toLowerCase().replace(/\./g, '');
    const strHour = String(hour).padStart(2, '0');
    const strMin = String(minute).padStart(2, '0');
    return `${day}-${month}-${year} ${strHour}:${strMin}${ampm}`;
  } catch (e) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = String(hours).padStart(2, '0');
    return `${day}-${month}-${year} ${strHours}:${minutes}${ampm}`;
  }
};

// Formats a donation head object.
// If created by an admin (not super admin, not system, not global), appends the trust name in brackets.
const formatHead = (h) => {
  if (!h) return null;
  const isGlobal = Boolean(h.isGlobal);
  const createdBy = String(h.createdBy || 'Admin').trim();
  let trustName = String(h.trustName || '').trim();

  // If not global and no trustName explicitly stored:
  if (!isGlobal && !trustName) {
    if (createdBy && !['Super Admin', 'System', 'Admin'].includes(createdBy)) {
      trustName = createdBy;
    } else {
      trustName = 'MahaRaja-Trust-002';
    }
  }

  // Base raw name: strip any already attached trailing brackets to prevent duplicate brackets
  let rawName = String(h.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!rawName) rawName = String(h.name || '').trim();

  let displayName = rawName;
  const isCreatedByAdmin = !isGlobal && createdBy !== 'Super Admin' && createdBy !== 'System';
  if (isCreatedByAdmin && trustName) {
    displayName = `${rawName} (${trustName})`;
  }

  return {
    _id: h._id ? String(h._id) : '',
    name: displayName,
    rawName: rawName,
    description: h.description || '',
    status: h.status || 'Active',
    isGlobal: isGlobal,
    createdBy: createdBy,
    trustName: trustName,
    trustEmail: h.trustEmail || '',
    hiddenForTrusts: Array.isArray(h.hiddenForTrusts) ? h.hiddenForTrusts : [],
    formattedDate: h.formattedDate || formatTime(h.createdAt || new Date()),
    createdAt: h.createdAt || new Date()
  };
};

// Deduplicates a list of heads by both ID and base name to ensure no duplicate shows in any panel.
// If filterTrusts is passed (e.g. array of trust names/emails), hides heads that this trust deleted.
const deduplicateHeads = (list, filterTrusts = []) => {
  const trustsArray = Array.isArray(filterTrusts)
    ? filterTrusts.filter(Boolean).map(t => String(t).trim().toLowerCase())
    : (filterTrusts ? [String(filterTrusts).trim().toLowerCase()] : []);

  const seenIds = new Set();
  const seenNames = new Set();
  const result = [];
  for (const item of list) {
    if (!item) continue;
    const formatted = formatHead(item);
    const id = String(formatted._id || '').trim();
    const base = formatted.rawName.toLowerCase();

    // Check if hidden for this trust
    if (trustsArray.length > 0 && Array.isArray(formatted.hiddenForTrusts)) {
      const isHidden = formatted.hiddenForTrusts.some(t =>
        trustsArray.includes(String(t).trim().toLowerCase())
      );
      if (isHidden) continue;
    }

    if (id && seenIds.has(id)) continue;
    if (base && seenNames.has(base)) continue;

    if (id) seenIds.add(id);
    if (base) seenNames.add(base);
    result.push(formatted);
  }
  return result;
};

// GET all donation heads
router.get('/', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 100, trustName = '', trustEmail = '', isSuperAdmin = '' } = req.query;

    const isSuper = isSuperAdmin === 'true' || isSuperAdmin === true;
    const filterTrusts = !isSuper
      ? [trustName, trustEmail].filter(t => t && String(t).trim()).map(t => String(t).trim())
      : [];

    if (getIsConnected()) {
      const query = search
        ? { name: { $regex: search, $options: 'i' } }
        : {};

      const heads = await DonationHead.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean();

      const rawList = (heads && heads.length > 0) ? heads : (search ? [] : getHeads());
      const returnData = deduplicateHeads(rawList, filterTrusts);

      return res.json({
        success: true,
        data: returnData,
        total: returnData.length,
        page: Number(page),
        limit: Number(limit)
      });
    } else {
      let heads = getHeads();
      if (search) {
        heads = heads.filter(h =>
          h.name.toLowerCase().includes(search.toLowerCase()) ||
          (h.description && h.description.toLowerCase().includes(search.toLowerCase()))
        );
      }
      const returnData = deduplicateHeads(heads, filterTrusts);
      return res.json({
        success: true,
        data: returnData,
        total: returnData.length,
        page: 1,
        limit: 100
      });
    }
  } catch (error) {
    console.error('Error fetching heads:', error);
    return res.status(500).json({ success: false, message: error.message, data: deduplicateHeads(getHeads()) });
  }
});

// GET donation head by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (getIsConnected()) {
      const head = await DonationHead.findById(id);
      if (!head) {
        return res.status(404).json({ success: false, message: 'Head not found' });
      }
      return res.json({
        success: true,
        data: formatHead(head)
      });
    } else {
      const heads = getHeads();
      const head = heads.find(h => h._id === id);
      if (!head) {
        return res.status(404).json({ success: false, message: 'Head not found' });
      }
      return res.json({ success: true, data: formatHead(head) });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST add new donation head
router.post('/', async (req, res) => {
  try {
    const { name, description = '', isGlobal = false, createdBy = 'Admin', trustName = '', trustEmail = '' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Donation Head name is required' });
    }

    let cleanName = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!cleanName) cleanName = name.trim();

    let assignedTrust = trustName ? trustName.trim() : '';
    if (!isGlobal && !assignedTrust && createdBy && !['Super Admin', 'System', 'Admin'].includes(createdBy)) {
      assignedTrust = createdBy.trim();
    }
    if (!isGlobal && !assignedTrust) {
      assignedTrust = 'MahaRaja-Trust-002';
    }

    const now = new Date();
    const newHead = {
      _id: `dh_${Date.now()}`,
      name: cleanName,
      description: description.trim(),
      status: 'Active',
      isGlobal: Boolean(isGlobal),
      createdBy: String(createdBy || 'Admin'),
      trustName: assignedTrust,
      trustEmail: String(trustEmail || ''),
      hiddenForTrusts: [],
      createdAt: now.toISOString(),
      formattedDate: formatTime(now)
    };

    if (getIsConnected()) {
      try {
        const created = await DonationHead.create({
          name: cleanName,
          description: description.trim(),
          status: 'Active',
          isGlobal: Boolean(isGlobal),
          createdBy: String(createdBy || 'Admin'),
          trustName: assignedTrust,
          trustEmail: String(trustEmail || ''),
          hiddenForTrusts: []
        });
        newHead._id = created._id.toString();
      } catch (e) {
        console.warn('DB head create error:', e.message);
      }
    }

    const currentHeads = getHeads();
    currentHeads.unshift(newHead);
    saveHeads(currentHeads);

    return res.status(201).json({
      success: true,
      message: 'Donation head created successfully',
      data: formatHead(newHead)
    });
  } catch (error) {
    console.error('Error adding head:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT update donation head
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status, isGlobal, trustName, trustEmail } = req.body;

    const cleanName = name !== undefined ? name.replace(/\s*\([^)]*\)\s*$/, '').trim() : undefined;

    const updateFields = {};
    if (cleanName !== undefined) updateFields.name = cleanName;
    if (description !== undefined) updateFields.description = description;
    if (status !== undefined) updateFields.status = status;
    if (isGlobal !== undefined) updateFields.isGlobal = Boolean(isGlobal);
    if (trustName !== undefined) updateFields.trustName = trustName;
    if (trustEmail !== undefined) updateFields.trustEmail = trustEmail;

    if (getIsConnected()) {
      try {
        await DonationHead.findByIdAndUpdate(id, updateFields, { new: true });
      } catch (e) {}
    }

    const currentHeads = getHeads();
    const index = currentHeads.findIndex(h => h._id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Head not found' });
    }
    currentHeads[index] = {
      ...currentHeads[index],
      ...updateFields
    };
    saveHeads(currentHeads);

    return res.json({
      success: true,
      message: 'Donation head updated successfully',
      data: formatHead(currentHeads[index])
    });
  } catch (error) {
    console.error('Error updating head:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE donation head
// If SuperAdmin deletes: permanently delete globally from database for all panels.
// If Trust Admin deletes: hide only for this specific trust in hiddenForTrusts.
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { isSuperAdmin = '', trustName = '', trustEmail = '' } = req.query;

    const isSuper = isSuperAdmin === 'true' || isSuperAdmin === true;
    const currentHeads = getHeads();

    // Identify target head and its raw base name
    let targetHead = currentHeads.find(h => String(h._id) === String(id));
    if (!targetHead && getIsConnected() && mongoose.Types.ObjectId.isValid(id)) {
      try {
        targetHead = await DonationHead.findById(id);
      } catch (e) {}
    }

    const baseName = targetHead
      ? (targetHead.rawName || targetHead.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim()
      : '';

    // Build database query conditions
    const mongoConditions = [];
    if (mongoose.Types.ObjectId.isValid(id)) {
      mongoConditions.push({ _id: id });
    }
    if (baseName) {
      mongoConditions.push({ name: baseName });
      const escapedBase = baseName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      mongoConditions.push({ name: new RegExp('^' + escapedBase + '(\\s*\\([^)]*\\))?$', 'i') });
    }

    if (isSuper) {
      // 1. SUPER ADMIN DELETE: Global permanent delete across all panels
      if (getIsConnected() && mongoConditions.length > 0) {
        try {
          await DonationHead.deleteMany({ $or: mongoConditions });
        } catch (e) {
          console.error('Mongo delete error:', e.message);
        }
      }

      const filtered = currentHeads.filter(h => {
        const hId = String(h._id || '');
        const hBase = (h.rawName || h.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
        if (hId === String(id)) return false;
        if (baseName && hBase === baseName.toLowerCase()) return false;
        return true;
      });
      saveHeads(filtered);

      return res.json({
        success: true,
        message: 'Donation head permanently deleted globally across all panels',
        deletedGlobally: true
      });
    } else {
      // 2. TRUST ADMIN DELETE: Hide only for this specific trust
      const trustsToAdd = [];
      if (trustName && trustName.trim()) trustsToAdd.push(trustName.trim());
      if (trustEmail && trustEmail.trim()) trustsToAdd.push(trustEmail.trim());
      if (trustsToAdd.length === 0) trustsToAdd.push('MahaRaja-Trust-002');

      if (getIsConnected() && mongoConditions.length > 0) {
        try {
          await DonationHead.updateMany(
            { $or: mongoConditions },
            { $addToSet: { hiddenForTrusts: { $each: trustsToAdd } } }
          );
        } catch (e) {
          console.error('Mongo hide error:', e.message);
        }
      }

      // Also update donationHeads.json
      for (const item of currentHeads) {
        const hId = String(item._id || '');
        const hBase = (item.rawName || item.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
        if (hId === String(id) || (baseName && hBase === baseName.toLowerCase())) {
          if (!Array.isArray(item.hiddenForTrusts)) item.hiddenForTrusts = [];
          for (const t of trustsToAdd) {
            if (!item.hiddenForTrusts.some(existing => existing.toLowerCase() === t.toLowerCase())) {
              item.hiddenForTrusts.push(t);
            }
          }
        }
      }
      saveHeads(currentHeads);

      return res.json({
        success: true,
        message: `Donation head removed from your panel only`,
        hiddenForTrusts: trustsToAdd
      });
    }
  } catch (error) {
    console.error('Error deleting head:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
module.exports.getHeads = getHeads;
module.exports.formatHead = formatHead;
