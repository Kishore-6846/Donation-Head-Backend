const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
  {
    _id: {
      type: String
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    code: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    billingCycle: {
      type: String,
      default: 'Annual'
    },
    validityDays: {
      type: Number,
      default: 365
    },
    receiptLimit: {
      type: String,
      default: 'Unlimited'
    },
    staffUserLimit: {
      type: String,
      default: '4 Staff Users'
    },
    features: {
      type: [String],
      default: []
    },
    badge: {
      type: String,
      default: ''
    },
    description: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      default: 'Active'
    }
  },
  {
    timestamps: true,
    strict: false
  }
);

module.exports = mongoose.models.Plan || mongoose.model('Plan', planSchema);
