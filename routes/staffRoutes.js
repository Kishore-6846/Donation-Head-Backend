const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/db');
const Staff = require('../models/Staff');
const User = require('../models/User');
const Role = require('../models/Role');
const { initialRoles } = require('../data/seedData');
const { getCollection, saveCollection } = require('../services/storageService');

const initialStaff = [];
const getStaff = () => getCollection('staff', initialStaff);
const saveStaff = (list) => saveCollection('staff', list);

const escapeRegex = (string) => (string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Helper to verify if a role exists case-insensitively in Member Roles
const checkRoleExists = async (roleName, trustEmail, trustId) => {
  if (!roleName) return false;
  const cleanRole = roleName.trim();
  if (!cleanRole) return false;
  const emailLower = (trustEmail || '').trim().toLowerCase();

  // 1. Check MongoDB
  if (getIsConnected()) {
    try {
      const filter = {
        roleName: { $regex: new RegExp(`^${escapeRegex(cleanRole)}$`, 'i') }
      };
      if (emailLower || trustId) {
        filter.$or = [
          ...(emailLower ? [{ trustEmail: emailLower }] : []),
          ...(trustId ? [{ trustId: trustId.toString() }] : [])
        ];
      }
      const found = await Role.findOne(filter).lean();
      if (found) return true;
    } catch (e) {
      console.warn('DB check role exists error:', e.message);
    }
  }

  // 2. Check disk / fallback storage
  const diskRoles = getCollection('roles', initialRoles || []);
  const foundLocal = diskRoles.find(r =>
    r.roleName && r.roleName.trim().toLowerCase() === cleanRole.toLowerCase() &&
    (!emailLower || (r.trustEmail && r.trustEmail.toLowerCase() === emailLower)) &&
    (!trustId || (r.trustId && r.trustId.toString() === trustId.toString()))
  );
  return Boolean(foundLocal);
};

// Helper to update trust staff count
const syncTrustStaffCount = async (trustEmail, trustId, trustName) => {
  try {
    if (!trustEmail && !trustId && !trustName) return;
    const emailLower = (trustEmail || '').trim().toLowerCase();
    const strId = (trustId || '').toString();
    const nameClean = (trustName || '').trim();

    let count = 0;

    if (getIsConnected()) {
      try {
        const query = {
          $or: [
            ...(emailLower ? [{ trustEmail: emailLower }] : []),
            ...(strId ? [{ trustId: strId }] : []),
            ...(nameClean ? [{ trustName: nameClean }] : [])
          ]
        };
        count = await Staff.countDocuments(query);
        const userQuery = {
          $or: [
            ...(emailLower ? [{ email: emailLower }] : []),
            ...(strId && strId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: strId }] : []),
            ...(nameClean ? [{ trustName: nameClean }, { name: nameClean }] : [])
          ]
        };
        await User.updateMany(userQuery, { $set: { staffCount: count } });
      } catch (e) {
        console.warn('DB sync error:', e.message);
      }
    }

    // Also sync disk storage users.json
    try {
      const diskUsers = getCollection('users', []);
      const allStaff = getStaff();
      const diskCount = allStaff.filter(s =>
        (emailLower && s.trustEmail && s.trustEmail.toLowerCase() === emailLower) ||
        (strId && s.trustId && s.trustId.toString() === strId) ||
        (nameClean && s.trustName && s.trustName.toLowerCase() === nameClean.toLowerCase())
      ).length;

      let changed = false;
      const updatedUsers = diskUsers.map(u => {
        const match = (emailLower && u.email && u.email.toLowerCase() === emailLower) ||
                      (strId && (String(u._id) === strId || String(u.id) === strId)) ||
                      (nameClean && (u.trustName?.toLowerCase() === nameClean.toLowerCase() || u.name?.toLowerCase() === nameClean.toLowerCase()));
        if (match) {
          changed = true;
          return { ...u, staffCount: getIsConnected() ? count : diskCount };
        }
        return u;
      });
      if (changed) {
        saveCollection('users', updatedUsers);
      }
    } catch (e) {
      console.warn('Disk sync error:', e.message);
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

    if (!name || !email || !phone) {
      return res.status(400).json({ success: false, message: 'Name, email, and mobile number are required' });
    }

    const cleanName = (name || '').replace(/[^a-zA-Z\s.]/g, '').trim();
    if (!cleanName) {
      return res.status(400).json({ success: false, message: 'Name should only contain letters and spaces' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }

    const cleanPhone = (phone || '').replace(/\D/g, '').slice(0, 10);
    if (!cleanPhone || cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Mobile number must be exactly 10 digits' });
    }
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ success: false, message: 'Mobile number must start with 6, 7, 8, or 9' });
    }

    // Check Plan Limits & Trust User
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

    const cleanEmail = email.trim().toLowerCase();

    // Check if duplicate of Trust Admin account email or mobile
    if (trustUser) {
      if (trustUser.email && trustUser.email.toLowerCase().trim() === cleanEmail) {
        return res.status(400).json({
          success: false,
          message: 'This Email ID is already in use by the Trust Admin account. Please use a different email.'
        });
      }
      const adminMobile = (trustUser.mobile || trustUser.phone || '').replace(/\D/g, '').slice(-10);
      if (adminMobile && adminMobile === cleanPhone) {
        return res.status(400).json({
          success: false,
          message: 'This Mobile Number is already in use by the Trust Admin account. Please use a different mobile number.'
        });
      }
    }

    // Check if staff member with same email or mobile already exists
    let duplicateStaffEmail = null;
    let duplicateStaffPhone = null;

    if (getIsConnected()) {
      try {
        duplicateStaffEmail = await Staff.findOne({ email: cleanEmail }).lean();
        duplicateStaffPhone = await Staff.findOne({ phone: cleanPhone }).lean();
      } catch (e) {
        console.warn('DB check duplicate staff error:', e.message);
      }
    } else {
      const allStaff = getStaff();
      duplicateStaffEmail = allStaff.find(s => s.email && s.email.toLowerCase().trim() === cleanEmail);
      duplicateStaffPhone = allStaff.find(s => s.phone && s.phone.replace(/\D/g, '').slice(-10) === cleanPhone);
    }

    if (duplicateStaffEmail) {
      return res.status(400).json({
        success: false,
        message: 'A staff member with this Email ID already exists. Please use a different email address.'
      });
    }

    if (duplicateStaffPhone) {
      return res.status(400).json({
        success: false,
        message: 'A staff member with this Mobile Number already exists. Please use a different mobile number.'
      });
    }

    if (trustUser) {
      const planName = trustUser.plan || 'Standard';
      const planLower = planName.toLowerCase();
      let baseAllowed = 2; // Standard plan default is 2 staff users
      if (planLower.includes('basic') || planLower.includes('starter')) {
        baseAllowed = 1;
      } else if (planLower.includes('standard')) {
        baseAllowed = 2;
      } else if (planLower.includes('advanced')) {
        baseAllowed = 9;
      } else if (planLower.includes('enterprise')) {
        baseAllowed = 999;
      } else {
        baseAllowed = 2;
      }

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
    const staffRole = (role || 'Staff Member').trim();
    const staffStatus = status || 'Active';
    const emailLower = trustEmail ? trustEmail.trim().toLowerCase() : '';

    // Check if role exists in Member Roles when adding an Active staff member
    if (staffStatus === 'Active') {
      const roleExists = await checkRoleExists(staffRole, emailLower);
      if (!roleExists) {
        return res.status(400).json({
          success: false,
          message: `Cannot add active staff member because the role "${staffRole}" does not exist in Member Roles. Please create this role in Member Roles first or add the staff as Inactive.`
        });
      }
    }

    const memberData = {
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      role: staffRole,
      status: staffStatus,
      trustEmail: emailLower,
      trustId: trustId ? trustId.toString() : '',
      trustName: trustName ? trustName.trim() : ''
    };

    if (getIsConnected()) {
      try {
        createdMember = await Staff.create(memberData);
        await syncTrustStaffCount(memberData.trustEmail, memberData.trustId, memberData.trustName);
      } catch (e) {
        console.warn('DB error creating staff:', e.message);
        if (e.code === 11000) {
          const field = Object.keys(e.keyPattern || {})[0] || 'email or mobile';
          return res.status(400).json({
            success: false,
            message: `A staff member with this ${field} already exists.`
          });
        }
        return res.status(400).json({
          success: false,
          message: e.message || 'Failed to add staff member.'
        });
      }
    }

    if (!getIsConnected() || createdMember) {
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
    if (updateData.name !== undefined) {
      const cleanName = (updateData.name || '').replace(/[^a-zA-Z\s.]/g, '').trim();
      if (!cleanName) {
        return res.status(400).json({ success: false, message: 'Name should only contain letters and spaces' });
      }
      updateData.name = cleanName;
    }
    if (updateData.phone !== undefined) {
      const cleanPhone = (updateData.phone || '').replace(/\D/g, '').slice(-10);
      if (!cleanPhone || cleanPhone.length !== 10) {
        return res.status(400).json({ success: false, message: 'Mobile number must be exactly 10 digits' });
      }
      if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
        return res.status(400).json({ success: false, message: 'Mobile number must start with 6, 7, 8, or 9' });
      }
      updateData.phone = cleanPhone;
    }

    // Check duplicate email
    if (updateData.email) {
      let dupEmail = null;
      if (getIsConnected()) {
        try {
          dupEmail = await Staff.findOne({ _id: { $ne: id }, email: updateData.email }).lean();
        } catch (e) {}
      } else {
        const allStaff = getStaff();
        dupEmail = allStaff.find(s => s._id !== id && s.id !== id && s.email && s.email.toLowerCase().trim() === updateData.email);
      }
      if (dupEmail) {
        return res.status(400).json({
          success: false,
          message: 'Another staff member with this Email ID already exists.'
        });
      }
    }

    // Check duplicate phone
    if (updateData.phone) {
      let dupPhone = null;
      if (getIsConnected()) {
        try {
          dupPhone = await Staff.findOne({ _id: { $ne: id }, phone: updateData.phone }).lean();
        } catch (e) {}
      } else {
        const allStaff = getStaff();
        dupPhone = allStaff.find(s => s._id !== id && s.id !== id && s.phone && s.phone.replace(/\D/g, '').slice(-10) === updateData.phone);
      }
      if (dupPhone) {
        return res.status(400).json({
          success: false,
          message: 'Another staff member with this Mobile Number already exists.'
        });
      }
    }

    // Fetch existing staff to verify current status/role
    let existingStaff = null;
    if (getIsConnected()) {
      try {
        if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
          existingStaff = await Staff.findById(id).lean();
        }
        if (!existingStaff) {
          const cleanEmail = decodeURIComponent(id).trim().toLowerCase();
          existingStaff = await Staff.findOne({
            $or: [{ _id: id }, { email: new RegExp(`^${escapeRegex(cleanEmail)}$`, 'i') }]
          }).lean();
        }
      } catch (e) {}
    }
    if (!existingStaff) {
      const allStaff = getStaff();
      existingStaff = allStaff.find(s =>
        s._id === id || s.id === id || (s.email && s.email.toLowerCase() === decodeURIComponent(id).trim().toLowerCase())
      );
    }

    const targetStatus = updateData.status !== undefined ? updateData.status : (existingStaff?.status || 'Active');
    const targetRole = (updateData.role !== undefined ? updateData.role : (existingStaff?.role || '')).trim();
    const effectiveTrustEmail = updateData.trustEmail || existingStaff?.trustEmail || '';

    // If activating staff or keeping active, ensure the assigned role exists in Member Roles
    if (targetStatus === 'Active') {
      if (!targetRole) {
        return res.status(400).json({
          success: false,
          message: 'Cannot activate staff member without an assigned role.'
        });
      }
      const roleExists = await checkRoleExists(targetRole, effectiveTrustEmail);
      if (!roleExists) {
        return res.status(400).json({
          success: false,
          message: `Cannot activate staff member because their assigned role "${targetRole}" does not exist in Member Roles. Please recreate this role in Member Roles or assign an existing role before activating.`
        });
      }
    }

    let updatedMember = null;
    if (getIsConnected()) {
      try {
        if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
          updatedMember = await Staff.findByIdAndUpdate(id, { $set: updateData }, { new: true });
        } else {
          const cleanEmail = decodeURIComponent(id).trim();
          updatedMember = await Staff.findOneAndUpdate(
            { $or: [{ _id: id }, { email: new RegExp(`^${escapeRegex(cleanEmail)}$`, 'i') }] },
            { $set: updateData },
            { new: true }
          );
        }
        if (updatedMember) {
          await syncTrustStaffCount(updatedMember.trustEmail, updatedMember.trustId, updatedMember.trustName);
        }
      } catch (e) {
        console.warn('DB error updating staff:', e.message);
        if (e.code === 11000) {
          const field = Object.keys(e.keyPattern || {})[0] || 'email or mobile';
          return res.status(400).json({
            success: false,
            message: `Another staff member with this ${field} already exists.`
          });
        }
        return res.status(400).json({
          success: false,
          message: e.message || 'Failed to update staff member.'
        });
      }
    }

    const all = getStaff();
    const cleanId = String(id || '').trim().toLowerCase();
    const idx = all.findIndex(s =>
      (s._id && String(s._id).toLowerCase() === cleanId) ||
      (s.id && String(s.id).toLowerCase() === cleanId) ||
      (s.email && s.email.toLowerCase() === cleanId)
    );
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...updateData };
      saveStaff(all);
      if (!updatedMember) updatedMember = all[idx];
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
        if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
          deleted = await Staff.findByIdAndDelete(id);
        } else {
          const cleanEmail = decodeURIComponent(id).trim();
          deleted = await Staff.findOneAndDelete({
            $or: [
              { _id: id },
              { email: new RegExp(`^${escapeRegex(cleanEmail)}$`, 'i') }
            ]
          });
        }
        if (deleted) {
          await syncTrustStaffCount(deleted.trustEmail, deleted.trustId, deleted.trustName);
        }
      } catch (e) {
        console.warn('DB error deleting staff:', e.message);
      }
    }

    const all = getStaff();
    const cleanId = String(id || '').trim().toLowerCase();
    const diskDeleted = all.find(s =>
      (s._id && String(s._id).toLowerCase() === cleanId) ||
      (s.id && String(s.id).toLowerCase() === cleanId) ||
      (s.email && s.email.toLowerCase() === cleanId)
    );
    const filtered = all.filter(s =>
      !(
        (s._id && String(s._id).toLowerCase() === cleanId) ||
        (s.id && String(s.id).toLowerCase() === cleanId) ||
        (s.email && s.email.toLowerCase() === cleanId)
      )
    );
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
