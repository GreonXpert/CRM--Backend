// /server/controllers/userController.js

const User = require('../models/User');

/**
 * @desc    Get all users with filtering and pagination
 * @route   GET /api/users
 * @access  Private (SUPER ADMIN)
 */
exports.getAllUsers = async (req, res, next) => {
  try {
    // Basic filtering (can be expanded)
    const query = req.query.role ? { role: req.query.role } : {};
    
    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await User.countDocuments(query);

    const users = await User.find(query).skip(startIndex).limit(limit);

    // Pagination result
    const pagination = {};
    if (endIndex < total) {
      pagination.next = { page: page + 1, limit };
    }
    if (startIndex > 0) {
      pagination.prev = { page: page - 1, limit };
    }

    res.status(200).json({
      success: true,
      count: users.length,
      pagination,
      data: users,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/**
 * @desc    Update user details
 * @route   PUT /api/users/:id
 * @access  Private (SUPER ADMIN)
 */
exports.updateUser = async (req, res, next) => {
  try {
    // Don't allow password to be updated from this route
    const { password, ...updateData } = req.body;

    const user = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Delete user
 * @route   DELETE /api/users/:id
 * @access  Private (SUPER ADMIN)
 */
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await user.deleteOne();

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};


/**
 * @desc    Change user's own password
 * @route   PUT /api/users/changepassword
 * @access  Private (Logged in user)
 */
exports.changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Get user from the database, including the password
        const user = await User.findById(req.user.id).select('+password');

        // Check if current password matches
        const isMatch = await user.matchPassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Incorrect current password' });
        }

        // Set new password and save
        user.password = newPassword;
        await user.save();

        res.status(200).json({ success: true, message: 'Password updated successfully' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
