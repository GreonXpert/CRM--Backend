// /server/controllers/authController.js

const User = require('../models/User');
const crypto = require('crypto');
const sendEmail = require('../utils/emailSender'); // Assumes emailSender.js is created

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role,
    });

    sendTokenResponse(user, 201, res);
  } catch (error) {
    let message = 'Something went wrong. Please try again.';

    // Check for the specific duplicate key error code
    if (error.code === 11000) {
      message = 'A user with that email already exists.';
    } else if (error.name === 'ValidationError') {
      // Handle other validation errors from Mongoose
      message = Object.values(error.errors).map(val => val.message).join(', ');
    }

    console.error(error); // Keep logging the full error for debugging
    res.status(400).json({ success: false, message: message });
  }
};

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide an email and password' });
    }

    // Check for user and include the password field for comparison
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Helper function to get token from model and send response
const sendTokenResponse = (user, statusCode, res) => {
  // Create token
  const token = user.getSignedJwtToken();

  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    }
  });
};


/**
 * @desc    Forgot password
 * @route   POST /api/auth/forgotpassword
 * @access  Public
 */
exports.forgotPassword = async (req, res, next) => {
    try {
        const user = await User.findOne({ email: req.body.email });

        if (!user) {
            // Note: For security, we send a success response even if the user doesn't exist
            // This prevents attackers from checking which emails are registered.
            return res.status(200).json({ success: true, data: 'If a user with that email exists, a password reset link has been sent.' });
        }

        // Get reset token from the user model
        const resetToken = user.getResetPasswordToken();
        
        // Save the user with the new reset token and expiry date
        await user.save({ validateBeforeSave: false });

        // Create the full reset URL for the email
        // This URL will point to your frontend page that handles the password reset
        const resetUrl = `${process.env.FRONTEND_URL}/resetpassword/${resetToken}`;

        const message = `You are receiving this email because you (or someone else) has requested the reset of a password. Please click the link below to reset your password:\n\n${resetUrl}\n\nIf you did not request this, please ignore this email. This link is valid for 10 minutes.`;

        // Try to send the email
        await sendEmail({
            email: user.email,
            subject: 'EBS Cards - Password Reset Request',
            message
        });

        res.status(200).json({ success: true, data: 'Email sent successfully.' });

    } catch (error) {
        console.error('Forgot Password Error:', error);
        
        // Clear the token fields on error to allow the user to try again
        if (user) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;
            await user.save({ validateBeforeSave: false });
        }
        
        res.status(500).json({ success: false, message: 'Email could not be sent. Please try again later.' });
    }
};


/**
 * @desc    Reset password
 * @route   PUT /api/auth/resetpassword/:resettoken
 * @access  Public
 */
exports.resetPassword = async (req, res, next) => {
    try {
        // Get the hashed token from the URL parameter
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(req.params.resettoken)
            .digest('hex');

        // Find the user by the hashed token and check if the token is still valid (not expired)
        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() } // $gt means "greater than"
        });

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid or expired token. Please try again.' });
        }

        // Set the new password
        user.password = req.body.password;
        // Clear the reset token fields after successful reset
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

        // Send back a new login token
        sendTokenResponse(user, 200, res);

    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
