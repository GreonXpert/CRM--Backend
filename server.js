// /server/server.js

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const dotenv = require('dotenv');
const cors = require('cors');
const cron = require('node-cron');
const connectDB = require('./config/db');
const { generateAndSendMonthlyReport } = require('./controllers/reportController');

// Load environment variables
dotenv.config();

// Connect to Database
connectDB();

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*", // In production, restrict this to your frontend URL
        methods: ["GET", "POST"]
    }
});

// --- Middleware ---

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Make io accessible to our routes by attaching it to the request object
app.use((req, res, next) => {
    req.io = io;
    next();
});

// --- Socket.io Connection Logic ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// --- Import API Routes ---
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const leadRoutes = require('./routes/leadRoutes');
const reportRoutes = require('./routes/reportRoutes');

// --- Mount Routers ---
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/reports', reportRoutes);

// --- Scheduled Tasks (Cron Job) ---
// This will run at 2:00 AM on the 1st day of every month.
cron.schedule('0 2 1 * *', () => {
    console.log('CRON JOB: Running monthly report generation task...');
    generateAndSendMonthlyReport();
}, {
    scheduled: true,
    timezone: "Asia/Kolkata"
});

const PORT = process.env.PORT || 7736;

// Use server.listen to start both Express and Socket.IO
server.listen(PORT, () => {
  console.log(`Server with real-time reports running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
