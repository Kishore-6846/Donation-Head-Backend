const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/db');
const DonationReceipt = require('../models/DonationReceipt');
const { initialDonationReceipts } = require('../data/seedData');
const archiver = require('archiver');
const { generateReceiptPDF, generateReceiptPDFBuffer } = require('../services/receiptPdfService');

const { getCollection, saveCollection } = require('../services/storageService');
const getReceipts = () => getCollection('receipts', initialDonationReceipts);
const saveReceipts = (list) => saveCollection('receipts', list);
const getUsers = () => getCollection('users', []);

let currentSeq = 1;

const getFinancialYear = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  const endYear = (startYear + 1).toString().slice(-2);
  return `${startYear}-${endYear}`;
};

const generateReceiptNo = async (trustPrefix = 'REC', startSeq = 1, trustEmail = '', trustName = '') => {
  const fy = getFinancialYear();
  let raw = String(trustPrefix || 'REC').trim();
  if (raw.endsWith('/')) {
    raw = raw.slice(0, -1);
  }
  const hasSlash = raw.includes('/');
  const prefixBase = hasSlash ? raw : `${raw}/${fy}`;
  const formattedPrefix = `${prefixBase}/`;
  const escapedPrefix = prefixBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const searchPattern = `^${escapedPrefix}/`;

  let maxSeq = Math.max(Number(startSeq) || 1, 1);
  const tEmail = (trustEmail || '').trim().toLowerCase();
  const tName = (trustName || '').trim().toLowerCase();

  try {
    let existingReceipts = [];
    if (getIsConnected()) {
      const orClauses = [{ receiptNo: new RegExp(searchPattern, 'i') }];
      if (tEmail) {
        orClauses.push({ trustEmail: new RegExp(`^${tEmail}$`, 'i') });
        orClauses.push({ createdBy: new RegExp(`^${tEmail}$`, 'i') });
      }
      if (tName && tName !== 'trust organization') {
        orClauses.push({ trustName: new RegExp(`^${tName}$`, 'i') });
      }
      existingReceipts = await DonationReceipt.find({ $or: orClauses }).lean();
    } else {
      const fileList = getReceipts();
      existingReceipts = fileList.filter(r => {
        if (!r || !r.receiptNo) return false;
        const matchPrefix = new RegExp(searchPattern, 'i').test(r.receiptNo);
        const rEmail = (r.trustEmail || '').toLowerCase().trim();
        const rCreated = (r.createdBy || '').toLowerCase().trim();
        const rTrust = (r.trustName || '').toLowerCase().trim();
        const matchAdmin = (tEmail && (rEmail === tEmail || rCreated === tEmail)) || (tName && tName !== 'trust organization' && rTrust === tName);
        return matchPrefix || matchAdmin;
      });
    }

    for (const r of existingReceipts) {
      if (r && r.receiptNo) {
        const match = String(r.receiptNo).match(/(\d+)$/);
        if (match) {
          const lastNum = parseInt(match[1], 10);
          if (!isNaN(lastNum) && lastNum >= maxSeq) {
            maxSeq = lastNum + 1;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Error calculating next receipt number:', e.message);
  }

  return `${formattedPrefix}${maxSeq}`;
};

const User = require('../models/User');
const Certificate = require('../models/Certificate');

const getSuperAdminEmails = async () => {
  const emails = ['superadmin@donationreceipt.in', 'superadmin@gmail.com'];
  if (getIsConnected()) {
    try {
      const superUsers = await User.find({
        $or: [
          { role: { $regex: /super/i } },
          { isSuperAdmin: true }
        ]
      }).select('email').lean();
      for (const u of superUsers) {
        if (u.email && !emails.includes(u.email.toLowerCase())) {
          emails.push(u.email.toLowerCase());
        }
      }
    } catch (e) {
      console.warn('Error fetching super admin emails:', e.message);
    }
  }
  return emails;
};

// Helper to update trust receipts count across DB and file storage
const syncTrustReceiptsCount = async (trustEmail, trustId, trustName) => {
  try {
    if (!trustEmail && !trustId && !trustName) return;
    const cleanEmail = (trustEmail || '').trim().toLowerCase();
    const cleanId = (trustId || '').toString();
    const cleanName = (trustName || '').trim();

    if (getIsConnected()) {
      const orClauses = [];
      if (cleanEmail) {
        orClauses.push({ trustEmail: new RegExp(`^${cleanEmail}$`, 'i') });
        orClauses.push({ createdBy: new RegExp(`^${cleanEmail}$`, 'i') });
      }
      if (cleanId && cleanId.match(/^[0-9a-fA-F]{24}$/)) {
        orClauses.push({ trustId: cleanId });
      }
      if (cleanName && cleanName.toLowerCase() !== 'trust organization') {
        orClauses.push({ trustName: new RegExp(`^${cleanName}$`, 'i') });
      }

      if (orClauses.length > 0) {
        const count = await DonationReceipt.countDocuments({
          $and: [
            { $or: orClauses },
            { status: { $ne: 'Inactive' } }
          ]
        });

        const userQuery = {
          $or: [
            ...(cleanEmail ? [{ email: new RegExp(`^${cleanEmail}$`, 'i') }] : []),
            ...(cleanId && cleanId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: cleanId }] : []),
            ...(cleanName && cleanName.toLowerCase() !== 'trust organization' ? [
              { trustName: new RegExp(`^${cleanName}$`, 'i') },
              { name: new RegExp(`^${cleanName}$`, 'i') }
            ] : [])
          ]
        };
        await User.updateMany(userQuery, { $set: { receiptsCount: count } });
      }
    }

    // Also update in file storage if user exists there
    const users = getCollection('users', []);
    const fileReceipts = getReceipts().filter(r => (r.status || 'Active') !== 'Inactive');
    let modified = false;
    users.forEach(u => {
      const uEmail = (u.email || '').trim().toLowerCase();
      const uId = (u._id || u.id || '').toString();
      const uName = (u.trustName || u.name || '').trim().toLowerCase();
      if ((cleanEmail && uEmail === cleanEmail) || (cleanId && uId === cleanId) || (cleanName && cleanName.toLowerCase() !== 'trust organization' && uName === cleanName.toLowerCase())) {
        const count = fileReceipts.filter(r => {
          const rEmail = (r.trustEmail || '').trim().toLowerCase();
          const rCreated = (r.createdBy || '').trim().toLowerCase();
          const rTrust = (r.trustName || '').trim().toLowerCase();
          return (uEmail && (rEmail === uEmail || rCreated === uEmail)) || (cleanName && rTrust === cleanName.toLowerCase());
        }).length;
        u.receiptsCount = count;
        modified = true;
      }
    });
    if (modified) {
      saveCollection('users', users);
    }
  } catch (e) {
    console.warn('Error syncing trust receipts count:', e.message);
  }
};

// Helper to enrich receipt object with the latest trust admin profile before PDF generation
const enrichReceiptWithTrustData = async (receipt, req = {}) => {
  try {
    let adminUser = null;
    const body = req.body || {};
    const query = req.query || {};
    const headers = req.headers || {};
    const adminIdentifier = (body.trustEmail || query.trustEmail || query.email || headers['x-trust-email'] || receipt.trustEmail || receipt.createdBy || '').trim();
    const adminTrustName = (body.trustName || query.trustName || headers['x-trust-name'] || receipt.trustName || '').trim();
    const adminTrustId = (body.trustId || query.trustId || headers['x-trust-id'] || receipt.trustId || '').trim();

    if (getIsConnected()) {
      try {
        const orClauses = [];
        if (adminTrustId && adminTrustId.match(/^[0-9a-fA-F]{24}$/)) {
          orClauses.push({ _id: adminTrustId });
        }
        if (adminIdentifier && !adminIdentifier.toLowerCase().includes('superadmin')) {
          orClauses.push({ email: new RegExp(`^${adminIdentifier}$`, 'i') });
        }
        if (adminTrustName && adminTrustName.toLowerCase() !== 'trust organization') {
          orClauses.push({ trustName: new RegExp(`^${adminTrustName}$`, 'i') });
          orClauses.push({ name: new RegExp(`^${adminTrustName}$`, 'i') });
        }
        if (orClauses.length > 0) {
          adminUser = await User.findOne({ $or: orClauses }).lean();
        }
      } catch (e) {}
    }
    if (!adminUser) {
      const allUsers = getUsers();
      adminUser = allUsers.find(u =>
        (adminTrustId && (String(u._id) === String(adminTrustId) || String(u.id) === String(adminTrustId))) ||
        (adminIdentifier && u.email && u.email.toLowerCase() === adminIdentifier.toLowerCase()) ||
        (adminTrustName && adminTrustName.toLowerCase() !== 'trust organization' && (
          (u.trustName && u.trustName.toLowerCase() === adminTrustName.toLowerCase()) ||
          (u.name && u.name.toLowerCase() === adminTrustName.toLowerCase())
        ))
      );
    }

    // Fetch 80G vault certificates for this trust
    let certificates = [];
    if (getIsConnected()) {
      try {
        const certClauses = [];
        if (adminIdentifier) {
          certClauses.push({ trustEmail: new RegExp(`^${adminIdentifier}$`, 'i') });
          certClauses.push({ createdBy: new RegExp(`^${adminIdentifier}$`, 'i') });
        }
        if (adminTrustName && adminTrustName.toLowerCase() !== 'trust organization') {
          certClauses.push({ trustName: new RegExp(`^${adminTrustName}$`, 'i') });
        }
        if (certClauses.length > 0) {
          certificates = await Certificate.find({ $or: certClauses }).sort({ createdAt: -1 }).lean();
        } else {
          certificates = await Certificate.find().sort({ createdAt: -1 }).lean();
        }
      } catch (e) {}
    }
    if (!certificates || certificates.length === 0) {
      const fileCerts = getCollection('certificates', []);
      certificates = fileCerts.filter(c => {
        if (adminIdentifier && c.trustEmail && c.trustEmail.toLowerCase() !== adminIdentifier.toLowerCase() && c.createdBy && c.createdBy.toLowerCase() !== adminIdentifier.toLowerCase()) {
          return false;
        }
        return true;
      });
      if (certificates.length === 0 && fileCerts.length > 0 && !adminIdentifier) {
        certificates = fileCerts;
      }
    }

    return {
      ...receipt,
      trustName: adminUser?.trustName || adminUser?.name || receipt.trustName || 'Trust Organization',
      trustAddress: adminUser?.address || receipt.trustAddress || '',
      trustPhone: adminUser?.mobile || adminUser?.phone || receipt.trustPhone || '',
      trustEmail: adminUser?.email || receipt.trustEmail || '',
      trustWebsite: adminUser?.website || receipt.trustWebsite || '',
      trustRegNo: adminUser?.registrationNo || receipt.trustRegNo || '',
      trustPan: adminUser?.panNo || receipt.trustPan || '',
      trust80G: adminUser?.section80GRegNo || adminUser?.reg12ANo || receipt.trust80G || '',
      trust12A: adminUser?.reg12ANo || adminUser?.registrationNo || receipt.trust12A || '',
      trust12ADate: adminUser?.reg12ADate || receipt.trust12ADate || '',
      trust80GDate: adminUser?.reg12ADate || receipt.trust80GDate || '',
      trustLogo: adminUser?.logo || receipt.trustLogo || '',
      trustSignature: adminUser?.signature || receipt.trustSignature || '',
      trustWatermarkText: (adminUser?.receiptWatermarkText !== undefined && adminUser?.receiptWatermarkText !== null)
        ? adminUser.receiptWatermarkText
        : (receipt.receiptWatermarkText || receipt.watermarkText || ''),
      receiptWatermarkText: (adminUser?.receiptWatermarkText !== undefined && adminUser?.receiptWatermarkText !== null)
        ? adminUser.receiptWatermarkText
        : (receipt.receiptWatermarkText || receipt.watermarkText || ''),
      signatoryName: adminUser?.contactPerson || adminUser?.signatoryName || adminUser?.name || receipt.signatoryName || 'Authorized Signatory',
      signatoryPan: adminUser?.signatoryPan || adminUser?.panNo || receipt.signatoryPan || '',
      certificates: receipt.certificates || certificates
    };
  } catch (err) {
    return receipt;
  }
};

// GET all receipts (with tab filtering, search, pagination)
router.get('/', async (req, res) => {
  try {
    const {
      status,
      search = '',
      head = '',
      page = 1,
      limit = 10,
      trustEmail = '',
      trustName = '',
      isSuperAdmin = ''
    } = req.query;

    let isSuper = isSuperAdmin === 'true' || isSuperAdmin === true || isSuperAdmin === '1';
    let tokenEmail = '';
    let tokenTrustName = '';

    // Auto-detect SuperAdmin privileges or Trust Admin identity from JWT Bearer token if provided
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'donation_receipt_secure_secret_2026';
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && (decoded.isSuperAdmin || (decoded.role && decoded.role.toLowerCase().includes('super')))) {
          isSuper = true;
        } else if (decoded && decoded.email) {
          tokenEmail = decoded.email;
          tokenTrustName = decoded.trustName || decoded.name || '';
        }
      } catch (e) {}
    }

    const effectiveTrustEmail = (trustEmail || tokenEmail || '').trim();
    const effectiveTrustName = (trustName || tokenTrustName || '').trim();

    const conditions = [];

    // Filter by status if specified, or default to excluding Inactive receipts
    if (status && status !== 'All') {
      conditions.push({ status });
    } else if (!status) {
      conditions.push({ status: { $ne: 'Inactive' } });
    }

    // If not super admin, strictly isolate receipts to the requesting trust only
    if (!isSuper) {
      const orClauses = [];
      if (effectiveTrustEmail) {
        const emailRegex = new RegExp(`^${effectiveTrustEmail}$`, 'i');
        orClauses.push({ trustEmail: emailRegex });
        orClauses.push({ createdBy: emailRegex });
      }
      if (effectiveTrustName && effectiveTrustName.toLowerCase() !== 'trust organization') {
        const nameRegex = new RegExp(`^${effectiveTrustName}$`, 'i');
        orClauses.push({ trustName: nameRegex });
      }
      if (orClauses.length > 0) {
        conditions.push({ $or: orClauses });
      } else {
        // Unidentified trust admin cannot view any receipts
        conditions.push({ _id: null });
      }
    }

    if (head && head !== 'All') {
      conditions.push({ donationHead: head });
    }
    if (search) {
      conditions.push({
        $or: [
          { receiptNo: { $regex: search, $options: 'i' } },
          { donorName: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { panNo: { $regex: search, $options: 'i' } },
          { reference: { $regex: search, $options: 'i' } }
        ]
      });
    }

    if (getIsConnected()) {
      const filter = conditions.length > 1 ? { $and: conditions } : (conditions.length === 1 ? conditions[0] : {});

      const total = await DonationReceipt.countDocuments(filter);
      const receipts = await DonationReceipt.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit));

      return res.json({
        success: true,
        data: receipts,
        total,
        page: Number(page),
        limit: Number(limit)
      });
    } else {
      let list = getReceipts();
      if (status && status !== 'All') {
        list = list.filter(r => (r.status || 'Active') === status);
      } else if (!status) {
        list = list.filter(r => (r.status || 'Active') !== 'Inactive');
      }

      if (!isSuper) {
        const eLower = (effectiveTrustEmail || '').toLowerCase().trim();
        const tLower = (effectiveTrustName || '').toLowerCase().trim();
        if (eLower || (tLower && tLower !== 'trust organization')) {
          list = list.filter(r => {
            const rEmail = (r.trustEmail || '').toLowerCase().trim();
            const rCreated = (r.createdBy || '').toLowerCase().trim();
            const rTrust = (r.trustName || '').toLowerCase().trim();
            const matchEmail = eLower && (rEmail === eLower || rCreated === eLower);
            const matchTrust = tLower && tLower !== 'trust organization' && (rTrust === tLower);
            return matchEmail || matchTrust;
          });
        } else {
          list = [];
        }
      }

      if (head && head !== 'All') {
        list = list.filter(r => r.donationHead === head);
      }

      if (search) {
        const s = search.toLowerCase();
        list = list.filter(
          r =>
            (r.receiptNo && r.receiptNo.toLowerCase().includes(s)) ||
            (r.donorName && r.donorName.toLowerCase().includes(s)) ||
            (r.phone && r.phone.toLowerCase().includes(s)) ||
            (r.panNo && r.panNo.toLowerCase().includes(s)) ||
            (r.reference && r.reference.toLowerCase().includes(s))
        );
      }

      const total = list.length;
      const startIndex = (page - 1) * limit;
      const paginated = list.slice(startIndex, startIndex + Number(limit));

      return res.json({
        success: true,
        data: paginated,
        total,
        page: Number(page),
        limit: Number(limit)
      });
    }
  } catch (error) {
    console.error('Error getting receipts:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET next receipt number preview
router.get('/next-number', async (req, res) => {
  const { trustName = '', prefix = '', startNumber = '', trustEmail = '' } = req.query;

  let tokenEmail = '';
  let tokenTrustName = '';
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'donation_receipt_secure_secret_2026';
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded) {
        tokenEmail = decoded.email || '';
        tokenTrustName = decoded.trustName || decoded.name || '';
      }
    } catch (e) {}
  }

  const effectiveEmail = (trustEmail || req.headers['x-trust-email'] || tokenEmail || '').trim();
  const effectiveName = (trustName || req.headers['x-trust-name'] || tokenTrustName || '').trim();

  let customPrefix = prefix;
  let customStart = startNumber ? Number(startNumber) : null;

  if (effectiveEmail) {
    let trustUser = null;
    if (getIsConnected()) {
      try {
        trustUser = await User.findOne({ email: new RegExp(`^${effectiveEmail.trim()}$`, 'i') }).lean();
      } catch (e) {}
    }
    if (!trustUser) {
      const allUsers = getUsers();
      trustUser = allUsers.find(u => u.email && u.email.toLowerCase() === effectiveEmail.toLowerCase());
    }
    if (trustUser) {
      if (trustUser.receiptPrefix && !customPrefix) {
        customPrefix = trustUser.receiptPrefix;
      }
      if (trustUser.receiptStartNumber && customStart === null) {
        customStart = Number(trustUser.receiptStartNumber);
      }
    }
  }

  if (customStart === null || isNaN(customStart) || customStart < 1) {
    customStart = 1;
  }

  const p = customPrefix || (effectiveName && effectiveName !== 'DONATION RECEIPT SUPER ADMIN' && effectiveName !== 'Trust Organization'
    ? effectiveName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase()
    : 'REC');

  const nextNo = await generateReceiptNo(p, customStart, effectiveEmail, effectiveName);
  return res.json({
    success: true,
    receiptNo: nextNo
  });
});

