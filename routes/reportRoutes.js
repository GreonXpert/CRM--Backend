// /server/routes/reportRoutes.js
const express = require('express');
const { getDashboardStats, generateAndSendMonthlyReport, downloadCustomReport } = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// **FIX:** Allow both SUPER ADMIN and ADMIN to access the dashboard route
router.use(protect, authorize('SUPER ADMIN', 'ADMIN'));

router.get('/dashboard', getDashboardStats);

// The download route is also accessible by both roles
router.post('/download', protect, authorize('SUPER ADMIN', 'ADMIN'), downloadCustomReport);

//Temporary route for testing monthly report generation (can be removed in production)
router.get('/test-monthly-report', (req, res) => {
    generateAndSendMonthlyReport();
    res.status(200).send('Monthly report generation triggered for testing.');
});

module.exports = router;
