const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-in-production') {
  console.warn('⚠️  auth.js: JWT_SECRET is not set — tokens are signed with an insecure default. Set JWT_SECRET in your environment.');
}

// Verify JWT and attach user to req
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    console.warn(`[AUTH] Invalid/expired token — ${req.method} ${req.path} — IP: ${req.ip} — ${err.message}`);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

function requireContractor(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'contractor' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Contractor access required' });
    }
    next();
  });
}

function signToken(payload) {
  // Admins get a shorter-lived token for security; contractors get 7 days for UX
  const expiresIn = payload.role === 'admin' ? '24h' : '7d';
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

// Short-lived, admin-minted token for viewing a contractor's portal (calendar,
// availability) directly. Post-pivot, contractors are never issued a real password
// — this is how Jose verifies things like "did their hours propagate correctly"
// without any shared credentials existing. 2h expiry limits exposure if it leaks.
function signImpersonationToken(payload) {
  return jwt.sign({ ...payload, role: 'contractor' }, JWT_SECRET, { expiresIn: '2h' });
}

module.exports = { requireAuth, requireAdmin, requireContractor, signToken, signImpersonationToken };
