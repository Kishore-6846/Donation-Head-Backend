const mongoose = require('mongoose');

const dynamicReportSchema = new mongoose.Schema(
  {
    _id: { type: String },
    name: { type: String, trim: true, default: '' },
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    category: { type: String, default: 'Custom' },
    status: { type: String, default: 'Published' },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    columns: { type: mongoose.Schema.Types.Mixed, default: [] },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    trustEmail: { type: String, default: '' }
  },
  {
    timestamps: true,
    strict: false
  }
);

module.exports = mongoose.models.DynamicReport || mongoose.model('DynamicReport', dynamicReportSchema);

