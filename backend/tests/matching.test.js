/**
 * matching.test.js
 * Unit tests for the matching engine — zip matching, round-robin, no-match.
 * DB is fully mocked so no Postgres connection needed.
 */

jest.mock('../database/db', () => ({
  prepare: jest.fn(),
  query:   jest.fn(),
}));
jest.mock('../services/auditLog',      () => ({ logEvent: jest.fn() }));
jest.mock('../services/notifications', () => ({
  sendBookingLink: jest.fn(), notifyContractor: jest.fn(),
}));

// Require once — same db mock instance that matchingEngine will use
const db = require('../database/db');
const { matchOnly } = require('../services/matchingEngine');

// Full mock handle — every method present, all returning resolved promises
const mockHandle = (overrides = {}) => ({
  get: jest.fn().mockResolvedValue(null),
  all: jest.fn().mockResolvedValue([]),
  run: jest.fn().mockResolvedValue(),
  ...overrides,
});

function makeLead(zip = '98101', status = 'new') {
  return { id: 'lead-1', niche_id: 'niche-1', zip_code: zip, status, niche_name: 'HVAC' };
}

function makeContractor(id = 'c-1', zips = ['98101']) {
  return { id, name: `Contractor ${id}`, niche_id: 'niche-1', is_active: 1,
    service_zip_codes: JSON.stringify(zips), service_radius_miles: null };
}

describe('Matching engine', () => {
  beforeEach(() => jest.clearAllMocks());

  test('exact zip match selects eligible contractor', async () => {
    const lead = makeLead();
    const contractor = makeContractor();
    db.prepare.mockImplementation((sql) => {
      if (sql.includes('FROM leads'))       return mockHandle({ get: jest.fn().mockResolvedValue(lead) });
      if (sql.includes('FROM contractors')) return mockHandle({ all: jest.fn().mockResolvedValue([contractor]) });
      return mockHandle();
    });
    const result = await matchOnly('lead-1');
    expect(result).toBe(true);
  });

  test('wildcard zip * matches any lead zip', async () => {
    const lead = makeLead('10001');
    const contractor = makeContractor('c-1', ['*']);
    db.prepare.mockImplementation((sql) => {
      if (sql.includes('FROM leads'))       return mockHandle({ get: jest.fn().mockResolvedValue(lead) });
      if (sql.includes('FROM contractors')) return mockHandle({ all: jest.fn().mockResolvedValue([contractor]) });
      return mockHandle();
    });
    const result = await matchOnly('lead-1');
    expect(result).toBe(true);
  });

  test('returns false when no eligible contractors', async () => {
    const lead = makeLead('99999');
    db.prepare.mockImplementation((sql) => {
      if (sql.includes('FROM leads'))       return mockHandle({ get: jest.fn().mockResolvedValue(lead) });
      if (sql.includes('FROM contractors')) return mockHandle({ all: jest.fn().mockResolvedValue([]) });
      return mockHandle();
    });
    const result = await matchOnly('lead-1');
    expect(result).toBe(false);
  });

  test('returns false for already-booked lead', async () => {
    const lead = makeLead('98101', 'booked');
    db.prepare.mockImplementation((sql) => {
      if (sql.includes('FROM leads')) return mockHandle({ get: jest.fn().mockResolvedValue(lead) });
      return mockHandle();
    });
    const result = await matchOnly('lead-1');
    expect(result).toBe(false);
  });

  test('zip mismatch with no radius → no match', async () => {
    const lead = makeLead('10001');
    const contractor = makeContractor('c-1', ['98101']); // different zip, no radius
    db.prepare.mockImplementation((sql) => {
      if (sql.includes('FROM leads'))       return mockHandle({ get: jest.fn().mockResolvedValue(lead) });
      if (sql.includes('FROM contractors')) return mockHandle({ all: jest.fn().mockResolvedValue([contractor]) });
      return mockHandle();
    });
    const result = await matchOnly('lead-1');
    expect(result).toBe(false);
  });

  test('round-robin updates state after match', async () => {
    const lead = makeLead();
    const contractors = [makeContractor('c-1'), makeContractor('c-2')];
    const rrState = { last_contractor_id: 'c-1', niche_id: 'niche-1', zip_code: '98101' };
    const updateRun = jest.fn().mockResolvedValue();

    db.prepare.mockImplementation((sql) => {
      if (sql.includes('FROM leads'))           return mockHandle({ get: jest.fn().mockResolvedValue(lead) });
      if (sql.includes('FROM contractors'))     return mockHandle({ all: jest.fn().mockResolvedValue(contractors) });
      if (sql.includes('SELECT') && sql.includes('round_robin_state'))
        return mockHandle({ get: jest.fn().mockResolvedValue(rrState) });
      if (sql.includes('UPDATE round_robin_state'))
        return mockHandle({ run: updateRun });
      return mockHandle();
    });

    await matchOnly('lead-1');
    expect(updateRun).toHaveBeenCalled();
  });
});
