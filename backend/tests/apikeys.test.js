/**
 * apikeys.test.js
 * Tests inbound API key authentication — global env key, per-site DB key, rejection.
 */

jest.mock('../database/db', () => ({
  prepare: jest.fn(),
  query:   jest.fn(),
}));
jest.mock('../services/matchingEngine', () => ({
  matchOnly: jest.fn().mockResolvedValue(false),
  sendMatchNotifications: jest.fn(),
}));
jest.mock('../services/notifications', () => ({ sendAdminNoMatch: jest.fn().mockResolvedValue() }));
jest.mock('../services/auditLog',      () => ({ logEvent: jest.fn(), getEvents: jest.fn() }));
jest.mock('../middleware/auth', () => ({
  requireAdmin:      (req, res, next) => { req.user = { id: 'admin-1', role: 'admin' }; next(); },
  requireContractor: (req, res, next) => { req.user = { id: 'c-1', role: 'contractor' }; next(); },
}));

const express = require('express');
const request = require('supertest');
const db = require('../database/db');

const app = express();
app.use(express.json());
app.use('/api/leads', require('../routes/leads'));

const VALID_ENV_KEY  = 'test-global-key-xyz';
const VALID_SITE_KEY = 'pb_abc123sitekey';

const mockHandle = (overrides = {}) => ({
  get: jest.fn().mockResolvedValue(null),
  all: jest.fn().mockResolvedValue([]),
  run: jest.fn().mockResolvedValue(), // returns resolved promise so .catch() is valid
  ...overrides,
});

function setupHappyPath(siteKeyRow = null) {
  db.prepare.mockImplementation((sql) => {
    if (sql.includes('FROM inbound_api_keys') && sql.includes('key = $1'))
      return mockHandle({ get: jest.fn().mockResolvedValue(siteKeyRow) });
    if (sql.includes('UPDATE inbound_api_keys'))
      return mockHandle();
    if (sql.includes('INTERVAL'))  // dedup check
      return mockHandle({ get: jest.fn().mockResolvedValue(null) });
    if (sql.includes('LOWER(name)') || (sql.includes('FROM niches') && !sql.includes('ALL')))
      return mockHandle({ get: jest.fn().mockResolvedValue({ id: 'niche-1', name: 'HVAC' }), all: jest.fn().mockResolvedValue([{ id: 'niche-1', name: 'HVAC' }]) });
    if (sql.includes('FROM niches'))
      return mockHandle({ all: jest.fn().mockResolvedValue([{ id: 'niche-1', name: 'HVAC' }]) });
    if (sql.includes('INSERT INTO leads'))
      return mockHandle();
    return mockHandle();
  });
}

describe('Inbound API key authentication', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, INBOUND_API_KEY: VALID_ENV_KEY };
  });
  afterAll(() => { process.env = OLD_ENV; });

  test('accepts valid global env key', async () => {
    setupHappyPath(null);

    const res = await request(app)
      .post('/api/leads/inbound')
      .set('Authorization', `Bearer ${VALID_ENV_KEY}`)
      .send({ name: 'John', email: 'john@example.com', zip_code: '98101', niche_slug: 'hvac' });

    expect(res.status).toBe(201);
  });

  test('accepts valid per-site DB key', async () => {
    setupHappyPath({ id: 'key-1', key: VALID_SITE_KEY });
    delete process.env.INBOUND_API_KEY; // force DB key path

    const res = await request(app)
      .post('/api/leads/inbound')
      .set('Authorization', `Bearer ${VALID_SITE_KEY}`)
      .send({ name: 'Jane', email: 'jane@example.com', zip_code: '98101', niche_slug: 'hvac' });

    expect(res.status).toBe(201);
  });

  test('rejects invalid key', async () => {
    db.prepare.mockImplementation((sql) => {
      if (sql.includes('FROM inbound_api_keys')) return mockHandle({ get: jest.fn().mockResolvedValue(null) });
      return mockHandle();
    });

    const res = await request(app)
      .post('/api/leads/inbound')
      .set('Authorization', 'Bearer wrong-key')
      .send({ name: 'Bad', email: 'bad@example.com', zip_code: '98101', niche_slug: 'hvac' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid api key/i);
  });

  test('rejects missing Authorization header', async () => {
    const res = await request(app)
      .post('/api/leads/inbound')
      .send({ name: 'No Key', email: 'nokey@example.com', zip_code: '98101', niche_slug: 'hvac' });

    expect(res.status).toBe(401);
  });
});