// GET donors list for name autocomplete dropdown with strict trust isolation
router.get('/donors', async (req, res) => {
  try {
    const {
      search = '',
      trustEmail = '',
      trustName = '',
      trustId = '',
      isSuperAdmin = ''
    } = req.query;

    let isSuper = isSuperAdmin === 'true' || isSuperAdmin === true || isSuperAdmin === '1';
    let tokenEmail = '';
    let tokenTrustName = '';
    let tokenTrustId = '';

    // Auto-detect SuperAdmin privileges or Trust Admin identity from JWT Bearer token if provided
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'donation_receipt_secure_secret_2026';
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && (decoded.isSuperAdmin || (decoded.role && decoded.role.toLowerCase().includes('super')))) {
          isSuper = true;
        } else if (decoded) {
          tokenEmail = decoded.email || '';
          tokenTrustName = decoded.trustName || decoded.name || '';
          tokenTrustId = decoded._id || decoded.id || decoded.trustId || '';
        }
      } catch (e) {}
    }

    const effectiveTrustEmail = (trustEmail || req.headers['x-trust-email'] || tokenEmail || '').trim();
    const effectiveTrustName = (trustName || req.headers['x-trust-name'] || tokenTrustName || '').trim();
    const effectiveTrustId = (trustId || req.headers['x-trust-id'] || tokenTrustId || '').trim();

    let donors = [];
    const conditions = [];

    // Search filter by donor name or phone
    if (search && search.trim()) {
      conditions.push({
        $or: [
          { donorName: { $regex: search.trim(), $options: 'i' } },
          { phone: { $regex: search.trim(), $options: 'i' } }
        ]
      });
    }

    // Exclude Inactive / Cancelled receipts
    conditions.push({ status: { $ne: 'Inactive' } });

    // Multi-tenant Trust Isolation:
    if (!isSuper) {
      const orClauses = [];
      if (effectiveTrustEmail) {
        const emailRegex = new RegExp(`^${effectiveTrustEmail}$`, 'i');
        orClauses.push({ trustEmail: emailRegex });
        orClauses.push({ createdBy: emailRegex });
      }
      if (effectiveTrustName && effectiveTrustName.toLowerCase() !== 'trust organization') {
        const nameRegex = new RegExp(`^${effectiveTrustName}$`, 'i');
        orClauses.push({ trustName: nameRegex });
      }
      if (effectiveTrustId && effectiveTrustId.match(/^[0-9a-fA-F]{24}$/)) {
        orClauses.push({ trustId: effectiveTrustId });
      }
      if (orClauses.length > 0) {
        conditions.push({ $or: orClauses });
      } else {
        // If non-super admin has no identifiable trust credentials, return empty array
        return res.json({ success: true, data: [] });
      }
    } else if (effectiveTrustEmail || effectiveTrustName || effectiveTrustId) {
      // SuperAdmin explicitly filtering by a specific trust
      const orClauses = [];
      if (effectiveTrustEmail) {
        const emailRegex = new RegExp(`^${effectiveTrustEmail}$`, 'i');
        orClauses.push({ trustEmail: emailRegex });
        orClauses.push({ createdBy: emailRegex });
      }
      if (effectiveTrustName && effectiveTrustName.toLowerCase() !== 'trust organization') {
        const nameRegex = new RegExp(`^${effectiveTrustName}$`, 'i');
        orClauses.push({ trustName: nameRegex });
      }
      if (effectiveTrustId && effectiveTrustId.match(/^[0-9a-fA-F]{24}$/)) {
        orClauses.push({ trustId: effectiveTrustId });
      }
      if (orClauses.length > 0) {
        conditions.push({ $or: orClauses });
      }
    }

    if (getIsConnected()) {
      const match = conditions.length > 1 ? { $and: conditions } : (conditions.length === 1 ? conditions[0] : {});
      const list = await DonationReceipt.find(match)
        .sort({ createdAt: -1 })
        .lean();

      const map = new Map();
      for (const r of list) {
        const key = (r.donorName || '').trim().toLowerCase();
        if (key && !map.has(key)) {
          map.set(key, {
            name: r.donorName.trim(),
            phone: r.phone || '',
            email: r.email || '',
            panNo: r.panNo || '',
            aadhaarNo: r.aadhaarNo || '',
            address: r.address || '',
            trustEmail: r.trustEmail || r.createdBy || '',
            trustName: r.trustName || ''
          });
        }
      }
      donors = Array.from(map.values());
    } else {
      const map = new Map();
      let currentList = getReceipts().filter(r => (r.status || 'Active') !== 'Inactive');

      if (!isSuper) {
        const eLower = effectiveTrustEmail.toLowerCase();
        const tLower = effectiveTrustName.toLowerCase();
        const idStr = effectiveTrustId.toString();
        if (eLower || (tLower && tLower !== 'trust organization') || idStr) {
          currentList = currentList.filter(r => {
            const rEmail = (r.trustEmail || '').trim().toLowerCase();
            const rCreated = (r.createdBy || '').trim().toLowerCase();
            const rTrust = (r.trustName || '').trim().toLowerCase();
            const rId = (r.trustId || '').toString();
            const matchEmail = eLower && (rEmail === eLower || rCreated === eLower);
            const matchTrust = tLower && tLower !== 'trust organization' && (rTrust === tLower);
            const matchId = idStr && (rId === idStr);
            return matchEmail || matchTrust || matchId;
          });
        } else {
          return res.json({ success: true, data: [] });
        }
      } else if (effectiveTrustEmail || effectiveTrustName || effectiveTrustId) {
        const eLower = effectiveTrustEmail.toLowerCase();
        const tLower = effectiveTrustName.toLowerCase();
        const idStr = effectiveTrustId.toString();
        currentList = currentList.filter(r => {
          const rEmail = (r.trustEmail || '').trim().toLowerCase();
          const rCreated = (r.createdBy || '').trim().toLowerCase();
          const rTrust = (r.trustName || '').trim().toLowerCase();
          const rId = (r.trustId || '').toString();
          const matchEmail = eLower && (rEmail === eLower || rCreated === eLower);
          const matchTrust = tLower && tLower !== 'trust organization' && (rTrust === tLower);
          const matchId = idStr && (rId === idStr);
          return matchEmail || matchTrust || matchId;
        });
      }

      for (const r of currentList) {
        const key = (r.donorName || '').trim().toLowerCase();
        if (key && !map.has(key)) {
          if (!search || key.includes(search.toLowerCase().trim())) {
            map.set(key, {
              name: r.donorName.trim(),
              phone: r.phone || '',
              email: r.email || '',
              panNo: r.panNo || '',
              aadhaarNo: r.aadhaarNo || '',
              address: r.address || '',
              trustEmail: r.trustEmail || r.createdBy || '',
              trustName: r.trustName || ''
            });
          }
        }
      }
      donors = Array.from(map.values());
    }

    return res.json({ success: true, data: donors });
  } catch (error) {
    console.error('Error getting donors:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST/GET bulk-download ZIP with certificate PDFs inside receipt_downloads_<timestamp> folder
const handleBulkDownloadZip = async (req, res) => {
  try {
    let ids = req.body.ids || req.query.ids || [];
    let receiptNos = req.body.receiptNos || req.query.receiptNos || [];

    if (typeof ids === 'string') {
      ids = ids.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (typeof receiptNos === 'string') {
      receiptNos = receiptNos.split(',').map(s => s.trim()).filter(Boolean);
    }

    let matchedReceipts = [];

    if (getIsConnected()) {
      try {
        const queryConditions = [];
        if (ids.length > 0) queryConditions.push({ _id: { $in: ids } });
        if (receiptNos.length > 0) queryConditions.push({ receiptNo: { $in: receiptNos } });

        if (queryConditions.length > 0) {
          matchedReceipts = await DonationReceipt.find({ $or: queryConditions }).lean();
        }
      } catch (dbErr) {
        console.warn('DB query error in bulk-download:', dbErr.message);
      }
    }

    if (!matchedReceipts || matchedReceipts.length === 0) {
      const idSet = new Set(ids.map(i => String(i).trim().toLowerCase()));
      const noSet = new Set(receiptNos.map(n => String(n).trim().toLowerCase()));

      matchedReceipts = getReceipts().filter(r =>
        idSet.has(String(r._id).toLowerCase()) ||
        noSet.has(String(r.receiptNo).toLowerCase())
      );
    }

    // Fallback if no specific IDs matched
    if (!matchedReceipts || matchedReceipts.length === 0) {
      matchedReceipts = getReceipts().slice(0, 6);
    }

    // Limit to max 50 records as required
    matchedReceipts = matchedReceipts.slice(0, 50);

    const timestamp = Math.floor(Date.now() / 1000);
    const folderName = `receipt_downloads_${timestamp}`;
    const zipFileName = `${folderName}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    const createZipArchive = (opts = { zlib: { level: 9 } }) => {
      if (typeof archiver === 'function') return archiver('zip', opts);
      if (archiver && archiver.ZipArchive) return new archiver.ZipArchive(opts);
      if (archiver && archiver.default && typeof archiver.default === 'function') return archiver.default('zip', opts);
      if (archiver && archiver.default && archiver.default.ZipArchive) return new archiver.default.ZipArchive(opts);
      throw new Error('No zip archiver engine found');
    };

    const archive = createZipArchive({
      zlib: { level: 9 }
    });

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: err.message });
      }
    });

    archive.pipe(res);

    for (const receipt of matchedReceipts) {
      const enrichedReceipt = await enrichReceiptWithTrustData(receipt, req);
      const pdfBuffer = await generateReceiptPDFBuffer(enrichedReceipt);
      const safeNo = (enrichedReceipt.receiptNo || 'receipt')
        .replace(/[\/\\:]/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeName = (enrichedReceipt.donorName || enrichedReceipt.name || 'donor')
        .trim()
        .replace(/[\s\t\n]+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '');
      const filename = `${folderName}/receipt_${safeNo}_${safeName}.pdf`;
      archive.append(pdfBuffer, { name: filename });
    }

    await archive.finalize();
  } catch (error) {
    console.error('Error generating bulk download ZIP:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

router.post('/bulk-download', handleBulkDownloadZip);
router.get('/bulk-download', handleBulkDownloadZip);

// GET receipt PDF stream matching Screenshot 1 & 2
const handleReceiptPdfStream = async (req, res) => {
  try {
    const id = req.params.id || req.query.id || req.query.rid || req.query.receiptNo || req.query.no || req.query.pr_id;
    let receipt = null;

    if (getIsConnected()) {
      try {
        if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
          receipt = await DonationReceipt.findById(id).lean();
        }
        if (!receipt && id) {
          receipt = await DonationReceipt.findOne({ receiptNo: id }).lean();
        }
      } catch (e) {
        console.warn('DB error finding receipt by id/receiptNo:', e.message);
      }
    }
    if (!receipt) {
      const allReceipts = getReceipts();
      if (id) {
        receipt = allReceipts.find(r => r._id === id || r.receiptNo === id);
      }
      if (!receipt && allReceipts.length > 0) {
        receipt = allReceipts[0];
      }
    }

    if (!receipt) {
      receipt = {
        receiptNo: 'ASUF/2026-27/1',
        donorName: 'Donor Name',
        amount: 5000,
        donationHead: 'General',
        donationType: 'Voluntary Donation',
        paymentMode: 'UPI',
        receiptDate: new Date().toLocaleDateString('en-GB')
      };
    }

    const mergedReceipt = await enrichReceiptWithTrustData(receipt, req);
    return generateReceiptPDF(mergedReceipt, res);
  } catch (error) {
    console.error('Error generating PDF:', error);
    return res.status(500).send('Error generating PDF');
  }
};

const { sendReceiptEmailWithPdf } = require('../services/emailService');

router.get('/pdf', handleReceiptPdfStream);
router.get('/:id/pdf', handleReceiptPdfStream);

// POST send email with PDF attachment to donor
router.post(['/:id/send-email', '/send-email'], async (req, res) => {
  try {
    const id = req.params.id || req.body.id || req.body.receiptId || req.body.receiptNo;
    let receipt = null;

    if (getIsConnected()) {
      try {
        if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
          receipt = await DonationReceipt.findById(id).lean();
        }
        if (!receipt && id) {
          receipt = await DonationReceipt.findOne({ receiptNo: id }).lean();
        }
      } catch (e) {}
    }
    if (!receipt) {
      const allReceipts = getReceipts();
      receipt = allReceipts.find(r => r._id === id || r.receiptNo === id);
    }
    if (!receipt && req.body.receipt) {
      receipt = req.body.receipt;
    }
    if (!receipt) {
      return res.status(404).json({ success: false, message: 'Receipt not found' });
    }

    const mergedReceipt = await enrichReceiptWithTrustData(receipt, req);
    const donorEmail = (req.body.email || mergedReceipt.email || '').trim();
    if (!donorEmail) {
      return res.status(400).json({ success: false, message: 'Donor email address is missing' });
    }

    // Generate PDF buffer
    const pdfBuffer = await generateReceiptPDFBuffer(mergedReceipt);

    // Send email with PDF attachment
    const emailResult = await sendReceiptEmailWithPdf({
      to: donorEmail,
      receipt: mergedReceipt,
      pdfBuffer
    });

    return res.json({
      success: true,
      message: `Receipt PDF sent successfully to ${donorEmail}`,
      previewUrl: emailResult.previewUrl
    });
  } catch (error) {
    console.error('Error sending receipt email:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to send email' });
  }
});

// GET single receipt
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (getIsConnected()) {
      const receipt = await DonationReceipt.findById(id);
      if (!receipt) return res.status(404).json({ success: false, message: 'Receipt not found' });
      return res.json({ success: true, data: receipt });
    } else {
      const allReceipts = getReceipts();
      const receipt = allReceipts.find(r => r._id === id || r.receiptNo === id);
      if (!receipt) return res.status(404).json({ success: false, message: 'Receipt not found' });
      return res.json({ success: true, data: receipt });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST create receipt
router.post('/', async (req, res) => {
  try {
    const {
      receiptNo,
      donorName,
      phone = '',
      email = '',
      panNo = '',
      aadhaarNo = '',
      address = '',
      type = 'Voluntary Donation',
      donationType = 'Voluntary',
      donationHead = 'General',
      amount,
      amountInWords = '',
      paymentMode = 'Online / UPI',
      paymentDetails = '',
      receiptDate,
      reference = '',
      attach80g = false,
      attachVerification = true,
      notes = '',
      createdBy = 'Admin',
      trustEmail = '',
      trustName = '',
      trustAddress = '',
      trustPhone = '',
      trustWebsite = '',
      trustRegNo = '',
      trustPan = '',
      trustLogo = '',
      trustSignature = '',
      trust80G = '',
      trust12A = '',
      trust12ADate = '',
      trust80GDate = '',
      signatoryName = '',
      signatoryPan = '',
      receiptPrefix = ''
    } = req.body;

    if (!donorName || !amount) {
      return res.status(400).json({ success: false, message: 'Donor name and amount are required' });
    }

    const todayStr = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY
    const formattedDate = receiptDate || todayStr;
    const isSuperAdminCreator =
      Boolean(req.body.isSuperAdminReceipt) ||
      (req.user?.role && req.user.role.toLowerCase().includes('super')) ||
      Boolean(req.user?.isSuperAdmin) ||
      Boolean(createdBy && (createdBy.toLowerCase().includes('superadmin') || createdBy === 'Super Admin'));

    const finalTrustEmail = (trustEmail && trustEmail.trim()) ? trustEmail.trim() : (req.user?.email || '');
    const finalTrustName = (trustName && trustName.trim()) ? trustName.trim() : (req.user?.trustName || 'Trust Organization');
    const creatorId = isSuperAdminCreator ? 'Super Admin' : (createdBy || finalTrustEmail || 'admin');

    // Resolve user's configured receipt prefix and start number for guaranteed sequence isolation
    let userPrefix = receiptPrefix || '';
    let userStartSeq = 1;
    if (finalTrustEmail) {
      let trustUser = null;
      if (getIsConnected()) {
        try {
          trustUser = await User.findOne({ email: new RegExp(`^${finalTrustEmail.trim()}$`, 'i') }).lean();
        } catch (e) {}
      }
      if (!trustUser) {
        trustUser = getUsers().find(u => u.email && u.email.toLowerCase() === finalTrustEmail.toLowerCase());
      }
      if (trustUser) {
        if (!userPrefix && trustUser.receiptPrefix) userPrefix = trustUser.receiptPrefix;
        if (trustUser.receiptStartNumber) userStartSeq = Number(trustUser.receiptStartNumber) || 1;
      }
    }
    if (!userPrefix) {
      const p = finalTrustName && finalTrustName !== 'Trust Organization' && finalTrustName !== 'DONATION RECEIPT SUPER ADMIN'
        ? finalTrustName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase()
        : 'REC';
      userPrefix = p;
    }

    let receiptNumber = (receiptNo || '').trim();
    // Validate uniqueness of receiptNumber: if empty or already taken in DB / file storage, generate guaranteed unique next number
    let isDuplicate = false;
    if (receiptNumber) {
      if (getIsConnected()) {
        const count = await DonationReceipt.countDocuments({ receiptNo: receiptNumber });
        if (count > 0) isDuplicate = true;
      }
      if (!isDuplicate) {
        const fileList = getReceipts();
        if (fileList.some(r => r.receiptNo && r.receiptNo.toLowerCase() === receiptNumber.toLowerCase())) {
          isDuplicate = true;
        }
      }
    }

    if (!receiptNumber || isDuplicate) {
      receiptNumber = await generateReceiptNo(userPrefix, userStartSeq, finalTrustEmail, finalTrustName);
    }

    if (getIsConnected()) {
      const receipt = await DonationReceipt.create({
        receiptNo: receiptNumber,
        donorName: donorName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        panNo: panNo.trim().toUpperCase(),
        address: address.trim(),
        type,
        donationHead,
        amount: Number(amount),
        paymentMode,
        receiptDate: formattedDate,
        reference: reference.trim(),
        aadhaarNo: aadhaarNo.trim(),
        donationType,
        paymentDetails: paymentDetails.trim(),
        amountInWords: amountInWords.trim(),
        attach80g: Boolean(attach80g),
        attachVerification: Boolean(attachVerification),
        createdBy: creatorId,
        isSuperAdminReceipt: isSuperAdminCreator,
        trustEmail: finalTrustEmail,
        trustName: finalTrustName,
        trustAddress: trustAddress.trim(),
        trustPhone: trustPhone.trim(),
        trustWebsite: trustWebsite.trim(),
        trustRegNo: trustRegNo.trim(),
        trustPan: trustPan.trim(),
        trust80G: trust80G.trim(),
        trust12A: trust12A.trim(),
        trust12ADate: trust12ADate.trim(),
        trust80GDate: trust80GDate.trim(),
        trustLogo: trustLogo,
        trustSignature: trustSignature,
        signatoryName: signatoryName.trim(),
        signatoryPan: signatoryPan.trim(),
        status: 'Active',
        notes: notes.trim()
      });
      await syncTrustReceiptsCount(finalTrustEmail, '', finalTrustName);
      return res.status(201).json({ success: true, message: 'Receipt generated successfully', data: receipt });
    } else {
      const receipt = {
        _id: `rec_${Date.now()}`,
        receiptNo: receiptNumber,
        donorName: donorName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        panNo: panNo.trim().toUpperCase(),
        aadhaarNo: aadhaarNo.trim(),
        address: address.trim(),
        type,
        donationType,
        donationHead,
        amount: Number(amount),
        amountInWords: amountInWords.trim(),
        paymentMode,
        paymentDetails: paymentDetails.trim(),
        receiptDate: formattedDate,
        reference: reference.trim(),
        attach80g: Boolean(attach80g),
        attachVerification: Boolean(attachVerification),
        dateCreated: todayStr,
        createdBy: creatorId,
        trustEmail: finalTrustEmail,
        trustName: finalTrustName,
        trustAddress: trustAddress.trim(),
        trustPhone: trustPhone.trim(),
        trustWebsite: trustWebsite.trim(),
        trustRegNo: trustRegNo.trim(),
        trustPan: trustPan.trim(),
        trust80G: trust80G.trim(),
        trust12A: trust12A.trim(),
        trust12ADate: trust12ADate.trim(),
        trust80GDate: trust80GDate.trim(),
        trustLogo: trustLogo,
        trustSignature: trustSignature,
        signatoryName: signatoryName.trim(),
        signatoryPan: signatoryPan.trim(),
        status: 'Active',
        notes: notes.trim()
      };
      const currentList = getReceipts();
      currentList.unshift(receipt);
      saveReceipts(currentList);
      await syncTrustReceiptsCount(finalTrustEmail, '', finalTrustName);
      return res.status(201).json({ success: true, message: 'Receipt generated successfully', data: receipt });
    }
  } catch (error) {
    console.error('Error creating receipt:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT update receipt
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (getIsConnected()) {
      const updated = await DonationReceipt.findByIdAndUpdate(id, updateData, { new: true });
      if (!updated) return res.status(404).json({ success: false, message: 'Receipt not found' });
      await syncTrustReceiptsCount(updated.trustEmail || updated.createdBy || updateData.trustEmail, updated.trustId, updated.trustName || updateData.trustName);
      return res.json({ success: true, message: 'Receipt updated successfully', data: updated });
    } else {
      const currentList = getReceipts();
      const idx = currentList.findIndex(r => r._id === id || r.receiptNo === id);
      if (idx === -1) return res.status(404).json({ success: false, message: 'Receipt not found' });
      currentList[idx] = { ...currentList[idx], ...updateData };
      saveReceipts(currentList);
      await syncTrustReceiptsCount(currentList[idx].trustEmail || currentList[idx].createdBy, currentList[idx].trustId, currentList[idx].trustName);
      return res.json({ success: true, message: 'Receipt updated successfully', data: currentList[idx] });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH & PUT toggle status (Active / Inactive)
const handleStatusToggle = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, receiptNo } = req.body;
    const targetStatus = status || 'Inactive';

    let updated = null;

    if (getIsConnected()) {
      try {
        if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
          updated = await DonationReceipt.findByIdAndUpdate(id, { status: targetStatus }, { new: true });
        }
        if (!updated && (id || receiptNo)) {
          const searchNo = receiptNo || id;
          updated = await DonationReceipt.findOneAndUpdate(
            { $or: [{ receiptNo: searchNo }, { _id: id }] },
            { status: targetStatus },
            { new: true }
          );
        }
      } catch (dbErr) {
        console.warn('DB error in handleStatusToggle:', dbErr.message);
      }
    }

    const currentList = getReceipts();
    const target = decodeURIComponent(id || '').trim();
    const searchNo = (receiptNo || '').trim();
    const idx = currentList.findIndex(r =>
      (r._id && (r._id === target || String(r._id) === target)) ||
      (r.receiptNo && (r.receiptNo === target || r.receiptNo === searchNo))
    );

    if (idx !== -1) {
      currentList[idx].status = targetStatus;
      saveReceipts(currentList);
      if (!updated) updated = currentList[idx];
    }

    if (updated) {
      await syncTrustReceiptsCount(
        updated.trustEmail || updated.createdBy,
        updated.trustId,
        updated.trustName
      );
      return res.json({ success: true, message: `Receipt marked as ${targetStatus}`, data: updated });
    }

    return res.status(404).json({ success: false, message: 'Receipt not found' });
  } catch (error) {
    console.error('Error in status toggle:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

router.patch('/:id/status', handleStatusToggle);
router.put('/:id/status', handleStatusToggle);

// DELETE receipt
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (getIsConnected()) {
      let deleted = null;
      if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
        deleted = await DonationReceipt.findByIdAndDelete(id);
      } else {
        deleted = await DonationReceipt.findOneAndDelete({ receiptNo: id });
      }
      if (deleted) {
        await syncTrustReceiptsCount(deleted.trustEmail || deleted.createdBy, deleted.trustId, deleted.trustName);
      }
      return res.json({ success: true, message: 'Receipt deleted successfully' });
    }
    const currentList = getReceipts();
    const target = currentList.find(r => r._id === id || r.receiptNo === id);
    const filtered = currentList.filter(r => r._id !== id && r.receiptNo !== id);
    saveReceipts(filtered);
    if (target) {
      await syncTrustReceiptsCount(target.trustEmail || target.createdBy, target.trustId, target.trustName);
    }
    return res.json({ success: true, message: 'Receipt deleted successfully' });
  } catch (error) {
    console.error('Error deleting receipt:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
module.exports.getReceiptById = (id) => {
  if (!id) return null;
  const str = String(id).trim();
  const list = getReceipts();
  return (
    list.find(
      r =>
        String(r._id).trim() === str ||
        String(r.receiptNo).trim().toLowerCase() === str.toLowerCase()
    ) || null
  );
};
module.exports.getReceipts = getReceipts;
module.exports.handleReceiptPdfStream = handleReceiptPdfStream;
