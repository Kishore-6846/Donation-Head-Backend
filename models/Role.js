const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    roleName: {
      type: String,
      required: true,
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
    },
    trustEmail: {
      type: String,
      default: ''
    },
    trustName: {
      type: String,
      default: ''
    },
    trustId: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

// Compound index for role per trust if needed, or non-unique so MongoDB never blocks adding roles
module.exports = mongoose.models.Role || mongoose.model('Role', roleSchema);
