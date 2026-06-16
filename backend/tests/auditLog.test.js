/**
 * auditLog.test.js
 * Tests the audit trail logger — correct insert call, graceful failure handling.
 */

const mockRun = jest.fn();
jest.mock('../database/db', () => ({
  prepare: jest.fn(() => ({ run: mockRun, get: jest.fn(), all: jest.fn() })),
}));

const { logEvent, getEvents } = require('../services/auditLog');

describe('Audit log', () => {
  beforeEach(() => jest.clearAllMocks());

  test('logEvent calls db.prepare with correct event_type', async () => {
    mockRun.mockResolvedValue();
    await logEvent('lead-1', 'matched', 'system', 'Matched to contractor X');
    expect(require('../database/db').prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO lead_events')
    );
    expect(mockRun).toHaveBeenCalledWith(
      expect.any(String), // uuid id
      'lead-1',
      'matched',
      'system',
      'Matched to contractor X'
    );
  });

  test('logEvent does not throw on DB error (fire-and-forget)', async () => {
    mockRun.mockRejectedValue(new Error('DB down'));
    await expect(logEvent('lead-1', 'booked')).resolves.toBeUndefined();
  });

  test('logEvent defaults actor to system and notes to null', async () => {
    mockRun.mockResolvedValue();
    await logEvent('lead-2', 'no_match');
    expect(mockRun).toHaveBeenCalledWith(
      expect.any(String),
      'lead-2',
      'no_match',
      'system',
      null
    );
  });
});
