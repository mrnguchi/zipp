/** Framework diagnostics must never echo transport URLs containing credentials. */
export function safeLogMessage(message: unknown): string {
  if (
    typeof message !== 'string' ||
    /\b[a-z][a-z0-9+.-]*:\/\//i.test(message)
  ) {
    return 'Framework event';
  }
  return message;
}
