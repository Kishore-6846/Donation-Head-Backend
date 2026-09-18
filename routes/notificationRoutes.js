const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/db');
const Notification = require('../models/Notification');
const { getCollection, saveCollection } = require('../services/storageService');

const initialNotifications = [
  {
    _id: 'notif_1',
    title: '80G Vault Section Upgraded',
    message: 'Manage 80G and 12A registration certificates easily in the new 80G Vault with cloud backup.',
    category: 'Release',
    targetAudience: 'All Trusts',
    actionText: 'Click here to check now',
    actionLink: '/trust/all-certificate',
    publishDate: '15/04/2026',
    status: 'Published',
    createdAt: '2026-04-15T10:00:00.000Z'
  },
  {
    _id: 'notif_2',
    title: 'Bulk Receipt PDF Downloader Active',
    message: 'You can now download multiple receipt PDFs bundled in bulk as a single ZIP file with custom date ranges.',
    category: 'Release',
    targetAudience: 'All Trusts',
    actionText: 'Click here to try now',
    actionLink: '/trust/donation-receipt',
    publishDate: '14/08/2025',
    status: 'Published',
    createdAt: '2025-08-14T11:00:00.000Z'
  },
  {
    _id: 'notif_3',
    title: 'Form No. 10BD Statutory Filing Updates',
    message: 'Easily download consolidated or detailed Form 10BD compliance reports for accurate annual IT e-filing.',
    category: 'Compliance',
    targetAudience: 'All Trusts',
    actionText: 'View Form 10 BD',
    actionLink: '/trust/reports-it',
    publishDate: '28/04/2025',
    status: 'Published',
    createdAt: '2025-04-28T09:30:00.000Z'
  },
  {
    _id: 'notif_4',
    title: 'Donation Appreciation Certificates',
    message: 'Attach a customized Donation Appreciation Certificate along with your digital donation receipts.',
    category: 'Feature',
    targetAudience: 'All Trusts',
    actionText: 'Upload Certificate Template',
    actionLink: '/trust/new-certificate',
    publishDate: '25/02/2025',
    status: 'Published',
    createdAt: '2025-02-25T14:15:00.000Z'
  },
  {
    _id: 'notif_5',
    title: 'WhatsApp Instant Receipt Sharing',
    message: 'Now instantly share donor receipts directly via WhatsApp with one-click personalized messages.',
    category: 'Tutorial',
    targetAudience: 'All Trusts',
    actionText: '▶️ View Tutorial Video',
    actionLink: 'https://youtube.com/@donationreceipt',
    publishDate: '06/10/2023',
    status: 'Published',
    createdAt: '2023-10-06T12:00:00.000Z'
  }
];

const getNotifications = () => getCollection('notifications', initialNotifications);
const saveNotifications = (list) => saveCollection('notifications', list);

// GET /api/notifications
router.get('/', async (req, res) => {
  try {
    const { status, category, search, limit } = req.query;
    let list = getNotifications();

    if (getIsConnected()) {
      try {
        const query = {};
        if (status && status !== 'All') query.status = status;
        if (category && category !== 'All') query.category = category;
        const dbItems = await Notification.find(query).sort({ createdAt: -1 }).lean();
        if (dbItems.length > 0) {
          list = dbItems.map(n => ({
            _id: n._id.toString(),
            title: n.title,
            message: n.message,
            category: n.category,
            targetAudience: n.targetAudience,
            actionText: n.actionText,
            actionLink: n.actionLink,
            publishDate: n.publishDate,
            status: n.status,
            createdAt: n.createdAt
          }));
        }
      } catch (e) {
        console.warn('DB read error for notifications:', e.message);
      }
    }

    if (status && status !== 'All') {
      list = list.filter(n => n.status.toLowerCase() === status.toLowerCase());
    }

    if (category && category !== 'All') {
      list = list.filter(n => n.category.toLowerCase() === category.toLowerCase());
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q) ||
        (n.category && n.category.toLowerCase().includes(q))
      );
    }

    if (limit) {
      list = list.slice(0, Number(limit));
    }

    return res.json({
      success: true,
      count: list.length,
      data: list
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ success: false, message: error.message, data: getNotifications() });
  }
});

// GET /api/notifications/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const items = getNotifications();
    let item = items.find(n => n._id === id);
    if (!item && getIsConnected()) {
      item = await Notification.findById(id).lean();
    }
    if (!item) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    return res.json({ success: true, data: item });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/notifications - Create new notification broadcast
router.post('/', async (req, res) => {
  try {
    const {
      title,
      message,
      category,
      targetAudience,
      actionText,
      actionLink,
      status
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    const newNotification = {
      _id: 'notif_' + Date.now(),
      title: title.trim(),
      message: message.trim(),
      category: category || 'General',
      targetAudience: targetAudience || 'All Trusts',
      actionText: actionText || '',
      actionLink: actionLink || '',
      publishDate: formattedDate,
      status: status || 'Published',
      createdAt: new Date().toISOString()
    };

    if (getIsConnected()) {
      try {
        const created = await Notification.create(newNotification);
        newNotification._id = created._id.toString();
      } catch (e) {
        console.warn('DB notification create error:', e.message);
      }
    }

    const currentNotifs = getNotifications();
    currentNotifs.unshift(newNotification);
    saveNotifications(currentNotifs);

    return res.status(201).json({
      success: true,
      message: 'Notification published successfully',
      data: newNotification
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/notifications/:id - Update notification
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    let updated = null;

    if (getIsConnected()) {
      try {
        updated = await Notification.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
      } catch (e) {}
    }

    const currentNotifs = getNotifications();
    const index = currentNotifs.findIndex(n => n._id === id);
    if (index !== -1) {
      currentNotifs[index] = { ...currentNotifs[index], ...updates };
      updated = currentNotifs[index];
      saveNotifications(currentNotifs);
    }

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.json({
      success: true,
      message: 'Notification updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Error updating notification:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (getIsConnected()) {
      try {
        await Notification.findByIdAndDelete(id);
      } catch (e) {}
    }

    const currentNotifs = getNotifications();
    const filtered = currentNotifs.filter(n => n._id !== id);
    saveNotifications(filtered);

    return res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
module.exports.getNotifications = getNotifications;
