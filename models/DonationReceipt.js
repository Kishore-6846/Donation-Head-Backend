const mongoose = require('mongoose');

const donationReceiptSchema = new mongoose.Schema(
  {
    receiptNo: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    donorName: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      default: ''
    },
    email: {
      type: String,
      default: ''
    },
    panNo: {
      type: String,
      default: ''
    },
    address: {
      type: String,
      default: ''
    },
    type: {
      type: String,
      default: 'Voluntary Donation'
    },
    donationHead: {
      type: String,
      required: true,
      default: 'General'
    },
    amount: {
      type: Number,
      required: true
    },
    paymentMode: {
      type: String,
      default: 'Online / UPI'
    },
    receiptDate: {
      type: String,
      required: true
    },
    reference: {
      type: String,
      default: ''
    },
    createdBy: {
      type: String,
      default: 'Admin'
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active'
    },
    notes: {
      type: String,
      default: ''
    },
    trustEmail: {
      type: String,
      default: ''
    },
    trustName: {
      type: String,
      default: ''
    },
    trustAddress: {
      type: String,
      default: ''
    },
    trustPhone: {
      type: String,
      default: ''
    },
    trustWebsite: {
      type: String,
      default: ''
    },
    trustRegNo: {
      type: String,
      default: ''
    },
    trustPan: {
      type: String,
      default: ''
    },
    trustLogo: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true,
    strict: false
  }
);

donationReceiptSchema.index({ trustEmail: 1, createdAt: -1 });
donationReceiptSchema.index({ createdBy: 1, createdAt: -1 });
donationReceiptSchema.index({ status: 1, createdAt: -1 });
donationReceiptSchema.index({ donationHead: 1 });

module.exports = mongoose.models.DonationReceipt || mongoose.model('DonationReceipt', donationReceiptSchema);
