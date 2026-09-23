const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    _id: { type: String },
    title: { type: String, required: true, trim: true },
    type: { type: String, default: 'Custom' },
    status: { type: String, default: 'Published' },
    period: { type: String, default: '' },
    description: { type: String, default: '' },
    trustEmail: { type: String, default: '' },
    trustName: { type: String, default: '' },
    data: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    strict: false
  }
);

module.exports = mongoose.models.Report || mongoose.model('Report', reportSchema);
