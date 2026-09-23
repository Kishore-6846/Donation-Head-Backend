const bcrypt = require('bcryptjs');
const { getIsConnected } = require('../config/db');
const User = require('../models/User');
const DonationReceipt = require('../models/DonationReceipt');
const Staff = require('../models/Staff');
const Plan = require('../models/Plan');
const { getCollection, saveCollection } = require('../services/storageService');

const initialUsers = [];
const getUsers = () => getCollection('users', initialUsers);
const saveUsers = (list) => saveCollection('users', list);

/**
 * Controller: Get All Users (Trusts) with stats
 */
const getAllUsers = async (req, res) => {
  try {
    const { search, plan, status } = req.query;
    let usersList = null;

    if (getIsConnected()) {
      try {
        const query = {
          $and: [
            { role: { $not: /super/i } },
            { isSuperAdmin: { $ne: true } }
          ]
        };
        if (status && status !== 'All') {
          query.status = { $regex: new RegExp(`^${status}$`, 'i') };
        }
        if (plan && plan !== 'All') {
          query.plan = { $regex: new RegExp(`^${plan}$`, 'i') };
        }
        if (search) {
          query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { trustName: { $regex: search, $options: 'i' } }
          ];
        }
        usersList = await User.find(query).sort({ createdAt: -1 }).lean();
      } catch (e) {
        console.warn('MongoDB getAllUsers error:', e.message);
      }
    }

    if (!usersList) {
      let filtered = getUsers().filter(u => !u.isSuperAdmin && (!u.role || !u.role.toLowerCase().includes('super')));
      if (status && status !== 'All') {
        filtered = filtered.filter(u => (u.status || '').toLowerCase() === status.toLowerCase());
      }
      if (plan && plan !== 'All') {
        filtered = filtered.filter(u => (u.plan || '').toLowerCase() === plan.toLowerCase());
      }
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(u =>
          (u.name && u.name.toLowerCase().includes(s)) ||
          (u.email && u.email.toLowerCase().includes(s)) ||
          (u.trustName && u.trustName.toLowerCase().includes(s))
        );
      }
      usersList = filtered;
    }

    return res.json({
      success: true,
      count: usersList.length,
      data: usersList
    });
  } catch (error) {
    console.error('Error fetching users in userController:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Controller: Get Single User by ID
 */
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    let user = null;

    if (getIsConnected()) {
      try {
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
          user = await User.findById(id).lean();
        } else {
          user = await User.findOne({ $or: [{ _id: id }, { email: id }] }).lean();
        }
      } catch (e) {}
    }

    if (!user) {
      const users = getUsers();
      user = users.find(u => u._id === id || u.id === id || u.email === id);
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, data: user });
  } catch (error) {
    console.error('Error in getUserById:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Controller: Update User Profile / Settings
 */
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    let updated = null;
    if (getIsConnected()) {
      try {
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
          updated = await User.findByIdAndUpdate(id, updates, { new: true }).lean();
        } else {
          updated = await User.findOneAndUpdate({ $or: [{ _id: id }, { email: id }] }, updates, { new: true }).lean();
        }
      } catch (e) {}
    }

    const users = getUsers();
    const idx = users.findIndex(u => u._id === id || u.id === id || u.email === id);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...updates, updatedAt: new Date().toISOString() };
      saveUsers(users);
      if (!updated) updated = users[idx];
    }

    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, message: 'User updated successfully', data: updated });
  } catch (error) {
    console.error('Error updating user in userController:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Controller: Delete User
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (getIsConnected()) {
      try {
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
          await User.findByIdAndDelete(id);
        } else {
          await User.findOneAndDelete({ $or: [{ _id: id }, { email: id }] });
        }
      } catch (e) {}
    }

    const users = getUsers();
    const filtered = users.filter(u => u._id !== id && u.id !== id && u.email !== id);
    saveUsers(filtered);

    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user in userController:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUsers,
  saveUsers
};
