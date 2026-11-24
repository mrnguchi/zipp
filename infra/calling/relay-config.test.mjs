// Written, UNRUN. Pure source checks do not prove coturn, Docker, ACL/file
// permissions, real network restrictions, auth expiry or native media behavior.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RELAY_IP,
  requireAssignedLanAddress,
  renderComposeEnvironment,
  renderTurnConfig,
  validateLanAddress,
} from "./relay-config.mjs";

test("only exact RFC1918 IPv4 bindings outside the bridge are accepted", () => {
  for (const value of ["10.10.1.2", "172.16.1.2", "192.168.1.2"])
    assert.equal(validateLanAddress(value), value);
  for (const value of [
    "0.0.0.0",
    "127.0.0.1",
    "169.254.1.1",
    "100.64.1.2",
    "8.8.8.8",
    "::1",
    "172.30.240.2",
    "192.168.1.2\nno-auth",
    "192.168.001.2",
  ])
    assert.throws(() => validateLanAddress(value));
});

test("preparation requires an assigned noninternal interface and rejects overlapping subnets", () => {
  const lan = {
    address: "192.168.1.50",
    family: "IPv4",
    internal: false,
    cidr: "192.168.1.50/24",
  };
  assert.equal(
    requireAssignedLanAddress(lan.address, { wifi: [lan] }),
    lan.address,
  );
  assert.throws(() =>
    requireAssignedLanAddress("192.168.1.51", { wifi: [lan] }),
  );
  assert.throws(() =>
    requireAssignedLanAddress(lan.address, {
      wifi: [{ ...lan, internal: true }],
    }),
  );
  assert.throws(
    () =>
      requireAssignedLanAddress(lan.address, {
        wifi: [lan],
        vpn: [
          {
            address: "172.30.240.50",
            family: "IPv4",
            internal: false,
            cidr: "172.30.240.50/24",
          },
        ],
      }),
    /overlaps/,
  );
  assert.throws(() =>
    requireAssignedLanAddress(lan.address, { wifi: [{ ...lan, cidr: null }] }),
  );
});

test("config requires a bounded secret and grants only the relay self-IP over deny-all", () => {
  for (const value of [
    "",
    "public-example",
    "A".repeat(64),
    `${"a".repeat(64)}\nno-auth`,
  ])
    assert.throws(() => renderTurnConfig(value));
  // A deterministic source-only fixture, never a mounted/generated real secret.
  const config = renderTurnConfig("1234567890abcdef".repeat(4));
  const active = config
    .split("\n")
    .filter((line) => line && !line.startsWith("#"));
  assert.deepEqual(
    active.filter((line) => line.startsWith("allowed-peer-ip=")),
    [`allowed-peer-ip=${RELAY_IP}`],
  );
  assert.ok(active.includes("denied-peer-ip=0.0.0.0-255.255.255.255"));
  assert.ok(
    active.includes(
      "denied-peer-ip=::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    ),
  );
  assert.ok(active.includes("use-auth-secret"));
  assert.ok(active.includes("no-dynamic-ip-list"));
  assert.ok(active.includes("no-dynamic-realms"));
  assert.ok(active.includes("no-tcp-relay"));
  assert.ok(active.includes("no-tls"));
  assert.ok(active.includes("dtls=false"));
  assert.ok(
    !active.some((line) =>
      /^(no-auth(?:=|$)|allow-loopback-peers|external-ip=|user=)/.test(line),
    ),
  );
});

test("public compose environment contains no credentials and refuses root/unsafe ownership values", () => {
  assert.equal(
    renderComposeEnvironment("192.168.1.50", 1000, 1000),
    "ZIPP_TURN_LAN_IP=192.168.1.50\nZIPP_TURN_UID=1000\nZIPP_TURN_GID=1000\n",
  );
  for (const id of [0, -1, "1000", NaN, Infinity, 2 ** 32])
    assert.throws(() => renderComposeEnvironment("192.168.1.50", id, 1000));
  assert.throws(() => renderComposeEnvironment("192.168.1.50", 1000, 0));
});

test("Compose pins the reviewed image and has no media-range, wildcard, default backend or secret-env exposure", () => {
  const compose = readFileSync(
    new URL("./compose.yaml", import.meta.url),
    "utf8",
  );
  const lock = JSON.parse(
    readFileSync(new URL("./image.lock.json", import.meta.url), "utf8"),
  );
  assert.ok(compose.includes(`${lock.image}@${lock.indexDigest}`));
  assert.ok(compose.includes("profiles: [voice-relay]"));
  assert.ok(compose.includes("entrypoint: [/usr/bin/turnserver]"));
  assert.ok(compose.includes("file: ./.local/turnserver.conf"));
  assert.ok(
    !/\benvironment:|network_mode:\s*host|privileged:\s*true|49160.*49179|0\.0\.0\.0:3478/.test(
      compose,
    ),
  );
  const base = readFileSync(
    new URL("../compose/compose.yaml", import.meta.url),
    "utf8",
  );
  assert.ok(!base.includes("coturn/coturn"));
});
