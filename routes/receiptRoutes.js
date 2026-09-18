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

const generateReceiptNo = async (trustPrefix = 'REC') => {
  const fy = getFinancialYear();
  const cleanPrefix = (String(trustPrefix).replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase()) || 'REC';
  let maxSeq = currentSeq;
  try {
    if (getIsConnected()) {
      const allReceipts = await DonationReceipt.find({ receiptNo: new RegExp(`^${cleanPrefix}/${fy}/`) }).lean();
      for (const r of allReceipts) {
        if (r.receiptNo) {
          const parts = r.receiptNo.split('/');
          const lastNum = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(lastNum) && lastNum >= maxSeq) {
            maxSeq = lastNum + 1;
          }
        }
      }
    }
    const fileList = getReceipts();
    for (const r of fileList) {
      if (r.receiptNo && r.receiptNo.includes(`${cleanPrefix}/${fy}/`)) {
        const parts = r.receiptNo.split('/');
        const lastNum = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastNum) && lastNum >= maxSeq) {
          maxSeq = lastNum + 1;
        }
      }
    }
  } catch (e) {
    maxSeq = Math.max(currentSeq, Math.floor(Date.now() % 100000));
  }
  currentSeq = maxSeq + 1;
  return `${cleanPrefix}/${fy}/${maxSeq}`;
};

const User = require('../models/User');

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

