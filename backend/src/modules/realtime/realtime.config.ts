export class RealtimeConfig {
  readonly enabled: boolean;
  readonly nativeAllowed: boolean;
  readonly origins: ReadonlySet<string>;
  readonly intervalMs = 3000;
  readonly instanceLimit = 50;
  readonly readConcurrency = 4;
  constructor(env: NodeJS.ProcessEnv = process.env) {
    for (const key of ['REALTIME_ENABLED', 'REALTIME_ALLOW_NATIVE'])
      if (env[key] && !['true', 'false'].includes(env[key]))
        throw new Error(`Invalid ${key}`);
    this.enabled = env['REALTIME_ENABLED'] === 'true';
    this.nativeAllowed = env['REALTIME_ALLOW_NATIVE'] === 'true';
    const origins = (env['REALTIME_ALLOWED_ORIGINS'] ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (origins.length > 10) throw new Error('Too many realtime origins');
    for (const origin of origins) {
      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error('Invalid REALTIME_ALLOWED_ORIGINS');
      }
      if (
        !['https:', 'http:'].includes(parsed.protocol) ||
        parsed.origin !== origin
      )
        throw new Error('Invalid REALTIME_ALLOWED_ORIGINS');
    }
    this.origins = new Set(origins);
    if (
      this.enabled &&
      (env['NODE_ENV'] === 'production' ||
        env['AUTH_ENABLED'] !== 'true' ||
        (!this.nativeAllowed && !this.origins.size))
    )
      throw new Error(
        'Realtime requires explicit local identity/origin configuration and unverified production transport stays disabled',
      );
  }
  allows(origin: string | undefined) {
    return origin === undefined ? this.nativeAllowed : this.origins.has(origin);
  }
}
