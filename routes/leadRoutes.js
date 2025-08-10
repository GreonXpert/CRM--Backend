// /server/routes/leadRoutes.js

const express = require('express');
const {
  createLead,
  createLeadFromLink,
  getAllLeads,
  updateLead,
  deleteLead,
} = require('../controllers/leadController');

const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Public route for customers to submit leads via a shared link
router.post('/link/:userId', createLeadFromLink);

// All routes below this are protected
router.use(protect);

router
  .route('/')
  .post(authorize('ADMIN', 'SUPER ADMIN'), createLead)
  .get(authorize('ADMIN', 'SUPER ADMIN'), getAllLeads);

router
  .route('/:id')
  .put(authorize('ADMIN', 'SUPER ADMIN'), updateLead)
  .delete(authorize('ADMIN', 'SUPER ADMIN'), deleteLead);

module.exports = router;
