const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/db');
const { getCollection, saveCollection } = require('../services/storageService');
const mongoose = require('mongoose');

const Certificate = require('../models/Certificate');

const getCertificatesList = () => getCollection('certificates', []);
const saveCertificatesList = (list) => saveCollection('certificates', list);

// GET /api/certificates
router.get('/', async (req, res) => {
  try {
    const { trustEmail, trustName, search } = req.query;
    let list = [];

    if (getIsConnected()) {
      try {
        const query = {};
        if (trustEmail) {
          query.$or = [
            { trustEmail: new RegExp(`^${trustEmail.trim()}$`, 'i') },
            { createdBy: new RegExp(`^${trustEmail.trim()}$`, 'i') }
          ];
        }
        if (search) {
          query.regNo = new RegExp(search.trim(), 'i');
        }
        list = await Certificate.find(query).sort({ createdAt: -1 }).lean();
      } catch (e) {
        console.warn('DB read error for certificates:', e.message);
      }
    }

    if (!list || list.length === 0) {
      const fileList = getCertificatesList();
      list = fileList.filter(c => {
        if (trustEmail && c.trustEmail && c.trustEmail.toLowerCase() !== trustEmail.toLowerCase()) {
          return false;
        }
        if (search && c.regNo && !c.regNo.toLowerCase().includes(search.toLowerCase())) {
          return false;
        }
        return true;
      });
    }

    return res.json({ success: true, data: list });
  } catch (error) {
    console.error('Error fetching certificates:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/certificates
router.post('/', async (req, res) => {
  try {
    const {
      regNo,
      validFrom = '',
      validUpto = '',
      page1 = '',
      page2 = '',
      trustEmail = '',
      trustName = '',
      createdBy = ''
    } = req.body;

    if (!regNo || !regNo.trim()) {
      return res.status(400).json({ success: false, message: '80G Registration Number is required' });
    }

    const newCert = {
      _id: `cert_${Date.now()}`,
      id: Date.now(),
      regNo: regNo.trim(),
      validFrom: validFrom.trim(),
      validUpto: validUpto.trim(),
      page1: page1 || '',
      page2: page2 || '',
      trustEmail: (trustEmail || '').trim().toLowerCase(),
      trustName: (trustName || '').trim(),
      createdBy: (createdBy || trustEmail || '').trim()
    };

    if (getIsConnected()) {
      try {
        const created = await Certificate.create(newCert);
        newCert._id = created._id ? created._id.toString() : created._id;
      } catch (dbErr) {
        console.warn('DB certificate create error:', dbErr.message);
      }
    }

    const fileList = getCertificatesList();
    fileList.unshift(newCert);
    saveCertificatesList(fileList);

    return res.json({ success: true, message: 'Certificate saved successfully', data: newCert });
  } catch (error) {
    console.error('Error saving certificate:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/certificates/:id and DELETE /api/certificates
const handleDeleteCert = async (req, res) => {
  try {
    const id = req.params.id || req.query.id || req.query._id || req.query.regNo;
    const regNo = req.query.regNo || req.body?.regNo;

    if (!id && !regNo) {
      return res.status(400).json({ success: false, message: 'Certificate identifier is required' });
    }

    if (getIsConnected()) {
      try {
        const orConditions = [];
        if (id) {
          if (typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/)) {
            orConditions.push({ _id: id });
          } else {
            orConditions.push({ _id: id });
            const numId = Number(id);
            if (!isNaN(numId) && numId > 0) {
              orConditions.push({ id: numId });
            }
          }
        }
        if (regNo) {
          orConditions.push({ regNo: regNo });
        }
        if (orConditions.length > 0) {
          await Certificate.deleteMany({ $or: orConditions });
        }
      } catch (e) {
        console.warn('DB delete error for certificate:', e.message);
      }
    }

    let fileList = getCertificatesList();
    fileList = fileList.filter(c => {
      const matchId = id && (String(c._id) === String(id) || String(c.id) === String(id));
      const matchReg = regNo && String(c.regNo).toLowerCase() === String(regNo).toLowerCase();
      return !matchId && !matchReg;
    });
    saveCertificatesList(fileList);

    return res.json({ success: true, message: 'Certificate deleted successfully' });
  } catch (error) {
    console.error('Error deleting certificate:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

router.delete('/:id', handleDeleteCert);
router.delete('/', handleDeleteCert);

module.exports = router;
