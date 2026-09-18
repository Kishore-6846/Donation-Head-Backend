const mongoose = require('mongoose');

const donationHeadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active'
    },
    isGlobal: {
      type: Boolean,
      default: false
    },
    createdBy: {
      type: String,
      default: 'Admin'
    },
    trustName: {
      type: String,
      default: ''
    },
    trustEmail: {
      type: String,
      default: ''
    },
    hiddenForTrusts: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.DonationHead || mongoose.model('DonationHead', donationHeadSchema);
