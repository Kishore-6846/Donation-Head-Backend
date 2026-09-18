const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    roleName: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    permissions: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    created: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.Role || mongoose.model('Role', roleSchema);
