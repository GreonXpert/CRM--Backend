// /server/routes/authRoutes.js

const express = require('express');
const { 
    register, 
    login, 
    forgotPassword, 
    resetPassword 
} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// **FIX:** The register route is now protected and only accessible by a SUPER ADMIN.
router.post('/register', protect, authorize('SUPER ADMIN'), register);


router.post('/register', register);
router.post('/login', login);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword/:resettoken', resetPassword);

module.exports = router;
