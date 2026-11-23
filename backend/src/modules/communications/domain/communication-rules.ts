import { BusinessError } from '../../../shared/errors/business-error.js';
export function assertWritable(writable: boolean, count: number) {
  if (!writable)
    throw new BusinessError(
      'CONVERSATION_READ_ONLY',
      'Conversation is read-only',
    );
  if (count >= 2000)
    throw new BusinessError(
      'MESSAGE_LIMIT',
      'Conversation message limit reached',
    );
}
export function assertBodyBytes(body: string) {
  if (new TextEncoder().encode(body).length > 8000)
    throw new BusinessError('VALIDATION_ERROR', 'Message exceeds byte limit');
}
export function nextReadCursor(
  previous: number,
  requested: number,
  latest: number,
) {
  if (requested > latest)
    throw new BusinessError('CURSOR_AHEAD', 'Cursor exceeds committed history');
  return Math.max(previous, requested);
}
export function assertStatusChange(
  current: string,
  next: string,
  version: number,
  expected: number,
) {
  if (version !== expected)
    throw new BusinessError('VERSION_CONFLICT', 'Reload the current ticket');
  if (current === next)
    throw new BusinessError(
      'INVALID_TRANSITION',
      'Ticket already has that status',
    );
  if (version >= 1000000)
    throw new BusinessError('VERSION_LIMIT', 'Ticket version limit reached');
}
