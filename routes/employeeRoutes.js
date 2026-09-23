const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/db');
const Employee = require('../models/Employee');
const { getCollection, saveCollection } = require('../services/storageService');

const initialEmployees = [];

const getEmployees = () => getCollection('employees', initialEmployees);
const saveEmployees = (list) => saveCollection('employees', list);

// Helper to generate next unique EMP ID (e.g. EMP-1, EMP-2, EMP-3...)
async function generateNextEmpId() {
  let maxNum = 0;
  if (getIsConnected()) {
    try {
      const emps = await Employee.find().select('empId').lean();
      for (const e of emps) {
        if (e.empId) {
          const match = String(e.empId).match(/EMP-(\d+)/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        }
      }
    } catch (e) {}
  }
  const localEmps = getEmployees();
  for (const e of localEmps) {
    if (e.empId) {
      const match = String(e.empId).match(/EMP-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
  }
  return `EMP-${maxNum + 1}`;
}

// GET /api/employees/next-id - Preview next sequential Employee ID
router.get('/next-id', async (req, res) => {
  try {
    const nextId = await generateNextEmpId();
    return res.json({ success: true, nextId });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/employees - List all employees
router.get('/', async (req, res) => {
  try {
    const { search, role, status } = req.query;
    let employeesList = [];

    if (getIsConnected()) {
      try {
        const query = {};
        if (status && status !== 'All') {
          query.status = { $regex: new RegExp(`^${status}$`, 'i') };
        }
        if (role && role !== 'All') {
          query.role = { $regex: new RegExp(`^${role}$`, 'i') };
        }
        if (search) {
          query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { empId: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
            { role: { $regex: search, $options: 'i' } }
          ];
        }
        const dbEmps = await Employee.find(query).sort({ createdAt: -1 }).lean();
        employeesList = dbEmps.map(e => ({
          _id: e._id ? e._id.toString() : e.empId,
          empId: e.empId,
          name: e.name,
          email: e.email,
          phone: e.phone || '',
          role: e.role,
          department: e.department || 'Customer Success',
          permissions: e.permissions || [],
          status: e.status || 'Active',
          joinedDate: e.joinedDate || (e.createdAt ? new Date(e.createdAt).toLocaleDateString('en-GB') : 'Today'),
          createdAt: e.createdAt || new Date().toISOString()
        }));
      } catch (e) {
        console.warn('DB employees fetch error, using storageService:', e.message);
        employeesList = getEmployees();
      }
    } else {
      employeesList = getEmployees();
    }

    if (status && status !== 'All') {
      employeesList = employeesList.filter(e => (e.status || 'Active').toLowerCase() === status.toLowerCase());
    }

    if (role && role !== 'All') {
      employeesList = employeesList.filter(e => (e.role || '').toLowerCase() === role.toLowerCase());
    }

    if (search) {
      const q = search.toLowerCase();
      employeesList = employeesList.filter(e =>
        (e.name && e.name.toLowerCase().includes(q)) ||
        (e.empId && e.empId.toLowerCase().includes(q)) ||
        (e.email && e.email.toLowerCase().includes(q)) ||
        (e.phone && e.phone.includes(q)) ||
        (e.role && e.role.toLowerCase().includes(q))
      );
    }

    return res.json({
      success: true,
      count: employeesList.length,
      data: employeesList
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    return res.status(500).json({ success: false, message: error.message, data: getEmployees() });
  }
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let emp = null;

    if (getIsConnected()) {
      try {
        emp = await Employee.findOne({ $or: [{ _id: id }, { empId: id }] }).lean();
      } catch (e) {}
    }

    if (!emp) {
      const emps = getEmployees();
      emp = emps.find(e => e._id === id || e.empId === id);
    }

    if (!emp) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    return res.json({ success: true, data: emp });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/employees - Create new employee
router.post('/', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      role,
      department,
      permissions,
      status
    } = req.body;

    const cleanName = (name || '').trim();
    if (!cleanName) {
      return res.status(400).json({ success: false, message: 'Employee Name is required' });
    }
    if (!/^[a-zA-Z\s.]+$/.test(cleanName)) {
      return res.status(400).json({ success: false, message: 'Name should only contain letters and spaces (no numbers or special characters).' });
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return res.status(400).json({ success: false, message: 'Corporate Email ID is required' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid corporate email address' });
    }

    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (!cleanPhone) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Mobile number must be exactly 10 digits' });
    }
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ success: false, message: 'Mobile number must start with 6, 7, 8, or 9' });
    }

    const cleanRole = (role || '').trim();
    if (!cleanRole || cleanRole.toLowerCase() === 'admin') {
      return res.status(400).json({ success: false, message: 'Admin role is not permitted for staff employees. Please select a valid staff role.' });
    }

    const empId = await generateNextEmpId();
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    const empDoc = {
      empId,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      role: cleanRole,
      department: department || 'Customer Success',
      permissions: Array.isArray(permissions) ? permissions : (typeof permissions === 'string' ? [permissions] : ['Manage Users', 'View Receipts']),
      status: status || 'Active',
      joinedDate: formattedDate,
      createdAt: new Date().toISOString()
    };

    let finalEmp = { ...empDoc };

    if (getIsConnected()) {
      try {
        const created = await Employee.create(empDoc);
        finalEmp = created.toObject ? created.toObject() : created;
        finalEmp._id = created._id ? created._id.toString() : empId;
      } catch (e) {
        console.warn('DB employee create error:', e.message);
        finalEmp._id = 'emp_' + Date.now();
      }
    } else {
      finalEmp._id = 'emp_' + Date.now();
    }

    const currentEmps = getEmployees();
    currentEmps.unshift(finalEmp);
    saveEmployees(currentEmps);

    return res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: finalEmp
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/employees/:id - Update employee
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (updates.name !== undefined) {
      const cleanName = (updates.name || '').trim();
      if (!cleanName) {
        return res.status(400).json({ success: false, message: 'Employee Name cannot be empty' });
      }
      if (!/^[a-zA-Z\s.]+$/.test(cleanName)) {
        return res.status(400).json({ success: false, message: 'Name should only contain letters and spaces.' });
      }
      updates.name = cleanName;
    }

    if (updates.email !== undefined) {
      const cleanEmail = (updates.email || '').trim().toLowerCase();
      if (!cleanEmail) {
        return res.status(400).json({ success: false, message: 'Corporate Email ID cannot be empty' });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ success: false, message: 'Please provide a valid corporate email address' });
      }
      updates.email = cleanEmail;
    }

    if (updates.phone !== undefined) {
      const cleanPhone = (updates.phone || '').replace(/\D/g, '');
      if (cleanPhone && cleanPhone.length !== 10) {
        return res.status(400).json({ success: false, message: 'Mobile number must be exactly 10 digits' });
      }
      if (cleanPhone && !/^[6-9]\d{9}$/.test(cleanPhone)) {
        return res.status(400).json({ success: false, message: 'Mobile number must start with 6, 7, 8, or 9' });
      }
      updates.phone = cleanPhone;
    }

    if (updates.role !== undefined) {
      const cleanRole = (updates.role || '').trim();
      if (cleanRole && cleanRole.toLowerCase() === 'admin') {
        return res.status(400).json({ success: false, message: 'Admin role is not permitted for staff employees.' });
      }
    }

    let updated = null;

    if (getIsConnected()) {
      try {
        updated = await Employee.findOneAndUpdate(
          { $or: [{ _id: id }, { empId: id }] },
          { $set: updates },
          { new: true }
        ).lean();
      } catch (e) {}
    }

    const currentEmps = getEmployees();
    const index = currentEmps.findIndex(e => e._id === id || e.empId === id);
    if (index !== -1) {
      currentEmps[index] = { ...currentEmps[index], ...updates };
      updated = currentEmps[index];
      saveEmployees(currentEmps);
    }

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    return res.json({
      success: true,
      message: 'Employee updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Error updating employee:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/employees/:id - Delete employee
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (getIsConnected()) {
      try {
        await Employee.findOneAndDelete({ $or: [{ _id: id }, { empId: id }] });
      } catch (e) {}
    }

    const currentEmps = getEmployees();
    const filtered = currentEmps.filter(e => e._id !== id && e.empId !== id);
    saveEmployees(filtered);

    return res.json({
      success: true,
      message: 'Employee deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting employee:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
module.exports.getEmployees = getEmployees;
