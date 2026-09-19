const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/db');
const Employee = require('../models/Employee');
const { getCollection, saveCollection } = require('../services/storageService');

const initialEmployees = [];

const getEmployees = () => getCollection('employees', initialEmployees);
const saveEmployees = (list) => saveCollection('employees', list);

// Helper to generate next unique EMP ID
async function generateNextEmpId() {
  let maxNum = 0;
  if (getIsConnected()) {
    try {
      const emps = await Employee.find().select('empId').lean();
      for (const e of emps) {
        if (e.empId && e.empId.startsWith('EMP-')) {
          const num = parseInt(e.empId.replace('EMP-', ''), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      }
    } catch (e) {}
  }
  const localEmps = getEmployees();
  for (const e of localEmps) {
    if (e.empId && e.empId.startsWith('EMP-')) {
      const num = parseInt(e.empId.replace('EMP-', ''), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  const nextSeq = String(maxNum + 1).padStart(3, '0');
  return `EMP-${nextSeq}`;
}

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
          department: e.department || 'Platform Operations',
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

    if (!name || !email || !role) {
      return res.status(400).json({ success: false, message: 'Name, email, and role are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }

    const cleanPhone = (phone || '').replace(/\D/g, '').slice(0, 10);
    if (phone && cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Mobile number must be exactly 10 digits' });
    }

    const empId = await generateNextEmpId();
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    const empDoc = {
      empId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone || '',
      role: role.trim(),
      department: department || 'Platform Operations',
      permissions: Array.isArray(permissions) ? permissions : (typeof permissions === 'string' ? [permissions] : ['View Dashboard', 'Manage Users', 'View Reports']),
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
