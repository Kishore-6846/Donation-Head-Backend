const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/db');
const Role = require('../models/Role');
const { initialRoles } = require('../data/seedData');

const { getCollection, saveCollection } = require('../services/storageService');

const getRoles = () => getCollection('roles', initialRoles);
const saveRoles = (list) => saveCollection('roles', list);

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
      if (r && r.roleName) roleMap.set(r.roleName.toLowerCase(), r);
    });
    (localRoles || []).forEach(r => {
      if (r && r.roleName && !roleMap.has(r.roleName.toLowerCase())) {
        roleMap.set(r.roleName.toLowerCase(), r);
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
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const dateStr = `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;

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
