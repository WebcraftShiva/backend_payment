const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
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
    required: true,
    minlength: 6
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  paymentGateway: {
    type: String,
    enum: ['easebuzz', 'upigateway', null],
    default: null
  },
  transactionCount: {
    type: Number,
    default: null,
    min: 0
  },
  transactionLimit: {
    type: Number,
    default: null,
    min: 0
  },
  allowedGateways: {
    type: [String],
    enum: ['easebuzz', 'upigateway'],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Validate that either transactionCount or transactionLimit is provided, but not both
userSchema.pre('save', function(next) {
  if (this.transactionCount !== null && this.transactionCount !== undefined && 
      this.transactionLimit !== null && this.transactionLimit !== undefined) {
    return next(new Error('Cannot set both transactionCount and transactionLimit. Please provide only one.'));
  }
  next();
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);

