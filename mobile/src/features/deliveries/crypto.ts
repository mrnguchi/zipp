import { getRandomBytesAsync } from "expo-crypto";
/** Async native CSPRNG, including development. Never fall back to Math.random. */
export async function requestId() {
  const b = await getRandomBytesAsync(16);
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, (v) => v.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export async function trackingCredential() {
  const b = await getRandomBytesAsync(32),
    alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let secret = "";
  for (let i = 0; i < b.length; i += 3) {
    const a = b[i],
      c = b[i + 1],
      d = b[i + 2];
    secret += alphabet[a >> 2] + alphabet[((a & 3) << 4) | ((c ?? 0) >> 4)];
    if (c !== undefined) secret += alphabet[((c & 15) << 2) | ((d ?? 0) >> 6)];
    if (d !== undefined) secret += alphabet[d & 63];
  }
  return { id: await requestId(), secret, ttlSeconds: 28800 };
}
