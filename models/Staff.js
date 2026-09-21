const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      default: '',
      trim: true
    },
    role: {
      type: String,
      required: true,
      default: 'Staff Member'
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Suspended'],
      default: 'Active'
    },
    trustEmail: {
      type: String,
      default: '',
      lowercase: true,
      trim: true
    },
    trustId: {
      type: String,
      default: ''
    },
    trustName: {
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: true,
    strict: false
  }
);

staffSchema.index({ trustEmail: 1, createdAt: -1 });
staffSchema.index({ email: 1 });
staffSchema.index({ phone: 1 });

module.exports = mongoose.models.Staff || mongoose.model('Staff', staffSchema);
