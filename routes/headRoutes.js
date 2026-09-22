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

const escapeRegex = (string) => (string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Formats a donation head object.
// Global heads: clean name without brackets.
// Trust Admin custom heads: appends ' (Admin)'.
const formatHead = (h) => {
  if (!h) return null;
  const isGlobal = Boolean(h.isGlobal === true || h.createdBy === 'Super Admin' || h.createdBy === 'System');
  const createdBy = String(h.createdBy || 'Admin').trim();
  const trustName = String(h.trustName || '').trim();
  const trustEmail = String(h.trustEmail || '').trim().toLowerCase();

  // Base raw name: strip any already attached trailing brackets
  let rawName = String(h.rawName || h.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!rawName) rawName = String(h.name || '').trim();

  let displayName = rawName;
  if (!isGlobal) {
    displayName = `${rawName} (Admin)`;
  }

  return {
    _id: h._id ? String(h._id) : '',
    name: displayName,
    rawName: rawName,
    description: h.description || '',
    status: h.status || 'Active',
    isGlobal: isGlobal,
    isCustom: !isGlobal,
    createdBy: createdBy,
    trustName: trustName,
    trustEmail: trustEmail,
    hiddenForTrusts: Array.isArray(h.hiddenForTrusts) ? h.hiddenForTrusts : [],
    formattedDate: h.formattedDate || formatTime(h.createdAt || new Date()),
    createdAt: h.createdAt || new Date()
  };
};

// Deduplicates a list of heads by ID and raw base name.
// If filterTrusts is passed, hides heads that this trust deleted.
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
// SuperAdmin: ONLY platform/global donation heads.
// Trust Admin: Global heads (not hidden) + Custom heads created by this trust only.
router.get('/', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 100, trustName = '', trustEmail = '', isSuperAdmin = '' } = req.query;

    const isSuper = isSuperAdmin === 'true' || isSuperAdmin === true;
    const emailLower = (trustEmail || '').trim().toLowerCase();
    const nameLower = (trustName || '').trim().toLowerCase();

    const filterTrusts = !isSuper
      ? [trustName, trustEmail].filter(t => t && String(t).trim()).map(t => String(t).trim())
      : [];

    let dbQuery = {};
    if (isSuper) {
      dbQuery = {
        $or: [
          { isGlobal: true },
          { createdBy: 'Super Admin' },
          { createdBy: 'System' }
        ]
      };
    } else {
      const trustOrClauses = [];
      if (emailLower) {
        trustOrClauses.push({ trustEmail: new RegExp(`^${escapeRegex(emailLower)}$`, 'i') });
        trustOrClauses.push({ createdBy: new RegExp(`^${escapeRegex(emailLower)}$`, 'i') });
      }
      if (nameLower && nameLower !== 'trust organization') {
        trustOrClauses.push({ trustName: new RegExp(`^${escapeRegex(nameLower)}$`, 'i') });
        trustOrClauses.push({ createdBy: new RegExp(`^${escapeRegex(nameLower)}$`, 'i') });
      }

      dbQuery = {
        $or: [
          { isGlobal: true },
          { createdBy: 'Super Admin' },
          { createdBy: 'System' },
          ...(trustOrClauses.length > 0 ? [{ $and: [{ isGlobal: { $ne: true } }, { $or: trustOrClauses }] }] : [])
        ]
      };
    }

    if (search) {
      const sRegex = new RegExp(escapeRegex(search), 'i');
      dbQuery = { $and: [dbQuery, { $or: [{ name: sRegex }, { description: sRegex }] }] };
    }

    let rawList = [];
    if (getIsConnected()) {
      try {
        const heads = await DonationHead.find(dbQuery)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(Number(limit))
          .lean();
        if (heads && heads.length > 0) {
          rawList = heads;
        }
      } catch (dbErr) {
        console.warn('MongoDB error fetching heads:', dbErr.message);
      }
    }

    if (rawList.length === 0) {
      let diskHeads = getHeads();
      if (isSuper) {
        diskHeads = diskHeads.filter(h => h.isGlobal === true || h.createdBy === 'Super Admin' || h.createdBy === 'System');
      } else {
        diskHeads = diskHeads.filter(h => {
          const isGlobal = h.isGlobal === true || h.createdBy === 'Super Admin' || h.createdBy === 'System';
          if (isGlobal) return true;
          const hEmail = (h.trustEmail || '').trim().toLowerCase();
          const hTrust = (h.trustName || '').trim().toLowerCase();
          const hCreated = (h.createdBy || '').trim().toLowerCase();
          const matchEmail = emailLower && (hEmail === emailLower || hCreated === emailLower);
          const matchTrust = nameLower && nameLower !== 'trust organization' && (hTrust === nameLower || hCreated === nameLower);
          return Boolean(matchEmail || matchTrust);
        });
      }
      if (search) {
        const s = search.toLowerCase();
        diskHeads = diskHeads.filter(h =>
          (h.name && h.name.toLowerCase().includes(s)) ||
          (h.description && h.description.toLowerCase().includes(s))
        );
      }
      rawList = diskHeads;
    }

    const returnData = deduplicateHeads(rawList, filterTrusts);

    return res.json({
      success: true,
      data: returnData,
      total: returnData.length,
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error) {
    console.error('Error fetching heads:', error);
    return res.status(500).json({ success: false, message: error.message, data: deduplicateHeads(getHeads()) });
  }
});

