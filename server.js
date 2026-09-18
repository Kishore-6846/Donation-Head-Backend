const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');

// Import routes
const authRoutes = require('./routes/authRoutes');
const headRoutes = require('./routes/headRoutes');
const receiptRoutes = require('./routes/receiptRoutes');
const roleRoutes = require('./routes/roleRoutes');
const staffRoutes = require('./routes/staffRoutes');
const reportRoutes = require('./routes/reportRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const planRoutes = require('./routes/planRoutes');
const userRoutes = require('./routes/userRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const receiptTypeRoutes = require('./routes/receiptTypeRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reportTypeRoutes = require('./routes/reportTypeRoutes');
const dynamicReportRoutes = require('./routes/dynamicReportRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Disable caching for all API responses so state updates immediately
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Connect to MongoDB
connectDB();

// Build Trust scoped router
const trustRouter = express.Router();
trustRouter.use('/auth', authRoutes);
trustRouter.use('/donation-heads', headRoutes);
trustRouter.use('/receipts', receiptRoutes);
trustRouter.use('/roles', roleRoutes);
trustRouter.use('/staff', staffRoutes);
trustRouter.use('/reports', reportRoutes);
trustRouter.use('/report-types', reportTypeRoutes);
trustRouter.use('/dynamic-reports', dynamicReportRoutes);
trustRouter.use('/dashboard', dashboardRoutes);
trustRouter.use('/payment', paymentRoutes);

// Build Super Admin scoped router
const superAdminRouter = express.Router();
superAdminRouter.use('/auth', authRoutes);
superAdminRouter.use('/plans', planRoutes);
superAdminRouter.use('/users', userRoutes);
superAdminRouter.use('/employees', employeeRoutes);
superAdminRouter.use('/receipt-types', receiptTypeRoutes);
superAdminRouter.use('/notifications', notificationRoutes);
superAdminRouter.use('/dashboard', dashboardRoutes);
superAdminRouter.use('/reports', reportRoutes);
superAdminRouter.use('/report-types', reportTypeRoutes);
superAdminRouter.use('/dynamic-reports', dynamicReportRoutes);
superAdminRouter.use('/receipts', receiptRoutes);
superAdminRouter.use('/all-receipts', receiptRoutes);
superAdminRouter.use('/donation-heads', headRoutes);
superAdminRouter.use('/roles', roleRoutes);
superAdminRouter.use('/staff', staffRoutes);

// Standard Core API Routes
app.use('/api/auth', authRoutes);
app.use('/api/donation-heads', headRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/report-types', reportTypeRoutes);
app.use('/api/dynamic-reports', dynamicReportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/users', userRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/receipt-types', receiptTypeRoutes);
app.use('/api/notifications', notificationRoutes);

// Mount Trust scoped API prefixes
app.use(['/api/trust', '/trust/api'], trustRouter);

// Mount Super Admin scoped API prefixes (both lower and camelCase supported)
app.use(['/api/superadmin', '/api/superAdmin', '/superadmin/api', '/superAdmin/api'], superAdminRouter);

// Direct PDF view for /trust/print-receipt.php matching PHP URL
const { handleReceiptPdfStream } = require('./routes/receiptRoutes');

app.get([
  '/trust/print-receipt',
  '/trust/print_receipt',
  '/trust/print-receipt.php',
  '/trust/print_receipt.php',
  '/print-receipt',
  '/print_receipt',
  '/print-receipt.php',
  '/print_receipt.php'
], handleReceiptPdfStream);

// Invoice PDF generation for My Subscriptions
const { generateInvoicePDF } = require('./services/invoicePdfService');

app.get([
  '/api/subscriptions/invoice/:invoiceNo/pdf',
  '/api/subscriptions/invoice/pdf',
  '/trust/download-invoice',
  '/trust/download_invoice',
  '/trust/download-invoice.php',
  '/trust/download_invoice.php'
], (req, res) => {
  try {
    return generateInvoicePDF({}, res);
  } catch (err) {
    console.error('Error generating invoice PDF:', err);
    return res.status(500).send('Error generating invoice');
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    message: 'Donation Receipt API server is running smoothly',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Donation Receipt Backend Server running on port ${PORT}`);
  console.log(`🌐 Base URL: http://localhost:${PORT}`);
});
// Super Admin backend ready on port 5001
