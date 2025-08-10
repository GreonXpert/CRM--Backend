// /server/models/Lead.js

const mongoose = require('mongoose');

const editHistorySchema = new mongoose.Schema({
  editorId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  previousData: {
    type: Object,
    required: true,
  },
  newData: {
    type: Object,
    required: true,
  }
}, { _id: false });


const leadSchema = new mongoose.Schema({
  customerName: {
    type: String,
    required: [true, 'Please add a customer name'],
    trim: true,
  },
  mobileNumber: {
    type: String,
    required: [true, 'Please add a mobile number'],
    match: [/^[0-9]{10}$/, 'Please add a valid 10-digit mobile number'],
  },
  panCard: {
    type: String,
    required: [true, 'Please add a PAN card number'],
    uppercase: true,
    trim: true,
  },
  aadharNumber: {
    type: String,
    required: [true, 'Please add an Aadhar card number'],
    trim: true,
  },
  preferredBank: {
    type: String,
  },
  employmentType: {
    type: String,
    enum: ['Salaried', 'Self-Employed'],
  },
  monthlySalary: {
    type: Number,
  },
  status: {
    type: String,
    enum: ['New', 'Follow-up', 'Approved', 'Rejected'],
    default: 'New',
  },
  // --- New Rejection Fields ---
  rejectionReason: {
      type: String,
      enum: ['', 'CIBIL Issue', 'Low Income', 'Documentation Missing', 'Not Interested', 'Poor Lead', 'Other'],
      default: ''
  },
  rejectionNotes: {
      type: String,
      trim: true
  },
  // --- End Rejection Fields ---
  source: {
    type: String,
    enum: ['Manual', 'Link'],
    default: 'Manual',
  },
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  editHistory: [editHistorySchema],
}, {
  timestamps: true,
});

module.exports = mongoose.model('Lead', leadSchema);