// GET donation head by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let head = null;
    if (getIsConnected()) {
      try {
        if (mongoose.Types.ObjectId.isValid(id)) {
          head = await DonationHead.findById(id).lean();
        }
      } catch (e) {}
    }
    if (!head) {
      const heads = getHeads();
      head = heads.find(h => h._id === id || String(h._id) === String(id));
    }
    if (!head) {
      return res.status(404).json({ success: false, message: 'Head not found' });
    }
    return res.json({ success: true, data: formatHead(head) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST add new donation head
router.post('/', async (req, res) => {
  try {
    const { name, description = '', isGlobal = false, isSuperAdmin = false, createdBy = 'Admin', trustName = '', trustEmail = '' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Donation Head name is required' });
    }

    let cleanName = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!cleanName) cleanName = name.trim();

    const isSuper = isSuperAdmin === true || isSuperAdmin === 'true' || isGlobal === true || createdBy === 'Super Admin';
    const assignedTrust = isSuper ? '' : (trustName ? trustName.trim() : '');
    const assignedEmail = isSuper ? '' : (trustEmail ? trustEmail.trim().toLowerCase() : '');

    const now = new Date();
    const newHead = {
      _id: `dh_${Date.now()}`,
      name: cleanName,
      rawName: cleanName,
      description: description.trim(),
      status: 'Active',
      isGlobal: Boolean(isSuper),
      createdBy: isSuper ? 'Super Admin' : (assignedTrust || assignedEmail || 'Admin'),
      trustName: assignedTrust,
      trustEmail: assignedEmail,
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
          isGlobal: Boolean(isSuper),
          createdBy: isSuper ? 'Super Admin' : (assignedTrust || assignedEmail || 'Admin'),
          trustName: assignedTrust,
          trustEmail: assignedEmail,
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
    if (trustEmail !== undefined) updateFields.trustEmail = trustEmail.toLowerCase().trim();

    if (getIsConnected() && mongoose.Types.ObjectId.isValid(id)) {
      try {
        await DonationHead.findByIdAndUpdate(id, updateFields, { new: true });
      } catch (e) {}
    }

    const currentHeads = getHeads();
    const index = currentHeads.findIndex(h => String(h._id) === String(id));
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
// If SuperAdmin: permanently delete globally from database and disk.
// If Trust Admin:
//   - If custom head of this trust: permanently delete this custom head.
//   - If global head: hide only for this specific trust in hiddenForTrusts.
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
        targetHead = await DonationHead.findById(id).lean();
      } catch (e) {}
    }

    const baseName = targetHead
      ? (targetHead.rawName || targetHead.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim()
      : '';
    const isHeadGlobal = Boolean(targetHead?.isGlobal || targetHead?.createdBy === 'Super Admin' || targetHead?.createdBy === 'System');

    if (isSuper || (!isHeadGlobal && targetHead)) {
      // PERMANENT DELETE (either SuperAdmin deleting any head, or Trust Admin deleting their own custom head)
      if (getIsConnected()) {
        try {
          const deleteFilter = [];
          if (mongoose.Types.ObjectId.isValid(id)) {
            deleteFilter.push({ _id: id });
          }
          if (baseName && !isSuper) {
            deleteFilter.push({
              name: new RegExp(`^${escapeRegex(baseName)}$`, 'i'),
              isGlobal: false,
              ...(trustEmail ? { trustEmail: new RegExp(`^${escapeRegex(trustEmail.trim())}$`, 'i') } : {})
            });
          } else if (baseName && isSuper) {
            deleteFilter.push({ name: new RegExp(`^${escapeRegex(baseName)}$`, 'i') });
          }
          if (deleteFilter.length > 0) {
            await DonationHead.deleteMany({ $or: deleteFilter });
          }
        } catch (e) {
          console.error('Mongo delete error:', e.message);
        }
      }

      const filtered = currentHeads.filter(h => {
        const hId = String(h._id || '');
        const hBase = (h.rawName || h.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
        if (hId === String(id)) return false;
        if (!isSuper && !h.isGlobal && baseName && hBase === baseName.toLowerCase()) {
          const hEmail = (h.trustEmail || '').trim().toLowerCase();
          if (trustEmail && hEmail === trustEmail.trim().toLowerCase()) return false;
        }
        if (isSuper && baseName && hBase === baseName.toLowerCase()) return false;
        return true;
      });
      saveHeads(filtered);

      return res.json({
        success: true,
        message: isSuper
          ? 'Donation head permanently deleted globally across all panels'
          : 'Custom donation head deleted from your trust panel',
        deletedGlobally: isSuper
      });
    } else {
      // TRUST ADMIN HIDING A GLOBAL HEAD FOR THEIR TRUST ONLY
      const trustsToAdd = [];
      if (trustName && trustName.trim()) trustsToAdd.push(trustName.trim());
      if (trustEmail && trustEmail.trim()) trustsToAdd.push(trustEmail.trim().toLowerCase());
      if (trustsToAdd.length === 0) trustsToAdd.push('MahaRaja-Trust-002');

      if (getIsConnected()) {
        try {
          const mongoConditions = [];
          if (mongoose.Types.ObjectId.isValid(id)) {
            mongoConditions.push({ _id: id });
          }
          if (baseName) {
            mongoConditions.push({ name: new RegExp(`^${escapeRegex(baseName)}$`, 'i') });
          }
          if (mongoConditions.length > 0) {
            await DonationHead.updateMany(
              { $or: mongoConditions },
              { $addToSet: { hiddenForTrusts: { $each: trustsToAdd } } }
            );
          }
        } catch (e) {
          console.error('Mongo hide error:', e.message);
        }
      }

      // Update local storage
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
        message: 'Donation head removed from your panel only',
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

