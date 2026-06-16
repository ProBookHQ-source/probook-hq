/**
 * dedup.test.js
 * Tests lead deduplication — same email within 30 days should be rejected.
 */

jest.mock('../database/db', () => ({
  prepare: jest.fn(() => ({
    get: jest.fn(),
    all: jest.fn(),
    run: jest.fn(),
  })),
  query: jest.fn(),
}));
jest.mock('../services/matchingEngine', () => ({
  matchOnly: jest.fn().mockResolvedValue(false),
  sendMatchNotifications: jest.fn(),
}));
jest.mock('../services/notifications', () => ({ sendAdminNoMatch: jest.fn() }));
jest.mock('../services/auditLog', () => ({ logEvent: jest.fn(), getEvents: jest.fn() }));

const express = require('express');
const request = require('supertest');
const db = require('../database/db');

// Build a minimal app with just the leads router
const app = express();
app.use(express.json());

// Bypass auth middleware for these tests
jest.mock('../middleware/auth', () => ({
  requireAdmin:     (req, res, next) => { req.user = { id: 'admin-1', role: 'admin' }; next(); },
  requireContractor:(req, res, next) => { req.user = { id: 'c-1', role: 'contractor' }; next(); },
}));

app.use('/api/leads', require('../routes/leads'));

describe('Lead deduplication', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects duplicate email within 30 days on public endpoint', async () => {
    // First call: niche exists
    db.prepare.mockImplementation((sql) => {
      if (sql.includes('FROM niches')) return { get: jest.fn().mockResolvedValue({ id: 'niche-1' }) };
      // Dedup check — returns existing lead
      if (sql.includes('INTERVAL')) return { get: jest.fn().mockResolvedValue({ id: 'existing-lead' }) };
      return { get: jest.fn().mockResolvedValue(null), run: jest.fn(), all: jest.fn().mockResolvedValue([]) };
    });

    const res = await request(app)
      .post('/api/leads')
      .send({ name: 'John', email: 'john@example.com', niche_id: 'niche-1', zip_code: '98101' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already submitted/i);
  });

  test('allows fresh email (no recent lead)', async () => {
    db.prepare.mockImplementation((sql) => {
      if (sql.includes('FROM niches')) return { get: jest.fn().mockResolvedValue({ id: 'niche-1' }) };
      // Dedup check — no existing lead
      if (sql.includes('INTERVAL')) return { get: jest.fn().mockResolvedValue(null) };
      if (sql.includes('INSERT INTO leads')) return { run: jest.fn() };
      return { get: jest.fn().mockResolvedValue(null), run: jest.fn(), all: jest.fn().mockResolvedValue([]) };
    });

    const res = await request(app)
      .post('/api/leads')
      .send({ name: 'Jane', email: 'jane@example.com', niche_id: 'niche-1', zip_code: '98101' });

    expect(res.status).toBe(201);
  });

  test('rejects invalid email format', async () => {
    const res = await request(app)
      .post('/api/leads')
      .send({ name: 'Bad', email: 'not-an-email', niche_id: 'niche-1', zip_code: '98101' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid email/i);
  });

  test('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/leads')
      .send({ name: 'No Email' });

    expect(res.status).toBe(400);
  });
});
