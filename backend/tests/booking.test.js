/**
 * booking.test.js
 * Tests the booking flow: token validation, double-booking, max daily cap,
 * past-date rejection, and missing fields.
 */

jest.mock('../database/db', () => ({
  prepare: jest.fn(),
  query:   jest.fn(),
  transaction: jest.fn(),
}));
jest.mock('../services/googleCalendar', () => ({ createEvent: jest.fn(), deleteEvent: jest.fn(), getAuthUrl: jest.fn() }));
jest.mock('../services/notifications',  () => ({
  sendAppointmentConfirmation: jest.fn().mockResolvedValue(),
  sendCancellationAndRebook: jest.fn(),
}));
jest.mock('../services/auditLog', () => ({ logEvent: jest.fn() }));
jest.mock('../middleware/auth', () => ({
  requireAdmin:      (req, res, next) => { req.user = { id: 'admin-1', role: 'admin' }; next(); },
  requireContractor: (req, res, next) => { req.user = { id: 'c-1', role: 'contractor' }; next(); },
}));

const express = require('express');
const request = require('supertest');
const db = require('../database/db');

const app = express();
app.use(express.json());
app.use('/api/bookings', require('../routes/bookings'));

const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const FUTURE_TIME = '10:00';

const mockHandle = (overrides = {}) => ({
  get: jest.fn().mockResolvedValue(null),
  all: jest.fn().mockResolvedValue([]),
  run: jest.fn().mockResolvedValue(),
  ...overrides,
});

const TOKEN    = { id: 'tok-1', lead_id: 'lead-1', token: 'valid', used: 0, expires_at: new Date(Date.now() + 48 * 3600 * 1000) };
const LEAD     = { id: 'lead-1', name: 'John', email: 'j@x.com', phone: '555', assigned_contractor_id: 'c-1', status: 'matched' };
const ACTIVE_C = { id: 'c-1', name: 'Test Co', email: 'c@x.com', company_name: 'TC', is_active: 1, google_refresh_token: null, max_appointments_per_day: null };
const SLOT     = { start_time: '09:00', end_time: '17:00', is_active: 1 }; // covers 10:00

describe('Booking flow', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects expired / invalid token', async () => {
    db.prepare.mockImplementation(() => mockHandle({ get: jest.fn().mockResolvedValue(null) }));

    const res = await request(app)
      .post('/api/bookings/book')
      .send({ token: 'bad', date: FUTURE_DATE, time: FUTURE_TIME });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  test('rejects already-booked lead', async () => {
    db.prepare.mockImplementation((sql) => {
      if (sql.includes('FROM booking_tokens')) return mockHandle({ get: jest.fn().mockResolvedValue(TOKEN) });
      if (sql.includes('FROM leads'))          return mockHandle({ get: jest.fn().mockResolvedValue({ ...LEAD, status: 'booked' }) });
      return mockHandle();
    });

    const res = await request(app)
      .post('/api/bookings/book')
      .send({ token: 'valid', date: FUTURE_DATE, time: FUTURE_TIME });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already been booked/i);
  });

  test('rejects past date/time', async () => {
    db.prepare.mockImplementation((sql) => {
      if (sql.includes('FROM booking_tokens')) return mockHandle({ get: jest.fn().mockResolvedValue(TOKEN) });
      if (sql.includes('FROM leads'))          return mockHandle({ get: jest.fn().mockResolvedValue(LEAD) });
      if (sql.includes('FROM contractors'))    return mockHandle({ get: jest.fn().mockResolvedValue(ACTIVE_C) });
      return mockHandle();
    });

    const res = await request(app)
      .post('/api/bookings/book')
      .send({ token: 'valid', date: '2020-01-01', time: '09:00' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/past/i);
  });

  test('rejects when contractor is at max daily cap', async () => {
    const cappedContractor = { ...ACTIVE_C, max_appointments_per_day: 2 };
    db.prepare.mockImplementation((sql) => {
      if (sql.includes('FROM booking_tokens'))      return mockHandle({ get: jest.fn().mockResolvedValue(TOKEN) });
      if (sql.includes('FROM leads'))               return mockHandle({ get: jest.fn().mockResolvedValue(LEAD) });
      if (sql.includes('FROM contractors'))         return mockHandle({ get: jest.fn().mockResolvedValue(cappedContractor) });
      if (sql.includes('availability_overrides'))   return mockHandle({ get: jest.fn().mockResolvedValue(null) });
      if (sql.includes('availability_slots'))       return mockHandle({ all: jest.fn().mockResolvedValue([SLOT]) });
      return mockHandle();
    });
    // Cap check uses db.query
    db.query.mockResolvedValue({ rows: [{ cnt: '2' }] });

    const res = await request(app)
      .post('/api/bookings/book')
      .send({ token: 'valid', date: FUTURE_DATE, time: FUTURE_TIME });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/fully booked/i);
  });

  test('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/bookings/book')
      .send({ token: 'valid' }); // missing date + time

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });
});
