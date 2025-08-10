// /server/routes/userRoutes.js

const express = require('express');
const {
  getAllUsers,
  updateUser,
  deleteUser,
  changePassword
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply protect middleware to all routes in this file
router.use(protect);

// --- Route for any logged-in user ---
router.put('/changepassword', changePassword);
// --- Routes for SUPER ADMIN ---
router
  .route('/')
  .get(authorize('SUPER ADMIN'), getAllUsers);

router
  .route('/:id')
  .put(authorize('SUPER ADMIN'), updateUser)
  .delete(authorize('SUPER ADMIN'), deleteUser);




module.exports = router;
