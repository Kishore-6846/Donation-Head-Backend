const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    empId: {
      type: String,
      required: true,
      trim: true
    },
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
      default: ''
    },
    role: {
      type: String,
      required: true,
      default: 'Support Executive'
    },
    department: {
      type: String,
      default: 'Customer Success'
    },
    permissions: {
      type: [String],
      default: ['View Dashboard', 'Manage Users', 'View Reports']
    },
    status: {
      type: String,
      default: 'Active'
    },
    joinedDate: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true,
    strict: false
  }
);

module.exports = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);