// GET all receipts (with tab filtering, search, pagination)
router.get('/', async (req, res) => {
  try {
    const {
      status = 'Active',
      search = '',
      head = '',
      page = 1,
      limit = 10,
      trustEmail = '',
      trustName = ''
    } = req.query;

    const superAdminEmails = await getSuperAdminEmails();
    const isSuperAdminCaller = Boolean(
      (!trustEmail && !trustName) ||
      (trustEmail && trustEmail.toLowerCase().includes('superadmin')) ||
      trustEmail === 'admin@donationreceipt.in' ||
      superAdminEmails.includes((trustEmail || '').toLowerCase())
    );

    const conditions = [{ status }];

    // If a specific trust admin requests receipts, strictly isolate receipts to their trust only
    if (!isSuperAdminCaller && (trustEmail || trustName)) {
      const orClauses = [];
      if (trustEmail) {
        const emailRegex = new RegExp(`^${trustEmail.trim()}$`, 'i');
        orClauses.push({ trustEmail: emailRegex });
        orClauses.push({ createdBy: emailRegex });
      }
      if (trustName) {
        const nameRegex = new RegExp(`^${trustName.trim()}$`, 'i');
        orClauses.push({ trustName: nameRegex });
      }
      if (orClauses.length > 0) {
        conditions.push({ $or: orClauses });
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
      const filter = conditions.length > 1 ? { $and: conditions } : conditions[0];

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
      let list = getReceipts().filter(r => (r.status || 'Active') === status);

      if (!isSuperAdminCaller && (trustEmail || trustName)) {
        const eLower = (trustEmail || '').toLowerCase().trim();
        const tLower = (trustName || '').toLowerCase().trim();
        list = list.filter(r => {
          const matchE = eLower && (
            (r.trustEmail && r.trustEmail.toLowerCase() === eLower) ||
            (r.createdBy && r.createdBy.toLowerCase() === eLower)
          );
          const matchT = tLower && (
            r.trustName && r.trustName.toLowerCase() === tLower
          );
          return matchE || matchT;
        });
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
  const { trustName = '', prefix = '' } = req.query;
  const p = prefix || (trustName ? trustName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() : 'REC');
  const nextNo = await generateReceiptNo(p);
  return res.json({
    success: true,
    receiptNo: nextNo
  });
});

// GET donors list for name autocomplete dropdown
router.get('/donors', async (req, res) => {
  try {
    const { search = '', trustEmail = '' } = req.query;
    let donors = [];

    const match = {};
    if (search) {
      match.donorName = { $regex: search, $options: 'i' };
    }
    if (trustEmail) {
      const emailRegex = new RegExp(`^${trustEmail.trim()}$`, 'i');
      match.$or = [
        { trustEmail: emailRegex },
        { createdBy: emailRegex }
      ];
    }

    if (getIsConnected()) {
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
            address: r.address || ''
          });
        }
      }
      donors = Array.from(map.values());
    } else {
      const map = new Map();
      let currentList = getReceipts();
      if (trustEmail) {
        currentList = currentList.filter(r =>
          (r.trustEmail && r.trustEmail.toLowerCase() === trustEmail.toLowerCase()) ||
          (r.createdBy && r.createdBy.toLowerCase() === trustEmail.toLowerCase())
        );
      }
      for (const r of currentList) {
        const key = (r.donorName || '').trim().toLowerCase();
        if (key && !map.has(key)) {
          if (!search || key.includes(search.toLowerCase())) {
            map.set(key, {
              name: r.donorName.trim(),
              phone: r.phone || '',
              email: r.email || '',
              panNo: r.panNo || '',
              aadhaarNo: r.aadhaarNo || '',
              address: r.address || ''
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
      const pdfBuffer = await generateReceiptPDFBuffer(receipt);
      const safeNo = (receipt.receiptNo || 'receipt')
        .replace(/[\/\\:]/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeName = (receipt.donorName || receipt.name || 'donor')
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
      receipt = allReceipts.find(r => r._id === id || r.receiptNo === id);
    }

    if (!receipt) {
      return res.status(404).send('Receipt not found');
    }

    // Lookup corresponding Trust Admin to inject latest profile logo, signature & wordings
    let adminUser = null;
    const adminIdentifier = (req.query.trustEmail || req.query.email || req.headers['x-trust-email'] || receipt.trustEmail || receipt.createdBy || '').trim();
    const adminTrustName = (req.query.trustName || req.headers['x-trust-name'] || receipt.trustName || '').trim();
    const adminTrustId = (req.query.trustId || req.headers['x-trust-id'] || receipt.trustId || '').trim();

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

    // Merge latest admin profile details into receipt copy for PDF rendering
    const mergedReceipt = {
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
      signatoryName: adminUser?.contactPerson || adminUser?.signatoryName || adminUser?.name || receipt.signatoryName || 'Authorized Signatory',
      signatoryPan: adminUser?.signatoryPan || adminUser?.panNo || receipt.signatoryPan || ''
    };

    return generateReceiptPDF(mergedReceipt, res);
  } catch (error) {
    console.error('Error generating PDF:', error);
    return res.status(500).send('Error generating PDF');
  }
};

router.get('/pdf', handleReceiptPdfStream);
router.get('/:id/pdf', handleReceiptPdfStream);

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
    const fy = getFinancialYear();
    let receiptNumber = receiptNo;
    if (!receiptNumber) {
      if (receiptPrefix) {
        receiptNumber = `${receiptPrefix}${currentSeq++}`;
      } else {
        receiptNumber = await generateReceiptNo();
      }
    }

    const isSuperAdminCreator =
      Boolean(req.body.isSuperAdminReceipt) ||
      (req.user?.role && req.user.role.toLowerCase().includes('super')) ||
      Boolean(req.user?.isSuperAdmin) ||
      Boolean(createdBy && (createdBy.toLowerCase().includes('superadmin') || createdBy === 'Super Admin'));

    const finalTrustEmail = (trustEmail && trustEmail.trim()) ? trustEmail.trim() : (req.user?.email || '');
    const finalTrustName = (trustName && trustName.trim()) ? trustName.trim() : (req.user?.trustName || 'Trust Organization');
    const creatorId = isSuperAdminCreator ? 'Super Admin' : (createdBy || finalTrustEmail || 'admin');

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
      return res.json({ success: true, message: 'Receipt updated successfully', data: updated });
    } else {
      const currentList = getReceipts();
      const idx = currentList.findIndex(r => r._id === id || r.receiptNo === id);
      if (idx === -1) return res.status(404).json({ success: false, message: 'Receipt not found' });
      currentList[idx] = { ...currentList[idx], ...updateData };
      saveReceipts(currentList);
      return res.json({ success: true, message: 'Receipt updated successfully', data: currentList[idx] });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT toggle status (Active / Inactive)
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (getIsConnected()) {
      const updated = await DonationReceipt.findByIdAndUpdate(id, { status }, { new: true });
      return res.json({ success: true, message: `Receipt marked as ${status}`, data: updated });
    } else {
      const currentList = getReceipts();
      const idx = currentList.findIndex(r => r._id === id);
      if (idx === -1) return res.status(404).json({ success: false, message: 'Receipt not found' });
      currentList[idx].status = status;
      saveReceipts(currentList);
      return res.json({ success: true, message: `Receipt marked as ${status}`, data: currentList[idx] });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE receipt
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (getIsConnected()) {
      if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
        await DonationReceipt.findByIdAndDelete(id);
      } else {
        await DonationReceipt.findOneAndDelete({ receiptNo: id });
      }
      return res.json({ success: true, message: 'Receipt deleted successfully' });
    }
    const currentList = getReceipts();
    const filtered = currentList.filter(r => r._id !== id && r.receiptNo !== id);
    saveReceipts(filtered);
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
