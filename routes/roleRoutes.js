const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/db');
const Role = require('../models/Role');
const Staff = require('../models/Staff');
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

const escapeRegex = (string) => (string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET all roles (optionally filtered by trustEmail)
router.get('/', async (req, res) => {
  try {
    const { trustEmail, trustId } = req.query;
    let roles = [];

    const emailLower = (trustEmail || '').trim().toLowerCase();

    if (getIsConnected()) {
      try {
        let filter = {};
        if (emailLower || trustId) {
          filter = {
            $or: [
              ...(emailLower ? [{ trustEmail: emailLower }] : []),
              ...(trustId ? [{ trustId: trustId.toString() }] : [])
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
    const filteredLocal = (emailLower || trustId)
      ? (localRoles || []).filter(r =>
          (emailLower && r.trustEmail && r.trustEmail.toLowerCase() === emailLower) ||
          (trustId && r.trustId && r.trustId.toString() === trustId.toString())
        )
      : (localRoles || []);

    const roleMap = new Map();
    (roles || []).forEach(r => {
      if (r && r.roleName) {
        const item = {
          ...r,
          created: r.createdAt ? getISTDateString(r.createdAt) : (r.created ? getISTDateString(r.created) : getISTDateString(new Date()))
        };
        roleMap.set(r.roleName.trim().toLowerCase(), item);
      }
    });
    (filteredLocal || []).forEach(r => {
      if (r && r.roleName && !roleMap.has(r.roleName.trim().toLowerCase())) {
        const item = {
          ...r,
          created: r.createdAt ? getISTDateString(r.createdAt) : (r.created ? getISTDateString(r.created) : getISTDateString(new Date()))
        };
        roleMap.set(r.roleName.trim().toLowerCase(), item);
      }
    });

    return res.json({ success: true, data: Array.from(roleMap.values()) });
  } catch (error) {
    console.error('Error in GET /api/roles:', error);
    return res.json({ success: true, data: [] });
  }
});

// POST create a new role (strict case-insensitive duplicate check)
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

    const emailLower = (trustEmail || '').trim().toLowerCase();

    // Check if role with this name already exists for this trust in MongoDB (case-insensitive)
    let existingInDb = null;
    if (getIsConnected()) {
      try {
        const filter = {
          roleName: { $regex: new RegExp(`^${escapeRegex(cleanRoleName)}$`, 'i') }
        };
        if (emailLower || trustId) {
          filter.$or = [
            ...(emailLower ? [{ trustEmail: emailLower }] : []),
            ...(trustId ? [{ trustId: trustId.toString() }] : [])
          ];
        }
        existingInDb = await Role.findOne(filter).lean();
      } catch (dbErr) {
        console.error('Error checking duplicate role in MongoDB:', dbErr);
      }
    }

    // Check if role exists in fallback storage for this trust
    const currentRoles = getRoles();
    const existingInLocal = currentRoles.find(
      r => r.roleName && r.roleName.trim().toLowerCase() === cleanRoleName.toLowerCase() &&
           (!emailLower || (r.trustEmail && r.trustEmail.toLowerCase() === emailLower)) &&
           (!trustId || (r.trustId && r.trustId.toString() === trustId.toString()))
    );

    if (existingInDb || existingInLocal) {
      return res.status(400).json({
        success: false,
        message: `A member role with the name "${cleanRoleName}" already exists (case-insensitive). Duplicate roles like "${roleName}" are not allowed.`
      });
    }

    const now = new Date();
    const dateStr = getISTDateString(now);

    let savedRole = null;

    if (getIsConnected()) {
      try {
        savedRole = await Role.create({
          roleName: cleanRoleName,
          description: description.trim(),
          permissions,
          created: dateStr,
          trustEmail: emailLower,
          trustName: trustName || '',
          trustId: trustId || ''
        });
      } catch (dbErr) {
        console.error('Error saving role to MongoDB:', dbErr);
      }
    }

    // Always update fallback storage
    const fallbackRole = {
      _id: savedRole?._id?.toString() || `role_${Date.now()}`,
      roleName: cleanRoleName,
      description: description.trim(),
      permissions,
      created: dateStr,
      trustEmail: emailLower,
      trustName: trustName || '',
      trustId: trustId || ''
    };

    currentRoles.unshift(fallbackRole);
    saveRoles(currentRoles);

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
        if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
          role = await Role.findById(id).lean();
        }
        if (!role) {
          const cleanName = decodeURIComponent(id).trim();
          role = await Role.findOne({ roleName: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') }).lean();
        }
      } catch (e) {}
    }
    if (!role) {
      const all = getRoles();
      role = all.find(r => r._id === id || r.roleName?.toLowerCase() === id.toLowerCase());
    }
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    return res.json({ success: true, data: role });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT update role (case-insensitive duplicate check against other roles)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { roleName, description, permissions, trustEmail } = req.body;
    let updated = null;
    const cleanRoleName = roleName !== undefined ? (roleName || '').replace(/[^a-zA-Z\s]/g, '').trim() : undefined;

    if (cleanRoleName !== undefined) {
      if (!cleanRoleName) {
        return res.status(400).json({
          success: false,
          message: 'Role Name cannot be empty and must contain letters and spaces only'
        });
      }

      // Check if another role already has this name case-insensitively
      if (getIsConnected()) {
        try {
          const dupFilter = {
            roleName: { $regex: new RegExp(`^${escapeRegex(cleanRoleName)}$`, 'i') }
          };
          if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
            dupFilter._id = { $ne: id };
          }
          if (trustEmail) {
            dupFilter.$or = [{ trustEmail: trustEmail.trim().toLowerCase() }, { trustEmail: '' }, { trustEmail: { $exists: false } }];
          }
          const dupRole = await Role.findOne(dupFilter).lean();
          if (dupRole && String(dupRole._id) !== String(id)) {
            return res.status(400).json({
              success: false,
              message: `Another member role with the name "${cleanRoleName}" already exists (case-insensitive).`
            });
          }
        } catch (e) {}
      }

      const current = getRoles();
      const dupLocal = current.find(
        r => r._id !== id && r.roleName?.toLowerCase() !== id.toLowerCase() &&
             r.roleName && r.roleName.trim().toLowerCase() === cleanRoleName.toLowerCase()
      );
      if (dupLocal) {
        return res.status(400).json({
          success: false,
          message: `Another member role with the name "${cleanRoleName}" already exists (case-insensitive).`
        });
      }
    }

    if (getIsConnected()) {
      try {
        if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
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
        } else {
          const cleanName = decodeURIComponent(id).trim();
          updated = await Role.findOneAndUpdate(
            { roleName: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') },
            {
              $set: {
                ...(cleanRoleName !== undefined ? { roleName: cleanRoleName } : {}),
                ...(description !== undefined ? { description } : {}),
                ...(permissions ? { permissions } : {})
              }
            },
            { new: true }
          ).lean();
        }
      } catch (e) {}
    }

    const current = getRoles();
    const idx = current.findIndex(r => r._id === id || r.roleName?.toLowerCase() === id.toLowerCase());
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
    const { trustEmail, trustId } = req.query;

    let targetRoleName = '';
    let roleDoc = null;

    if (getIsConnected()) {
      try {
        if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
          roleDoc = await Role.findById(id).lean();
        }
        if (!roleDoc) {
          const cleanName = decodeURIComponent(id).trim();
          roleDoc = await Role.findOne({ roleName: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') }).lean();
        }
      } catch (e) {}
    }

    if (!roleDoc) {
      const current = getRoles();
      roleDoc = current.find(r => r._id === id || r.roleName?.toLowerCase() === id.toLowerCase() || r.id === id);
    }

    targetRoleName = roleDoc?.roleName || decodeURIComponent(id).trim();

    // Check if any active staff members are assigned to this role
    let activeStaffCount = 0;
    if (getIsConnected()) {
      try {
        const staffQuery = {
          role: new RegExp(`^${escapeRegex(targetRoleName)}$`, 'i'),
          status: 'Active'
        };
        if (trustEmail) {
          staffQuery.trustEmail = new RegExp(`^${escapeRegex(trustEmail.trim())}$`, 'i');
        }
        activeStaffCount = await Staff.countDocuments(staffQuery);
      } catch (e) {}
    }

    if (activeStaffCount === 0) {
      const allStaff = getCollection('staff', []);
      const matched = allStaff.filter(s =>
        (s.role || '').trim().toLowerCase() === targetRoleName.toLowerCase() &&
        (s.status || 'Active').toLowerCase() === 'active' &&
        (!trustEmail || (s.trustEmail || '').toLowerCase() === trustEmail.toLowerCase())
      );
      activeStaffCount = matched.length;
    }

    if (activeStaffCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role "${targetRoleName}" because there are ${activeStaffCount} active staff member(s) assigned to it. Please deactivate, reassign, or remove the active staff members first.`
      });
    }

    const emailLower = (trustEmail || '').trim().toLowerCase();

    if (getIsConnected()) {
      try {
        if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
          await Role.findByIdAndDelete(id);
        } else {
          const deleteFilter = {
            roleName: new RegExp(`^${escapeRegex(targetRoleName)}$`, 'i')
          };
          if (emailLower) {
            deleteFilter.trustEmail = emailLower;
          }
          await Role.deleteMany(deleteFilter);
        }
      } catch (e) {}
    }

    const current = getRoles();
    const filtered = current.filter(r => {
      const matchId = (r._id === id || r.id === id);
      const matchName = r.roleName?.trim().toLowerCase() === targetRoleName.trim().toLowerCase();
      const matchTrust = !emailLower || (r.trustEmail && r.trustEmail.toLowerCase() === emailLower);
      return !(matchId || (matchName && matchTrust));
    });
    saveRoles(filtered);

    return res.json({ success: true, message: 'Role removed successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
