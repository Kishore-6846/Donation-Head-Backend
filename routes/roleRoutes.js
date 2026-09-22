const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/db');
const Role = require('../models/Role');
const { initialRoles } = require('../data/seedData');

const { getCollection, saveCollection } = require('../services/storageService');

const getRoles = () => getCollection('roles', initialRoles);
const saveRoles = (list) => saveCollection('roles', list);

const getISTDateString = (d = new Date()) => {
  if (!d) return '';

  // If already a 24-hour string like DD-MM-YYYY HH:mm:ss, convert to 12-hour AM/PM
  if (typeof d === 'string' && /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/.test(d.trim())) {
    const [dPart, tPart] = d.trim().split(' ');
    const [day, month, year] = dPart.split('-');
    const [hh, mm, ss] = tPart.split(':');
    let h = parseInt(hh, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const strH = String(h).padStart(2, '0');
    return `${day}-${month}-${year} ${strH}:${mm}:${ss} ${ampm}`;
  }

  // If already 12-hour format string, return formatted
  if (typeof d === 'string' && /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}(:\d{2})?\s*(AM|PM|am|pm)$/i.test(d.trim())) {
    return d.trim().toUpperCase();
  }

  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);

    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).formatToParts(date);

    let day = '', month = '', year = '', hour = '', minute = '', second = '', dayPeriod = '';
    for (const p of parts) {
      if (p.type === 'day') day = p.value;
      else if (p.type === 'month') month = p.value;
      else if (p.type === 'year') year = p.value;
      else if (p.type === 'hour') hour = p.value;
      else if (p.type === 'minute') minute = p.value;
      else if (p.type === 'second') second = p.value;
      else if (p.type === 'dayPeriod') dayPeriod = p.value;
    }

    const strHour = String(hour).padStart(2, '0');
    const strMin = String(minute).padStart(2, '0');
    const strSec = String(second).padStart(2, '0');
    const ampm = (dayPeriod || (date.getHours() >= 12 ? 'PM' : 'AM')).toUpperCase();

    return `${day}-${month}-${year} ${strHour}:${strMin}:${strSec} ${ampm}`;
  } catch (e) {
    const date = new Date(d);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    let hours = date.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const strHours = String(hours).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}-${month}-${year} ${strHours}:${minutes}:${seconds} ${ampm}`;
  }
};

// GET all roles (optionally filtered by trustEmail)
router.get('/', async (req, res) => {
  try {
    const { trustEmail, trustId } = req.query;
    let roles = [];

    if (getIsConnected()) {
      try {
        let filter = {};
        if (trustEmail) {
          const emailLower = trustEmail.trim().toLowerCase();
          filter = {
            $or: [
              { trustEmail: emailLower },
              { trustEmail: { $exists: false } },
              { trustEmail: '' },
              { trustEmail: null }
            ]
          };
        }
        roles = await Role.find(filter).sort({ createdAt: -1 }).lean();
      } catch (dbErr) {
        console.error('Error fetching roles from MongoDB:', dbErr);
      }
    }

    // Always merge with fallback storage so no roles are lost
    const localRoles = getRoles();
    const roleMap = new Map();
    (roles || []).forEach(r => {
      if (r && r.roleName) {
        const item = {
          ...r,
          created: r.createdAt ? getISTDateString(r.createdAt) : (r.created ? getISTDateString(r.created) : getISTDateString(new Date()))
        };
        roleMap.set(r.roleName.toLowerCase(), item);
      }
    });
    (localRoles || []).forEach(r => {
      if (r && r.roleName && !roleMap.has(r.roleName.toLowerCase())) {
        const item = {
          ...r,
          created: r.createdAt ? getISTDateString(r.createdAt) : (r.created ? getISTDateString(r.created) : getISTDateString(new Date()))
        };
        roleMap.set(r.roleName.toLowerCase(), item);
      }
    });

    return res.json({ success: true, data: Array.from(roleMap.values()) });
  } catch (error) {
    console.error('Error in GET /api/roles:', error);
    return res.json({ success: true, data: getRoles() });
  }
});

// POST create or upsert a new role
router.post('/', async (req, res) => {
  try {
    const {
      roleName,
      description = '',
      permissions = {},
      trustEmail = '',
      trustName = '',
      trustId = ''
    } = req.body;

    const cleanRoleName = (roleName || '').replace(/[^a-zA-Z\s]/g, '').trim();
    if (!cleanRoleName) {
      return res.status(400).json({
        success: false,
        message: 'Role Name is required and must contain letters and spaces only'
      });
    }

    const now = new Date();
    const dateStr = getISTDateString(now);

    let savedRole = null;

    if (getIsConnected()) {
      try {
        const emailLower = (trustEmail || '').trim().toLowerCase();
        // Check if role with this name already exists
        const filter = {
          roleName: { $regex: new RegExp(`^${cleanRoleName}$`, 'i') }
        };
        if (emailLower) {
          filter.$or = [{ trustEmail: emailLower }, { trustEmail: '' }, { trustEmail: { $exists: false } }];
        }

        const existing = await Role.findOne(filter);
        if (existing) {
          existing.permissions = permissions;
          if (description) existing.description = description.trim();
          if (emailLower && !existing.trustEmail) existing.trustEmail = emailLower;
          if (trustName && !existing.trustName) existing.trustName = trustName;
          savedRole = await existing.save();
        } else {
          savedRole = await Role.create({
            roleName: cleanRoleName,
            description: description.trim(),
            permissions,
            created: dateStr,
            trustEmail: emailLower,
            trustName: trustName || '',
            trustId: trustId || ''
          });
        }
      } catch (dbErr) {
        console.error('Error saving role to MongoDB:', dbErr);
      }
    }

    // Always update fallback storage
    const current = getRoles();
    const existingIdx = current.findIndex(
      r => r.roleName && r.roleName.toLowerCase() === cleanRoleName.toLowerCase()
    );

    const fallbackRole = {
      _id: savedRole?._id?.toString() || `role_${Date.now()}`,
      roleName: cleanRoleName,
      description: description.trim(),
      permissions,
      created: dateStr,
      trustEmail: (trustEmail || '').trim().toLowerCase(),
      trustName: trustName || '',
      trustId: trustId || ''
    };

    if (existingIdx !== -1) {
      current[existingIdx] = { ...current[existingIdx], ...fallbackRole };
    } else {
      current.unshift(fallbackRole);
    }
    saveRoles(current);

    return res.status(201).json({
      success: true,
      message: 'Role added successfully',
      data: savedRole || fallbackRole
    });
  } catch (error) {
    console.error('Error adding role:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error creating role'
    });
  }
});

// GET single role by id or name
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let role = null;
    if (getIsConnected()) {
      try {
        role = await Role.findById(id).lean();
      } catch (e) {}
    }
    if (!role) {
      const all = getRoles();
      role = all.find(r => r._id === id || r.roleName === id);
    }
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    return res.json({ success: true, data: role });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT update role
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { roleName, description, permissions } = req.body;
    let updated = null;
    const cleanRoleName = roleName !== undefined ? (roleName || '').replace(/[^a-zA-Z\s]/g, '').trim() : undefined;

    if (getIsConnected()) {
      try {
        updated = await Role.findByIdAndUpdate(
          id,
          {
            $set: {
              ...(cleanRoleName !== undefined ? { roleName: cleanRoleName } : {}),
              ...(description !== undefined ? { description } : {}),
              ...(permissions ? { permissions } : {})
            }
          },
          { new: true }
        ).lean();
      } catch (e) {}
    }

    const current = getRoles();
    const idx = current.findIndex(r => r._id === id || r.roleName === id);
    if (idx !== -1) {
      current[idx] = {
        ...current[idx],
        ...(cleanRoleName !== undefined ? { roleName: cleanRoleName } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(permissions ? { permissions } : {})
      };
      saveRoles(current);
      if (!updated) updated = current[idx];
    }

    return res.json({
      success: true,
      message: 'Role updated successfully',
      data: updated || { _id: id, roleName: cleanRoleName || roleName, permissions }
    });
  } catch (error) {
    console.error('Error updating role:', error);
    return res.status(500).json({ success: false, message: error.message || 'Error updating role' });
  }
});

// DELETE remove role
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (getIsConnected()) {
      try {
        await Role.findByIdAndDelete(id);
      } catch (e) {}
      try {
        // Also try deleting by roleName if id was a name string
        await Role.deleteMany({ roleName: id });
      } catch (e) {}
    }
    const current = getRoles();
    const filtered = current.filter(r => r._id !== id && r.roleName !== id);
    saveRoles(filtered);

    return res.json({ success: true, message: 'Role removed' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
