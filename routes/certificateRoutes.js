const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/db');
const { getCollection, saveCollection } = require('../services/storageService');
const mongoose = require('mongoose');

const Certificate = require('../models/Certificate');
const {
  compressImageString,
  decompressImageString,
  prepareCertificateForStorage,
  hydrateCertificate
} = require('../utils/imageCompressor');

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
        list = await Certificate.find(query).maxTimeMS(10000).sort({ createdAt: -1 }).lean();
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

    // Decompress image data losslessly for client rendering
    const hydratedList = list.map(c => hydrateCertificate(c));

    return res.json({ success: true, data: hydratedList });
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

    const rawCert = {
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

    // Losslessly compress image fields for database storage
    const newCert = prepareCertificateForStorage(rawCert);

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

    return res.json({ success: true, message: 'Certificate saved successfully', data: hydrateCertificate(newCert) });
  } catch (error) {
    console.error('Error saving certificate:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/certificates/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let cert = null;
    if (getIsConnected()) {
      try {
        if (typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/)) {
          cert = await Certificate.findById(id).lean();
        } else {
          cert = await Certificate.findOne({
            $or: [
              { _id: id },
              { id: Number(id) || 0 },
              { regNo: id }
            ]
          }).lean();
        }
      } catch (e) {
        console.warn('DB read error for certificate by ID:', e.message);
      }
    }

    if (!cert) {
      const fileList = getCertificatesList();
      cert = fileList.find(c =>
        String(c._id) === String(id) ||
        String(c.id) === String(id) ||
        String(c.regNo).toLowerCase() === String(id).toLowerCase()
      );
    }

    if (!cert) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }

    return res.json({ success: true, data: hydrateCertificate(cert) });
  } catch (error) {
    console.error('Error fetching certificate:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/certificates/:id and PUT /api/certificates
const handleUpdateCert = async (req, res) => {
  try {
    const id = req.params.id || req.query.id || req.query._id || req.body._id || req.body.id;
    const regNo = req.query.regNo || req.body?.regNo;

    const {
      validFrom = '',
      validUpto = '',
      page1,
      page2,
      trustEmail = '',
      trustName = '',
      createdBy = ''
    } = req.body;

    let updatedCert = null;

    const compressedPage1 = page1 !== undefined ? (page1 ? compressImageString(page1) : '') : undefined;
    const compressedPage2 = page2 !== undefined ? (page2 ? compressImageString(page2) : '') : undefined;

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

        const updateFields = {};
        if (req.body.regNo) updateFields.regNo = req.body.regNo.trim();
        if (validFrom !== undefined) updateFields.validFrom = validFrom.trim();
        if (validUpto !== undefined) updateFields.validUpto = validUpto.trim();
        if (compressedPage1 !== undefined) updateFields.page1 = compressedPage1;
        if (compressedPage2 !== undefined) updateFields.page2 = compressedPage2;
        if (trustEmail) updateFields.trustEmail = trustEmail.trim().toLowerCase();
        if (trustName) updateFields.trustName = trustName.trim();
        if (createdBy) updateFields.createdBy = createdBy.trim();

        if (orConditions.length > 0) {
          updatedCert = await Certificate.findOneAndUpdate(
            { $or: orConditions },
            { $set: updateFields },
            { new: true }
          ).lean();
        }
      } catch (e) {
        console.warn('DB update error for certificate:', e.message);
      }
    }

    let fileList = getCertificatesList();
    let foundIndex = fileList.findIndex(c => {
      const matchId = id && (String(c._id) === String(id) || String(c.id) === String(id));
      const matchReg = regNo && String(c.regNo).toLowerCase() === String(regNo).toLowerCase();
      return matchId || matchReg;
    });

    if (foundIndex !== -1) {
      fileList[foundIndex] = {
        ...fileList[foundIndex],
        regNo: req.body.regNo ? req.body.regNo.trim() : fileList[foundIndex].regNo,
        validFrom: validFrom !== undefined ? validFrom.trim() : fileList[foundIndex].validFrom,
        validUpto: validUpto !== undefined ? validUpto.trim() : fileList[foundIndex].validUpto,
        page1: compressedPage1 !== undefined ? compressedPage1 : fileList[foundIndex].page1,
        page2: compressedPage2 !== undefined ? compressedPage2 : fileList[foundIndex].page2,
        trustEmail: trustEmail ? trustEmail.trim().toLowerCase() : fileList[foundIndex].trustEmail,
        trustName: trustName ? trustName.trim() : fileList[foundIndex].trustName,
        createdBy: createdBy ? createdBy.trim() : fileList[foundIndex].createdBy
      };
      if (!updatedCert) {
        updatedCert = fileList[foundIndex];
      }
      saveCertificatesList(fileList);
    } else if (!updatedCert) {
      const rawEntry = {
        _id: id || `cert_${Date.now()}`,
        id: Date.now(),
        regNo: req.body.regNo ? req.body.regNo.trim() : '',
        validFrom: validFrom.trim(),
        validUpto: validUpto.trim(),
        page1: page1 || '',
        page2: page2 || '',
        trustEmail: (trustEmail || '').trim().toLowerCase(),
        trustName: (trustName || '').trim(),
        createdBy: (createdBy || '').trim()
      };
      const newEntry = prepareCertificateForStorage(rawEntry);
      fileList.unshift(newEntry);
      saveCertificatesList(fileList);
      updatedCert = newEntry;
    }

    return res.json({ success: true, message: 'Certificate updated successfully', data: hydrateCertificate(updatedCert) });
  } catch (error) {
    console.error('Error updating certificate:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

router.put('/:id', handleUpdateCert);
router.put('/', handleUpdateCert);

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
