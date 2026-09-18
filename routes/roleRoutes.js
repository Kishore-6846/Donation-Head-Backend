const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/db');
const Role = require('../models/Role');
const { initialRoles } = require('../data/seedData');

const { getCollection, saveCollection } = require('../services/storageService');

const getRoles = () => getCollection('roles', initialRoles);
const saveRoles = (list) => saveCollection('roles', list);

router.get('/', async (req, res) => {
  try {
    if (getIsConnected()) {
      const roles = await Role.find().sort({ createdAt: -1 });
      return res.json({ success: true, data: roles });
    } else {
      return res.json({ success: true, data: getRoles() });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { roleName, description = '', permissions = {} } = req.body;
    if (!roleName) return res.status(400).json({ success: false, message: 'Role Name is required' });

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const dateStr = `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;

    if (getIsConnected()) {
      const role = await Role.create({
        roleName: roleName.trim(),
        description: description.trim(),
        permissions,
        created: dateStr
      });
      return res.status(201).json({ success: true, message: 'Role added successfully', data: role });
    } else {
      const newRole = {
        _id: `role_${Date.now()}`,
        roleName: roleName.trim(),
        description: description.trim(),
        permissions,
        created: dateStr
      };
      const current = getRoles();
      current.unshift(newRole);
      saveRoles(current);
      return res.status(201).json({ success: true, message: 'Role added successfully', data: newRole });
    }
  } catch (error) {
    console.error('Error adding role:', error);
    return res.status(500).json({ success: false, message: error.message || 'Error creating role' });
  }
});

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

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { roleName, description, permissions } = req.body;
    let updated = null;

    if (getIsConnected()) {
      try {
        updated = await Role.findByIdAndUpdate(
          id,
          { $set: { ...(roleName ? { roleName: roleName.trim() } : {}), ...(description !== undefined ? { description } : {}), ...(permissions ? { permissions } : {}) } },
          { new: true }
        ).lean();
      } catch (e) {}
    }

    const current = getRoles();
    const idx = current.findIndex(r => r._id === id);
    if (idx !== -1) {
      current[idx] = {
        ...current[idx],
        ...(roleName ? { roleName: roleName.trim() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(permissions ? { permissions } : {})
      };
      saveRoles(current);
      if (!updated) updated = current[idx];
    }

    return res.json({
      success: true,
      message: 'Role updated successfully',
      data: updated || { _id: id, roleName, permissions }
    });
  } catch (error) {
    console.error('Error updating role:', error);
    return res.status(500).json({ success: false, message: error.message || 'Error updating role' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (getIsConnected()) {
      try {
        await Role.findByIdAndDelete(id);
      } catch (e) {}
    }
    const current = getRoles();
    const filtered = current.filter(r => r._id !== id);
    saveRoles(filtered);

    return res.json({ success: true, message: 'Role removed' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
