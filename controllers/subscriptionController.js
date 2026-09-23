const jwt = require('jsonwebtoken');
const { getIsConnected } = require('../config/db');
const User = require('../models/User');
const Plan = require('../models/Plan');
const { getCollection } = require('../services/storageService');
const { generateInvoicePDF } = require('../services/invoicePdfService');

const JWT_SECRET = process.env.JWT_SECRET || 'donation_receipt_secure_secret_2026';

function formatDateDDMMYYYY(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatDateDDMMMYYYY(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function parseUserDate(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  
  if (typeof dateStr === 'string' && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(dateStr.trim())) {
    const parts = dateStr.trim().split(/[\/\-]/);
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }

  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function resolveAdminUser(req) {
  let userEmail = '';
  let userId = '';

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded?.email) userEmail = decoded.email.toLowerCase().trim();
      if (decoded?.id) userId = decoded.id;
      if (decoded?._id) userId = decoded._id;
    } catch (e) {}
  }

  const headerEmail = (req.headers['x-trust-email'] || req.query.email || req.query.trustEmail || '').toLowerCase().trim();
  if (!userEmail && headerEmail) userEmail = headerEmail;

  const headerId = (req.headers['x-trust-id'] || req.query.id || req.query.trustId || '').trim();
  if (!userId && headerId) userId = headerId;

  let user = null;
  if (getIsConnected()) {
    try {
      if (userId && userId.match(/^[0-9a-fA-F]{24}$/)) {
        user = await User.findById(userId).lean();
      }
      if (!user && userEmail) {
        user = await User.findOne({ email: new RegExp(`^${userEmail}$`, 'i') }).lean();
      }
    } catch (e) {}
  }

  if (!user) {
    const users = getCollection('users', []);
    user = users.find(u => 
      (userId && (u._id === userId || u.id === userId)) ||
      (userEmail && u.email && u.email.toLowerCase() === userEmail)
    ) || null;
  }

  return user;
}

/**
 * Controller: Get Subscriptions for Admin
 */
const getSubscriptions = async (req, res) => {
  try {
    const user = await resolveAdminUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const planName = user.plan || 'Standard';
    let planData = null;

    if (getIsConnected()) {
      try {
        planData = await Plan.findOne({ name: new RegExp(`^${planName}$`, 'i') }).lean();
      } catch (e) {}
    }
    if (!planData) {
      const plans = getCollection('plans', []);
      planData = plans.find(p => p.name && p.name.toLowerCase() === planName.toLowerCase());
    }

    const validityDays = Number(planData?.validityDays) || 365;
    const planPrice = planData?.price !== undefined ? Number(planData.price) : 2500;
    const startDateObj = parseUserDate(user.joinedDate || user.createdAt);
    const endDateObj = new Date(startDateObj.getTime() + validityDays * 24 * 60 * 60 * 1000);
    const isPlanActive = new Date() <= endDateObj;

    const userNum = String(user._id || user.id || '101').replace(/\D/g, '').slice(-4) || '0031';
    const invoiceNo = `SP-DR-26-27-${userNum.padStart(4, '0')}`;

    const currentSub = {
      id: 'sub_active_1',
      sNo: 1,
      invoiceNo,
      plan: planName,
      billingCycle: planData?.billingCycle || 'Annual',
      validityDays,
      startingDate: formatDateDDMMYYYY(startDateObj),
      startingDateFormatted: formatDateDDMMMYYYY(startDateObj),
      endDate: formatDateDDMMYYYY(endDateObj),
      endDateFormatted: formatDateDDMMMYYYY(endDateObj),
      paidAmount: user.paidAmount ? Number(user.paidAmount) : planPrice,
      status: isPlanActive ? 'Active' : 'Expired',
      createdAt: startDateObj.toISOString(),
      isCurrent: true
    };

    const subscriptions = [currentSub];
    return res.json({
      success: true,
      data: subscriptions,
      counts: {
        active: isPlanActive ? 1 : 0,
        expired: isPlanActive ? 0 : 1,
        total: 1
      },
      currentPlan: currentSub
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Controller: Stream Invoice PDF
 */
const streamInvoicePDF = async (req, res) => {
  try {
    const { invoiceNo } = req.params;
    const user = await resolveAdminUser(req);

    const invoiceData = {
      invoiceNo: invoiceNo || 'SP-DR-26-27-0031',
      date: formatDateDDMMYYYY(new Date()),
      orderId: `ORD-REC-${Date.now().toString().slice(-6)}`,
      status: 'Paid',
      planName: user?.plan || 'Standard Plan (1 Year)',
      billingCycle: 'Annual',
      planPrice: 2500,
      discount: 0,
      subtotal: 2500,
      igst: 450,
      cgst: 0,
      sgst: 0,
      totalAmount: 2950,
      clientName: user?.trustName || user?.name || 'Maharaja Trust',
      clientEmail: user?.email || 'admin@maharaja-trust.com',
      clientPhone: user?.mobile || user?.phone || '6383499063',
      clientAddress: user?.address || '12, Gandhi Road, Chennai, Tamil Nadu - 600001',
      clientState: user?.state || 'Tamil Nadu',
      clientGstin: user?.panNo || 'AAATM1234F'
    };

    return generateInvoicePDF(invoiceData, res);
  } catch (error) {
    console.error('Error streaming invoice PDF:', error);
    return res.status(500).send('Error generating invoice PDF');
  }
};

module.exports = {
  getSubscriptions,
  streamInvoicePDF
};
