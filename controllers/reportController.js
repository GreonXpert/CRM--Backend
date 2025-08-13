// /server/controllers/reportController.js
const Lead = require('../models/Lead');
const User = require('../models/User');
const sendEmail = require('../utils/emailSender');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { Writable } = require('stream');

/**
 * @desc    Get dashboard statistics based on user role
 * @route   GET /api/reports/dashboard
 * @access  Private (ADMIN, SUPER ADMIN)
 */
exports.getDashboardStats = async (req, res, next) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // --- Role-Based Filter ---
        // Create a filter object. If the user is a SUPER ADMIN, it will be empty.
        // If the user is an ADMIN, it will filter by their ID.
        const filter = {};
        if (req.user.role !== 'SUPER ADMIN') {
            filter.createdBy = req.user.id;
        }

        // Aggregate leads by status using the filter
        const leadStatusCounts = await Lead.aggregate([
            { $match: filter }, // This stage applies our role-based filter
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        const totalLeads = await Lead.countDocuments(filter);
        const leadsLast30Days = await Lead.countDocuments({ 
            ...filter, 
            createdAt: { $gte: thirtyDaysAgo } 
        });

        const stats = {
            totalLeads,
            leadsLast30Days,
            statusCounts: {
                New: 0,
                'Follow-up': 0,
                Approved: 0,
                Rejected: 0
            }
        };

        leadStatusCounts.forEach(status => {
            stats.statusCounts[status._id] = status.count;
        });

        // Calculate Ratios
        stats.approvalRatio = totalLeads > 0 ? (stats.statusCounts.Approved / totalLeads) * 100 : 0;
        stats.rejectionRatio = totalLeads > 0 ? (stats.statusCounts.Rejected / totalLeads) * 100 : 0;

        res.status(200).json({
            success: true,
            data: stats
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get user performance statistics for analytics
// @route   GET /api/reports/user-performance
// @access  Private (SUPER ADMIN)
exports.getUserPerformanceStats = async (req, res, next) => {
  try {
    // Fetch all users and leads in parallel for efficiency
    const [users, leads] = await Promise.all([
      User.find({ role: { $in: ['ADMIN', 'SUPER ADMIN'] } }).select('name').lean(),
      Lead.find().select('createdBy status').lean()
    ]);

    // Create a map for quick lead lookup
    const leadsByCreator = leads.reduce((acc, lead) => {
      const creatorId = lead.createdBy.toString();
      if (!acc[creatorId]) {
        acc[creatorId] = [];
      }
      acc[creatorId].push(lead);
      return acc;
    }, {});

    const performanceData = users.map(user => {
      const userLeads = leadsByCreator[user._id.toString()] || [];
      
      const approved = userLeads.filter(l => l.status === 'Approved').length;
      const rejected = userLeads.filter(l => l.status === 'Rejected').length;
      const pending = userLeads.filter(l => ['New', 'Follow-up'].includes(l.status)).length;

      return {
        name: user.name,
        leads: userLeads.length,
        approved,
        rejected,
        pending,
      };
    });

    res.status(200).json({
      success: true,
      data: performanceData
    });

  } catch (error) {
    console.error('Error fetching user performance stats:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};


/**
 * @desc    Generate and download a custom date-range report in CSV or PDF format
 * @route   POST /api/reports/download
 * @access  Private (ADMIN, SUPER ADMIN)
 */
exports.downloadCustomReport = async (req, res, next) => {
    try {
        const { startDate, endDate, adminId, format = 'csv' } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'Please provide a start and end date.' });
        }

        const filter = {
            createdAt: {
                $gte: new Date(startDate),
                $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) // Ensure end of day
            }
        };

        if (req.user.role === 'ADMIN') {
            filter.createdBy = req.user.id;
        } else if (req.user.role === 'SUPER ADMIN' && adminId) {
            filter.createdBy = adminId;
        }

        const leads = await Lead.find(filter).populate('createdBy', 'name email');
        
        const totalLeads = leads.length;
        const approvedCount = leads.filter(l => l.status === 'Approved').length;
        const rejectedCount = leads.filter(l => l.status === 'Rejected').length;
        const approvalRate = totalLeads > 0 ? ((approvedCount / totalLeads) * 100).toFixed(2) : "0.00";

        const reportDate = new Date().toISOString().split('T')[0];

        if (format.toLowerCase() === 'pdf') {
            // --- Generate Attractive PDF File ---
            const pdfDoc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="Custom_Report_${reportDate}.pdf"`);
            pdfDoc.pipe(res);

            // --- PDF Design ---
            const lightGrey = '#F5F5F5';
            const mediumGrey = '#E0E0E0';
            const darkGrey = '#424242';
            const accentColor = '#1E88E5'; // A slightly different blue

            // Helper function to draw a stat card
            const drawStatCard = (x, y, title, value) => {
                pdfDoc.roundedRect(x, y, 170, 60, 5).fillAndStroke(lightGrey, mediumGrey);
                pdfDoc.fontSize(10).fillColor(darkGrey).text(title, x + 15, y + 12);
                pdfDoc.fontSize(22).fillColor(accentColor).font('Helvetica-Bold').text(value, x + 15, y + 30);
                pdfDoc.font('Helvetica'); // Reset font
            };
            
            // Helper function to draw table rows
            const drawTableRow = (y, items, isHeader = false) => {
                const rowHeight = 25;
                const startX = 30;
                const tableWidth = pdfDoc.page.width - 60;
                const columnWidths = [70, 120, 80, 100, 70, 120, 120];

                if (isHeader) {
                    pdfDoc.rect(startX, y, tableWidth, rowHeight).fill(mediumGrey);
                    pdfDoc.font('Helvetica-Bold').fillColor(darkGrey);
                } else {
                    pdfDoc.rect(startX, y, tableWidth, rowHeight).fill(index % 2 ? '#FFFFFF' : lightGrey);
                    pdfDoc.font('Helvetica').fillColor(darkGrey);
                }
                
                let currentX = startX;
                items.forEach((item, i) => {
                    pdfDoc.text(item, currentX + 5, y + 8, { width: columnWidths[i] - 10, align: 'left' });
                    currentX += columnWidths[i];
                });
            };

            // --- PDF Content ---
            // Header
            pdfDoc.rect(0, 0, pdfDoc.page.width, 90).fill(accentColor);
            pdfDoc.fontSize(24).fillColor('#FFFFFF').font('Helvetica-Bold').text('EBS Cards Lead Report', 30, 30);
            pdfDoc.fontSize(12).font('Helvetica').text(`Date Range: ${startDate} to ${endDate}`, 30, 60);

            // Stat Cards
            drawStatCard(30, 110, 'Total Leads Generated', totalLeads);
            drawStatCard(220, 110, 'Leads Approved', approvedCount);
            drawStatCard(410, 110, 'Leads Rejected', rejectedCount);
            drawStatCard(600, 110, 'Approval Rate', `${approvalRate}%`);
            
            // Table
            const tableTop = 200;
            const tableHeaders = ['Date', 'Customer', 'Mobile', 'PAN', 'Status', 'Rejection Reason', 'Created By'];
            drawTableRow(tableTop, tableHeaders, true);

            let currentY = tableTop + 25;
            let index = 0;
            leads.forEach(lead => {
                const row = [
                    lead.createdAt.toISOString().split('T')[0],
                    lead.customerName,
                    lead.mobileNumber,
                    lead.panCard,
                    lead.status,
                    lead.rejectionReason || 'N/A',
                    lead.createdBy ? lead.createdBy.name : 'N/A'
                ];
                drawTableRow(currentY, row, false);
                currentY += 25;
                index++;

                if (currentY > pdfDoc.page.height - 50) {
                    pdfDoc.addPage({ margin: 30, size: 'A4', layout: 'landscape' });
                    currentY = 30; // Reset Y for new page
                    drawTableRow(currentY, tableHeaders, true); // Redraw header on new page
                    currentY += 25;
                }
            });

            pdfDoc.end();

        } else {
            // --- Generate CSV File ---
            const headers = ['Date Created', 'Customer Name', 'Mobile', 'PAN', 'Aadhar', 'Status', 'Rejection Reason', 'Rejection Notes', 'Created By'];
            const escapeCsv = (val) => `"${String(val).replace(/"/g, '""')}"`;
            const csvRows = leads.map(lead => [
                escapeCsv(lead.createdAt.toISOString().split('T')[0]),
                escapeCsv(lead.customerName),
                escapeCsv(lead.mobileNumber),
                escapeCsv(lead.panCard),
                escapeCsv(lead.aadharNumber),
                escapeCsv(lead.status),
                escapeCsv(lead.rejectionReason || ''),
                escapeCsv(lead.rejectionNotes || ''),
                escapeCsv(lead.createdBy ? lead.createdBy.name : 'N/A')
            ].join(','));
            const csv = `${headers.join(',')}\n${csvRows.join('\n')}`;
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="Custom_Report_${reportDate}.csv"`);
            res.status(200).send(csv);
        }

    } catch (error) {
        console.error('Error generating custom report:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};


/**
 * @desc    Function to generate and email the monthly consolidated report as attachments
 * @access  Internal (called by a scheduled job)
 */
exports.generateAndSendMonthlyReport = async () => {
    try {
        console.log('Generating monthly performance report...');
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const startOfLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
        const endOfLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0, 23, 59, 59);

        const reportMonthString = startOfLastMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

        const admins = await User.find({ role: 'ADMIN' });
        
        // --- Prepare Data for Report ---
        const reportData = [];
        for (const admin of admins) {
            const leads = await Lead.find({
                createdBy: admin._id,
                createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }
            });

            const totalCreated = leads.length;
            const approvedCount = leads.filter(l => l.status === 'Approved').length;
            const rejectedCount = leads.filter(l => l.status === 'Rejected').length;
            const approvalRate = totalCreated > 0 ? ((approvedCount / totalCreated) * 100).toFixed(2) : 0;

            reportData.push({
                name: admin.name,
                email: admin.email,
                totalCreated,
                approvedCount,
                rejectedCount,
                approvalRate
            });
        }

        // --- Generate Excel File Buffer ---
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`Report for ${reportMonthString}`);
        worksheet.columns = [
            { header: 'Admin Name', key: 'name', width: 30 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Leads Created', key: 'totalCreated', width: 15 },
            { header: 'Approved', key: 'approvedCount', width: 15 },
            { header: 'Rejected', key: 'rejectedCount', width: 15 },
            { header: 'Approval Rate (%)', key: 'approvalRate', width: 20 },
        ];
        worksheet.addRows(reportData);
        const excelBuffer = await workbook.xlsx.writeBuffer();

        // --- Generate PDF File Buffer ---
        const pdfDoc = new PDFDocument();
        const pdfChunks = [];
        pdfDoc.pipe(new Writable({
            write(chunk, encoding, callback) {
                pdfChunks.push(chunk);
                callback();
            }
        }));

        pdfDoc.fontSize(18).text(`Monthly Performance Report for ${reportMonthString}`, { align: 'center' });
        pdfDoc.moveDown();
        
        // Simple table for PDF
        const tableTop = 150;
        const itemX = 50;
        pdfDoc.fontSize(10);
        const headers = ['Admin Name', 'Email', 'Created', 'Approved', 'Rejected', 'Rate (%)'];
        let startX = itemX;
        headers.forEach(header => {
            pdfDoc.text(header, startX, tableTop, { width: 90, align: 'left' });
            startX += 90;
        });
        
        let y = tableTop + 25;
        reportData.forEach(row => {
            startX = itemX;
            pdfDoc.text(row.name, startX, y, { width: 90 });
            startX += 90;
            pdfDoc.text(row.email, startX, y, { width: 90 });
            startX += 90;
            pdfDoc.text(row.totalCreated.toString(), startX, y, { width: 90 });
            startX += 90;
            pdfDoc.text(row.approvedCount.toString(), startX, y, { width: 90 });
            startX += 90;
            pdfDoc.text(row.rejectedCount.toString(), startX, y, { width: 90 });
            startX += 90;
            pdfDoc.text(row.approvalRate.toString(), startX, y, { width: 90 });
            y += 25;
        });

        pdfDoc.end();
        const pdfBuffer = Buffer.concat(pdfChunks);

        // --- Send Email with Attachments ---
        const superAdmins = await User.find({ role: 'SUPER ADMIN' });
        for (const superAdmin of superAdmins) {
            await sendEmail({
                email: superAdmin.email,
                subject: `EBS Cards - Monthly Report for ${reportMonthString}`,
                html: `<p>Please find the consolidated performance report for ${reportMonthString} attached.</p>`,
                attachments: [
                    {
                        filename: `Report_${reportMonthString.replace(' ', '_')}.xlsx`,
                        content: excelBuffer,
                        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    },
                    {
                        filename: `Report_${reportMonthString.replace(' ', '_')}.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf',
                    }
                ]
            });
            console.log(`Monthly report sent to super admin: ${superAdmin.email}`);
        }

    } catch (error) {
        console.error('Error generating and sending monthly report:', error);
    }
};
