import type { ConnectionOptions } from 'bullmq';

export function queueConnection(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: decodeURIComponent(parsed.password),
    db: Number(parsed.pathname.slice(1) || 0),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    connectTimeout: 2000,
    maxRetriesPerRequest: null,
  } satisfies ConnectionOptions;
}
