const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/db');
const Staff = require('../models/Staff');
const User = require('../models/User');
const { getCollection, saveCollection } = require('../services/storageService');

const initialStaff = [];
const getStaff = () => getCollection('staff', initialStaff);
const saveStaff = (list) => saveCollection('staff', list);

// Helper to update trust staff count
const syncTrustStaffCount = async (trustEmail, trustId, trustName) => {
  try {
    if (!trustEmail && !trustId && !trustName) return;
    if (getIsConnected()) {
      const query = {
        $or: [
          ...(trustEmail ? [{ trustEmail: trustEmail.toLowerCase() }] : []),
          ...(trustId ? [{ trustId: trustId.toString() }] : []),
          ...(trustName ? [{ trustName: trustName }] : [])
        ]
      };
      const count = await Staff.countDocuments(query);
      const userQuery = {
        $or: [
          ...(trustEmail ? [{ email: trustEmail.toLowerCase() }] : []),
          ...(trustId && trustId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: trustId }] : []),
          ...(trustName ? [{ trustName: trustName }, { name: trustName }] : [])
        ]
      };
      await User.updateMany(userQuery, { $set: { staffCount: count } });
    }
  } catch (e) {
    console.warn('Error syncing trust staff count:', e.message);
  }
};

// GET /api/staff - List staff members
router.get('/', async (req, res) => {
  try {
    const { trustEmail, trustId, trustName, search } = req.query;
    let staffList = null;

    if (getIsConnected()) {
      try {
        const query = {};
        if (trustEmail || trustId || trustName) {
          query.$or = [
            ...(trustEmail ? [{ trustEmail: trustEmail.toLowerCase() }] : []),
            ...(trustId ? [{ trustId: trustId.toString() }] : []),
            ...(trustName ? [{ trustName: trustName }] : [])
          ];
        }
        if (search) {
          const sRegex = new RegExp(search, 'i');
          const searchClause = { $or: [{ name: sRegex }, { email: sRegex }, { role: sRegex }, { phone: sRegex }] };
          if (query.$or) {
            query.$and = [{ $or: query.$or }, searchClause];
            delete query.$or;
          } else {
            Object.assign(query, searchClause);
          }
        }
        staffList = await Staff.find(query).sort({ createdAt: -1 }).lean();
      } catch (e) {
        console.warn('DB error fetching staff:', e.message);
      }
    }

    if (staffList === null) {
      const all = getStaff();
      staffList = all;
      if (trustEmail || trustId || trustName) {
        staffList = staffList.filter(s =>
          (trustEmail && s.trustEmail && s.trustEmail.toLowerCase() === trustEmail.toLowerCase()) ||
          (trustId && s.trustId === trustId) ||
          (trustName && s.trustName && s.trustName.toLowerCase() === trustName.toLowerCase())
        );
      }
      if (search) {
        const q = search.toLowerCase();
        staffList = staffList.filter(s =>
          (s.name && s.name.toLowerCase().includes(q)) ||
          (s.email && s.email.toLowerCase().includes(q)) ||
          (s.role && s.role.toLowerCase().includes(q)) ||
          (s.phone && s.phone.includes(q))
        );
      }
    }

    return res.json({
      success: true,
      count: staffList.length,
      data: staffList
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/staff - Add new staff member
router.post('/', async (req, res) => {
  try {
    const {
      name,
      email,
      phone = '',
      role = 'Staff Member',
      status = 'Active',
      trustEmail = '',
      trustId = '',
      trustName = ''
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    // Check Plan Limits
    const queryEmail = (trustEmail || '').toLowerCase().trim();
    let trustUser = null;
    if (queryEmail || trustId || trustName) {
      if (getIsConnected()) {
        try {
          trustUser = await User.findOne({
            $or: [
              ...(queryEmail ? [{ email: queryEmail }] : []),
              ...(trustId && trustId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: trustId }] : []),
              ...(trustName ? [{ trustName }, { name: trustName }] : [])
            ]
          }).lean();
        } catch (e) {}
      }
      if (!trustUser) {
        const diskUsers = getCollection('users', []);
        trustUser = diskUsers.find(u =>
          (queryEmail && u.email && u.email.toLowerCase() === queryEmail) ||
          (trustId && (u._id === trustId || u.id === trustId)) ||
          (trustName && (u.trustName === trustName || u.name === trustName))
        );
      }
    }

    if (trustUser) {
      const planName = trustUser.plan || 'Standard';
      const planLower = planName.toLowerCase();
      let baseAllowed = 4; // Standard plan default is 4
      if (planLower.includes('enterprise')) baseAllowed = 999;
      else if (planLower.includes('advanced')) baseAllowed = 9;
      else if (planLower.includes('starter')) baseAllowed = 1;
      else baseAllowed = 4;

      const extraPurchased = Number(trustUser.extraStaffUsers || trustUser.purchasedStaffUsers || 0);
      const totalAllowed = baseAllowed === 999 ? 999 : (baseAllowed + extraPurchased);

      // Count existing staff
      let existingCount = 0;
      if (getIsConnected()) {
        try {
          existingCount = await Staff.countDocuments({
            $or: [
              ...(queryEmail ? [{ trustEmail: queryEmail }] : []),
              ...(trustId ? [{ trustId: trustId.toString() }] : []),
              ...(trustName ? [{ trustName }] : [])
            ]
          });
        } catch (e) {}
      } else {
        const allStaff = getStaff();
        existingCount = allStaff.filter(s =>
          (queryEmail && s.trustEmail && s.trustEmail.toLowerCase() === queryEmail) ||
          (trustId && s.trustId === trustId) ||
          (trustName && s.trustName && s.trustName.toLowerCase() === (trustName || '').toLowerCase())
        ).length;
      }

      if (totalAllowed !== 999 && existingCount >= totalAllowed) {
        return res.status(400).json({
          success: false,
          message: `Staff member limit reached (${totalAllowed} allowed on ${planName} plan). Please purchase additional users to add more staff.`
        });
      }
    }

    let createdMember = null;
    const memberData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      role: role.trim() || 'Staff Member',
      status: status || 'Active',
      trustEmail: trustEmail ? trustEmail.trim().toLowerCase() : '',
      trustId: trustId ? trustId.toString() : '',
      trustName: trustName ? trustName.trim() : ''
    };

    if (getIsConnected()) {
      try {
        createdMember = await Staff.create(memberData);
        await syncTrustStaffCount(memberData.trustEmail, memberData.trustId, memberData.trustName);
      } catch (e) {
        console.warn('DB error creating staff:', e.message);
      }
    }

    const all = getStaff();
    const diskMember = {
      _id: createdMember ? createdMember._id.toString() : `staff_${Date.now()}`,
      ...memberData,
      createdAt: createdMember?.createdAt || new Date().toISOString()
    };
    all.unshift(diskMember);
    saveStaff(all);

    if (!createdMember) {
      createdMember = diskMember;
    }

    return res.status(201).json({
      success: true,
      message: 'Staff member added successfully',
      data: createdMember
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/staff/:id - Update staff member
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    if (updateData.email) updateData.email = updateData.email.trim().toLowerCase();
    if (updateData.name) updateData.name = updateData.name.trim();

    let updatedMember = null;
    if (getIsConnected()) {
      try {
        updatedMember = await Staff.findByIdAndUpdate(id, { $set: updateData }, { new: true });
        if (updatedMember) {
          await syncTrustStaffCount(updatedMember.trustEmail, updatedMember.trustId, updatedMember.trustName);
        }
      } catch (e) {
        console.warn('DB error updating staff:', e.message);
      }
    }

    if (!updatedMember) {
      const all = getStaff();
      const idx = all.findIndex(s => s._id === id);
      if (idx !== -1) {
        all[idx] = { ...all[idx], ...updateData };
        saveStaff(all);
        updatedMember = all[idx];
      }
    }

    if (!updatedMember) {
      return res.status(404).json({ success: false, message: 'Staff member not found' });
    }

    return res.json({
      success: true,
      message: 'Staff member updated successfully',
      data: updatedMember
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/staff/:id - Remove staff member
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let deleted = null;

    if (getIsConnected()) {
      try {
        deleted = await Staff.findByIdAndDelete(id);
        if (deleted) {
          await syncTrustStaffCount(deleted.trustEmail, deleted.trustId, deleted.trustName);
        }
      } catch (e) {
        console.warn('DB error deleting staff:', e.message);
      }
    }

    const all = getStaff();
    const diskDeleted = all.find(s => s._id === id || s.email === id);
    const filtered = all.filter(s => s._id !== id && s.email !== id);
    saveStaff(filtered);

    const emailToSync = deleted?.trustEmail || diskDeleted?.trustEmail;
    const idToSync = deleted?.trustId || diskDeleted?.trustId;
    const nameToSync = deleted?.trustName || diskDeleted?.trustName;
    await syncTrustStaffCount(emailToSync, idToSync, nameToSync);

    return res.json({ success: true, message: 'Staff member removed successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
