const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'donation_receipt_secure_secret_2026';

/**
 * Authentication Middleware
 * Extracts and verifies Bearer JWT token from Authorization header.
 * Attaches decoded user to req.user.
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access Denied: No authentication token provided.'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.'
    });
  }
};

/**
 * Super Admin Role Guard Middleware
 * Ensures the authenticated user has SuperAdmin role or privileges.
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const isSuper = Boolean(
    req.user.isSuperAdmin ||
    (req.user.role && req.user.role.toLowerCase().includes('super')) ||
    (req.user.email && req.user.email.toLowerCase().includes('superadmin'))
  );

  if (!isSuper) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Super Administrator privileges required.'
    });
  }

  next();
};

/**
 * Trust Admin Context Middleware
 * Extracts multi-tenant trust headers and scopes the request.
 */
const scopedTrustMiddleware = (req, res, next) => {
  let tokenEmail = '';
  let tokenTrustName = '';
  let tokenTrustId = '';

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded) {
        tokenEmail = decoded.email || '';
        tokenTrustName = decoded.trustName || decoded.name || '';
        tokenTrustId = decoded._id || decoded.id || decoded.trustId || '';
      }
    } catch (e) {}
  }

  req.trustContext = {
    email: (req.headers['x-trust-email'] || tokenEmail || '').trim(),
    name: (req.headers['x-trust-name'] || tokenTrustName || '').trim(),
    id: (req.headers['x-trust-id'] || tokenTrustId || '').trim()
  };

  next();
};

module.exports = {
  verifyToken,
  requireSuperAdmin,
  scopedTrustMiddleware
};
