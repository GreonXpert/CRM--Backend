// /server/controllers/leadController.js

const Lead = require('../models/Lead');
const User = require('../models/User');


// Helper function for duplicate check
const checkDuplicateLead = async (panCard, aadharNumber) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const existingLead = await Lead.findOne({
        $or: [{ panCard }, { aadharNumber }],
        createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    }).populate('createdBy', 'name email');

    return existingLead;
};


// @desc    Create a lead manually
// @route   POST /api/leads
// @access  Private (ADMIN, SUPER ADMIN)
exports.createLead = async (req, res, next) => {
  try {
    const { panCard, aadharNumber } = req.body;

    // --- New Validation Check ---
    if (!panCard || !aadharNumber) {
        return res.status(400).json({
            success: false,
            message: 'Please provide both a PAN card and an Aadhar card number.'
        });
    }

    // --- PAN and Aadhar Format Validation ---
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (!panRegex.test(panCard.toUpperCase())) {
        return res.status(400).json({ success: false, message: 'Invalid PAN card format. It should be 5 letters, 4 numbers, and 1 letter.' });
    }

    // Note: Standard Aadhar is 12 digits.
    const aadharRegex = /^[0-9]{12}$/;
    if (!aadharRegex.test(aadharNumber)) {
        return res.status(400).json({ success: false, message: 'Invalid Aadhar card format. It should be 12 digits.' });
    }
    // --- End Format Validation ---


    // --- Duplicate Check Logic ---
    const duplicateLead = await checkDuplicateLead(panCard, aadharNumber);
    if (duplicateLead) {
        const creator = duplicateLead.createdBy;
        return res.status(409).json({ // 409 Conflict status
            success: false,
            message: `This lead already exists for this month. It was created by ${creator.name} (${creator.email}). You can add this lead again next month.`
        });
    }
    // --- End Duplicate Check ---

    const user = await User.findById(req.user.id);
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }

    req.body.createdBy = req.user.id;
    req.body.createdByName = user.name;
    req.body.source = 'Manual';

    const lead = await Lead.create(req.body);

    res.status(201).json({
      success: true,
      data: lead,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};


// @desc    Create a lead from a shared link
// @route   POST /api/leads/link/:userId
// @access  Public
exports.createLeadFromLink = async (req, res, next) => {
    try {
        const { panCard, aadharNumber } = req.body;
        const userId = req.params.userId;

        const userExists = await User.findById(userId);
        if (!userExists) {
            return res.status(404).json({ success: false, message: 'Invalid referral link.' });
        }

        // --- New Validation Check ---
        if (!panCard || !aadharNumber) {
            return res.status(400).json({
                success: false,
                message: 'Please provide both a PAN card and an Aadhar card number.'
            });
        }

        // --- PAN and Aadhar Format Validation ---
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        if (!panRegex.test(panCard.toUpperCase())) {
            return res.status(400).json({ success: false, message: 'Invalid PAN card format. It should be 5 letters, 4 numbers, and 1 letter.' });
        }
        
        // Note: Standard Aadhar is 12 digits.
        const aadharRegex = /^[0-9]{16}$/;
        if (!aadharRegex.test(aadharNumber)) {
            return res.status(400).json({ success: false, message: 'Invalid Aadhar card format. It should be 16 digits.' });
        }
        // --- End Format Validation ---

        // --- Duplicate Check Logic ---
        const duplicateLead = await checkDuplicateLead(panCard, aadharNumber);
        if (duplicateLead) {
            return res.status(409).json({
                success: false,
                message: `This lead already exists. Please try again after this month.`
            });
        }
        // --- End Duplicate Check ---

        req.body.createdBy = userId;
        req.body.createdByName = userExists.name;
        req.body.source = 'Link';

        const lead = await Lead.create(req.body);

        res.status(201).json({
            success: true,
            message: 'Lead submitted successfully!',
            data: lead,
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};


// @desc    Get all leads
// @route   GET /api/leads
// @access  Private (ADMIN, SUPER ADMIN)
exports.getAllLeads = async (req, res, next) => {
  try {
    const queryOptions = {};

    // **FIX:** Only filter by creator if the logged-in user is NOT a SUPER ADMIN.
    // This ensures ADMIN users can only see their own leads.
    if (req.user.role !== 'SUPER ADMIN') {
      queryOptions.createdBy = req.user.id;
    }

    const leads = await Lead.find(queryOptions).populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      count: leads.length,
      data: leads,
    });
  } catch (error) {
    console.error(error); // Added for better debugging
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Update a lead
// @route   PUT /api/leads/:id
// @access  Private (ADMIN, SUPER ADMIN)
exports.updateLead = async (req, res, next) => {
  try {
    let lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    // Check permissions: SUPER ADMIN can edit any lead. ADMIN can only edit their own.
    if (lead.createdBy.toString() !== req.user.id && req.user.role !== 'SUPER ADMIN') {
      return res.status(403).json({ success: false, message: 'Not authorized to update this lead' });
    }

    // --- History Tracking ---
    const previousData = { ...lead.toObject() };
    delete previousData.editHistory; // Don't include old history in the snapshot

    // Update the lead
    lead = await Lead.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
    });

    const newData = { ...lead.toObject() };
    delete newData.editHistory;

    // Add to edit history
    lead.editHistory.push({
        editorId: req.user.id,
        previousData,
        newData,
    });
    await lead.save();
    // --- End History Tracking ---

    res.status(200).json({ success: true, data: lead });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Delete a lead
// @route   DELETE /api/leads/:id
// @access  Private (ADMIN, SUPER ADMIN)
exports.deleteLead = async (req, res, next) => {
    try {
        const lead = await Lead.findById(req.params.id);

        if (!lead) {
            return res.status(404).json({ success: false, message: 'Lead not found' });
        }

        // Check permissions: SUPER ADMIN can delete any lead. ADMIN can only delete their own.
        if (lead.createdBy.toString() !== req.user.id && req.user.role !== 'SUPER ADMIN') {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this lead' });
        }

        await lead.deleteOne();

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
