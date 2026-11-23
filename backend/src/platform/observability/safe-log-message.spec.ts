import { describe, expect, it } from '@jest/globals';
import { safeLogMessage } from './safe-log-message.js';

describe('framework diagnostic privacy', () => {
  it.each(['postgresql', 'postgres', 'redis', 'rediss', 'https'])(
    'does not expose a %s credential-bearing URL',
    (protocol) => {
      expect(
        safeLogMessage(`Failed to connect: ${protocol}://user:secret@host`),
      ).not.toContain('secret');
    },
  );
  it('never serializes an arbitrary exception object', () => {
    expect(safeLogMessage(new Error('secret'))).toBe('Framework event');
  });
  it('retains a safe framework lifecycle message', () => {
    expect(safeLogMessage('Application started')).toBe('Application started');
  });
});
