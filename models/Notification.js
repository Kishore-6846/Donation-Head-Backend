const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true
    },
    category: {
      type: String,
      default: 'Announcement'
    },
    targetAudience: {
      type: String,
      default: 'All Trusts'
    },
    actionText: {
      type: String,
      default: ''
    },
    actionLink: {
      type: String,
      default: ''
    },
    publishDate: {
      type: String,
      default: () => new Date().toLocaleDateString('en-GB')
    },
    status: {
      type: String,
      default: 'Published'
    }
  },
  {
    timestamps: true,
    strict: false
  }
);

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
