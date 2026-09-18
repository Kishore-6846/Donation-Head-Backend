const mongoose = require('mongoose');

const receiptTypeSchema = new mongoose.Schema(
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
      uppercase: true,
      trim: true
    },
    is80GEligible: {
      type: Boolean,
      default: false
    },
    taxSection: {
      type: String,
      default: 'Section 80G'
    },
    description: {
      type: String,
      default: ''
    },
    defaultNotes: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.ReceiptType || mongoose.model('ReceiptType', receiptTypeSchema);
