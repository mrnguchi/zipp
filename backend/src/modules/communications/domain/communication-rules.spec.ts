import { describe, expect, it } from '@jest/globals';
import {
  assertWritable,
  assertBodyBytes,
  assertStatusChange,
  nextReadCursor,
} from './communication-rules.js';
import {
  messageText,
  ticketBody,
  messagePageQuery,
  ticketStatusBody,
  communicationEvent,
} from '../contracts/communication.schemas.js';
import { CommunicationsConfig } from '../communications.config.js';
describe('communication policy and bounded contracts (written, not run)', () => {
  it('keeps terminal conversations and full histories read-only', () => {
    expect(() => assertWritable(false, 0)).toThrow('read-only');
    expect(() => assertWritable(true, 2000)).toThrow('limit');
    expect(() => assertWritable(true, 1999)).not.toThrow();
  });
  it('rejects stale versions and repeated fresh-key status transitions', () => {
    expect(() => assertStatusChange('OPEN', 'RESOLVED', 2, 1)).toThrow(
      'Reload',
    );
    expect(() => assertStatusChange('OPEN', 'OPEN', 2, 2)).toThrow('already');
    expect(() =>
      assertStatusChange('OPEN', 'RESOLVED', 1000000, 1000000),
    ).toThrow('limit');
  });
  it('never rolls a read cursor backwards or acknowledges future messages', () => {
    expect(nextReadCursor(10, 3, 12)).toBe(10);
    expect(nextReadCursor(10, 12, 12)).toBe(12);
    expect(() => nextReadCursor(10, 13, 12)).toThrow('committed');
  });
  it('rejects hidden controls, empty input, overflow and metadata injection', () => {
    for (const value of ['', '  ', '\u0000secret', 'a'.repeat(2001)])
      expect(messageText.safeParse(value).success).toBe(false);
    expect(messageText.parse('hello\nthere\t!')).toBe('hello\nthere\t!');
    expect(() => assertBodyBytes('😀'.repeat(2001))).toThrow('byte');
    expect(
      ticketBody.safeParse({
        subject: 'Need help',
        category: 'ACCOUNT',
        body: 'Help',
        ownerUserId: 'spoof',
      }).success,
    ).toBe(false);
    expect(messagePageQuery.safeParse({ limit: 51 }).success).toBe(false);
    expect(messagePageQuery.safeParse({ after: -1 }).success).toBe(false);
    expect(
      ticketStatusBody.safeParse({
        status: 'OPEN',
        expectedVersion: 1,
        reason: 'free text',
      }).success,
    ).toBe(false);
  });
  it('does not allow bodies/tokens into reference-only event intents', () => {
    expect(
      communicationEvent.safeParse({ body: 'secret', accessToken: 'secret' })
        .success,
    ).toBe(false);
  });
  it('defaults off and rejects production or missing identity', () => {
    expect(new CommunicationsConfig({}).enabled).toBe(false);
    expect(
      () => new CommunicationsConfig({ COMMUNICATIONS_ENABLED: 'yes' }),
    ).toThrow();
    expect(
      () =>
        new CommunicationsConfig({
          COMMUNICATIONS_ENABLED: 'true',
          AUTH_ENABLED: 'false',
        }),
    ).toThrow();
    expect(
      () =>
        new CommunicationsConfig({
          COMMUNICATIONS_ENABLED: 'true',
          AUTH_ENABLED: 'true',
          NODE_ENV: 'production',
        }),
    ).toThrow();
  });
});
