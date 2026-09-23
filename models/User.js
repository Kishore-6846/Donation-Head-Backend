const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true
    },
    mobile: {
      type: String,
      default: '',
      trim: true
    },
    trustName: {
      type: String,
      default: '',
      trim: true
    },
    address: {
      type: String,
      default: '',
      trim: true
    },
    state: {
      type: String,
      default: '',
      trim: true
    },
    registrationNo: {
      type: String,
      default: '',
      trim: true
    },
    panNo: {
      type: String,
      default: '',
      trim: true
    },
    fcraNo: {
      type: String,
      default: '',
      trim: true
    },
    section80GRegNo: {
      type: String,
      default: '',
      trim: true
    },
    website: {
      type: String,
      default: '',
      trim: true
    },
    contactPerson: {
      type: String,
      default: '',
      trim: true
    },
    contactPersonEmail: {
      type: String,
      default: '',
      trim: true
    },
    contactPersonMobile: {
      type: String,
      default: '',
      trim: true
    },
    logo: {
      type: String,
      default: ''
    },
    signature: {
      type: String,
      default: ''
    },
    role: {
      type: String,
      default: 'Admin',
      trim: true
    },
    plan: {
      type: String,
      default: 'Standard',
      trim: true
    },
    status: {
      type: String,
      default: 'Active',
      trim: true
    },
    receiptsCount: {
      type: Number,
      default: 0
    },
    joinedDate: {
      type: String,
      default: ''
    },
    isSuperAdmin: {
      type: Boolean,
      default: false
    },
    trialEndsAt: {
      type: Date
    },
    // Dynamic Per-Trust Admin Outgoing SMTP Configuration
    smtpEmail: {
      type: String,
      default: '',
      trim: true
    },
    smtpPassword: {
      type: String,
      default: '',
      trim: true
    },
    smtpHost: {
      type: String,
      default: 'smtp.gmail.com',
      trim: true
    },
    smtpPort: {
      type: Number,
      default: 465
    },
    smtpService: {
      type: String,
      default: 'gmail',
      trim: true
    },
    smtpEnabled: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    strict: false
  }
);

userSchema.index({ role: 1, isSuperAdmin: 1, createdAt: -1 });
userSchema.index({ trustName: 1 });
userSchema.index({ status: 1 });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
