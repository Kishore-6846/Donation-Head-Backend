const mongoose = require('mongoose');

const reportTypeSchema = new mongoose.Schema(
  {
    _id: { type: String },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    category: { type: String, default: 'Statutory Compliance' },
    frequency: { type: String, default: 'Annual' },
    scope: { type: String, default: 'Donation Receipts' },
    columns: { type: [String], default: [] },
    sectionClause: { type: String, default: '' },
    description: { type: String, default: '' },
    disclaimer: { type: String, default: '' },
    status: { type: String, default: 'Active' },
    trustEmail: { type: String, default: '' }
  },
  {
    timestamps: true,
    strict: false
  }
);

module.exports = mongoose.models.ReportType || mongoose.model('ReportType', reportTypeSchema);
