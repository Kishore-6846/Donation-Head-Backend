const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  regNo: { type: String, required: true },
  validFrom: { type: String, default: '' },
  validUpto: { type: String, default: '' },
  page1: { type: String, default: '' },
  page2: { type: String, default: '' },
  trustEmail: { type: String, default: '' },
  trustName: { type: String, default: '' },
  createdBy: { type: String, default: '' }
}, { timestamps: true, strict: false });

certificateSchema.index({ trustEmail: 1, createdAt: -1 });
certificateSchema.index({ regNo: 1 });
certificateSchema.index({ createdBy: 1 });

module.exports = mongoose.models.Certificate || mongoose.model('Certificate', certificateSchema);
