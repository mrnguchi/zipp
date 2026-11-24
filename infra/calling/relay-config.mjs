import { isIP } from "node:net";

export const RELAY_IP = "172.30.240.2";
export const RELAY_CIDR = "172.30.240.0/29";

export function validateLanAddress(value) {
  if (typeof value !== "string" || isIP(value) !== 4) {
    throw new Error("Choose one assigned private IPv4 LAN address.");
  }
  const [a, b, c, d] = value.split(".").map(Number);
  const privateAddress =
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  if (!privateAddress || (a === 172 && b === 30 && c === 240 && d < 8)) {
    throw new Error(
      "The LAN address must be private and outside the dedicated relay bridge.",
    );
  }
  return value;
}

export function requireAssignedLanAddress(value, interfaces) {
  const address = validateLanAddress(value);
  const entries = Object.values(interfaces).flatMap((values) => values ?? []);
  const assigned = entries.find(
    (entry) =>
      !entry.internal && entry.family === "IPv4" && entry.address === address,
  );
  if (!assigned)
    throw new Error(
      "The selected LAN address is not assigned to this machine.",
    );
  if (!assigned.cidr)
    throw new Error(
      "The selected LAN interface has no reviewable IPv4 subnet.",
    );
  const relaySize = 2 ** (32 - Number(RELAY_CIDR.split("/")[1]));
  const relay = RELAY_IP.split(".").reduce(
    (n, octet) => n * 256 + Number(octet),
    0,
  );
  const relayFirst = Math.floor(relay / relaySize) * relaySize;
  for (const entry of entries) {
    if (entry.family !== "IPv4" || !entry.cidr) continue;
    const [ip, prefixText] = entry.cidr.split("/");
    const prefix = Number(prefixText);
    if (isIP(ip) !== 4 || !/^\d{1,2}$/.test(prefixText) || prefix > 32)
      throw new Error("An assigned IPv4 subnet could not be reviewed.");
    const numeric = ip
      .split(".")
      .reduce((n, octet) => n * 256 + Number(octet), 0);
    const size = 2 ** (32 - prefix);
    const first = Math.floor(numeric / size) * size;
    const last = first + size - 1;
    if (first <= relayFirst + relaySize - 1 && last >= relayFirst)
      throw new Error(
        "An assigned interface subnet overlaps the dedicated relay bridge.",
      );
  }
  return address;
}

export function renderTurnConfig(sharedSecret) {
  // No config-line injection, precomputed client credentials or public defaults.
  // Preparation supplies fresh CSPRNG output; the future issuer uses its ASCII
  // representation as the HMAC key, exactly as coturn reads this value.
  if (
    typeof sharedSecret !== "string" ||
    !/^[0-9a-f]{64}$/.test(sharedSecret)
  ) {
    throw new Error("A private generated relay secret is required.");
  }
  return [
    "# Private generated local configuration. Never print, commit or mount in mobile.",
    `listening-ip=${RELAY_IP}`,
    `relay-ip=${RELAY_IP}`,
    "listening-port=3478",
    "realm=zipp.voice.local.invalid",
    "fingerprint",
    "use-auth-secret",
    `static-auth-secret=${sharedSecret}`,
    "no-auth-pings",
    "no-dynamic-ip-list",
    "no-dynamic-realms",
    "allocation-default-address-family=ipv4",
    "no-tls",
    "dtls=false",
    "no-tcp-relay",
    "no-stun",
    "no-cli",
    "no-multicast-peers",
    "software-attribute=false",
    "stateless-nonce",
    "stale-nonce=600",
    "unauthorized-ratelimit=enforce",
    "unauthorized-ratelimit-rps=5",
    "max-allocate-timeout=10",
    // Allocation lifetime is a refresh bound, not immediate stream revocation.
    "max-allocate-lifetime=60",
    "user-quota=2",
    "total-quota=20",
    "min-port=49160",
    "max-port=49179",
    "max-bps=64000",
    "bps-capacity=1280000",
    "relay-threads=1",
    "cpus=1",
    // Both clients must use relay-only allocations on this single server.
    // The exact self-IP exception overrides deny-all, never granting access
    // to the LAN host, other containers, metadata services or public peers.
    "denied-peer-ip=0.0.0.0-255.255.255.255",
    "denied-peer-ip=::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    `allowed-peer-ip=${RELAY_IP}`,
    "pidfile=/tmp/turnserver.pid",
    "log-file=/dev/null",
    "no-stdout-log",
    "",
  ].join("\n");
}

export function renderComposeEnvironment(lanAddress, uid, gid) {
  validateLanAddress(lanAddress);
  for (const id of [uid, gid]) {
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
      throw new Error(
        "Local relay preparation requires a non-root numeric UID and GID.",
      );
    }
  }
  // These are non-secret bind/ownership settings; the secret lives in files only.
  return `ZIPP_TURN_LAN_IP=${lanAddress}\nZIPP_TURN_UID=${uid}\nZIPP_TURN_GID=${gid}\n`;
}
