const DonationReceipt = require('../models/DonationReceipt');
const Certificate = require('../models/Certificate');
const User = require('../models/User');
const { getIsConnected } = require('../config/db');
const { initialDonationReceipts } = require('../data/seedData');
const { getCollection, saveCollection } = require('../services/storageService');
const { generateReceiptPDF, generateReceiptPDFBuffer } = require('../services/receiptPdfService');
const { sendReceiptEmailWithPdf } = require('../services/emailService');
const archiver = require('archiver');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'donation_receipt_secure_secret_2026';

const getReceipts = () => getCollection('receipts', initialDonationReceipts);
const saveReceipts = (list) => saveCollection('receipts', list);
const getUsers = () => getCollection('users', []);

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

  let maxSeq = Math.max(Number(startSeq) || 1, 1);
  const tEmail = (trustEmail || '').trim().toLowerCase();
  const tName = (trustName || '').trim().toLowerCase();

  try {
    let existingReceipts = [];
    if (getIsConnected()) {
      const orClauses = [];
      if (tEmail) {
        orClauses.push({ trustEmail: new RegExp(`^${tEmail}$`, 'i') });
        orClauses.push({ createdBy: new RegExp(`^${tEmail}$`, 'i') });
      }
      if (tName && tName !== 'trust organization') {
        orClauses.push({ trustName: new RegExp(`^${tName}$`, 'i') });
      }
      const filter = orClauses.length > 0 ? { $or: orClauses } : {};
      existingReceipts = await DonationReceipt.find(filter, 'receiptNo').lean();
    } else {
      existingReceipts = getReceipts().filter(r => {
        const rEmail = (r.trustEmail || r.createdBy || '').toLowerCase();
        const rTrust = (r.trustName || '').toLowerCase();
        return (tEmail && rEmail === tEmail) || (tName && tName !== 'trust organization' && rTrust === tName);
      });
    }

    const regEx = new RegExp(`^${escapedPrefix}\\/(\\d+)$`, 'i');
    for (const r of existingReceipts) {
      if (r.receiptNo) {
        const match = r.receiptNo.match(regEx);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (num >= maxSeq) {
            maxSeq = num + 1;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Error computing sequence in generateReceiptNo:', e.message);
  }

  return `${formattedPrefix}${maxSeq}`;
};

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

    return {
      ...receipt,
      _adminUser: adminUser,
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
      signatoryName: adminUser?.signatoryName ||
        [adminUser?.firstName, adminUser?.middleName, adminUser?.surname].filter(Boolean).join(' ').trim() ||
        receipt.signatoryName ||
        adminUser?.contactPerson ||
        adminUser?.name ||
        'Authorized Signatory',
      signatoryPan: adminUser?.signatoryPan || receipt.signatoryPan || ''
    };
  } catch (err) {
    console.warn('Error enriching receipt with trust data:', err.message);
    return receipt;
  }
};

/**
 * Controller: PDF Stream Handler
 */
const handleReceiptPdfStream = async (req, res) => {
  try {
    const id = req.params.id || req.query.id || req.query.receiptNo || req.query.rid;
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

/**
 * Controller: Send Receipt Email with PDF
 */
const sendReceiptEmail = async (req, res) => {
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

    const pdfBuffer = await generateReceiptPDFBuffer(mergedReceipt);

    const emailResult = await sendReceiptEmailWithPdf({
      to: donorEmail,
      receipt: mergedReceipt,
      pdfBuffer,
      trustUser: mergedReceipt._adminUser
    });

    if (!emailResult.success) {
      return res.status(400).json({
        success: false,
        configured: emailResult.configured === false ? false : true,
        message: emailResult.message || 'Failed to deliver email'
      });
    }

    return res.json({
      success: true,
      message: `Official 80G Receipt PDF (${mergedReceipt.receiptNo || 'Receipt'}) successfully delivered to ${donorEmail}`,
      previewUrl: emailResult.previewUrl
    });
  } catch (error) {
    console.error('Error sending receipt email:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to send email' });
  }
};

module.exports = {
  handleReceiptPdfStream,
  sendReceiptEmail,
  generateReceiptNo,
  enrichReceiptWithTrustData
};
