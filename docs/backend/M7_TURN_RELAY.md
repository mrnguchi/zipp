# M7 foreground voice — step 2 local relay configuration

Step3 continuation (2026-11-24): [authorized API setup credentials](M7_RELAY_CREDENTIALS.md) and [ADR 0020](adr/0020-m7-scoped-relay-credentials.md) now have default-off source and a separate API-only prepared-key override. No key preparation/read, actual issuance, relay startup or tests. User-ended healthy conversations/no arbitrary duration cutoff are required; ongoing renewal/liveness/reconnect/media remain future implementation. Current REST count is139; the counts/issuer-pending notes below describe step2.

Updated 2026-11-24. **Optional local coturn source/configuration is present; no image pull, container build/start, private secret generation, runtime/network/native probe or test has run.** This follows the [Android native foundation](M7_NATIVE_VOICE.md). Read [ADR 0019](adr/0019-m7-local-turn-relay.md), [calling contract](M7_CALLING.md), [self-hosted direction](adr/0016-m7-self-hosted-calling-direction.md) and [evidence](M7_VERIFICATION.md). M7 and usable calls remain incomplete.

## Files and scope

- `infra/calling/compose.yaml`: separate `zipp-turn-local` project, optional `voice-relay` profile, one coturn service. Ordinary `infra/compose/compose.yaml` and backend API/worker startup are unchanged.
- `image.lock.json`: official coturn 4.19.2-r0 Alpine image index/platform/config digests and source revision. Index pin `sha256:974824bdefa8759b7aa4508daf5066fdd9f5411e925055b6132fb2904aecca01`; public metadata SHA256 identities verified without image layers. AMD64/ARM64 compressed layers are about 24 MB each; this is metadata, not installed size or runtime memory evidence. Other advertised image architectures are unreviewed.
- `relay-config.mjs`: bounded IPv4/interface/ownership validation and private config rendering; only Node built-ins, no package or lockfile additions. Configuration options checked against selected-version coturn source, including current `dtls=false`/`software-attribute=false`; obsolete `no-loopback-peers` is removed.
- `prepare-local-relay.mjs`: one-time local file preparation, no Docker/DB/native/test operation. `turnserver.conf.example` is an incomplete reference **without any authentication secret** and is never the mounted config. `.env.example` is for documentation/static Compose review, not a selected host interface or runtime credential file.

No backend schema, migration, REST/event contract, feature flag or mobile code changes. Current backend remains 61 source application tables, 138 REST operations, four unapplied M7 migrations; last identified applied local evidence remains 45/base m6. Calling stays diagnostic `local_control` by default, audioAvailable:false; CONNECTING still expires after 30 seconds with one negotiation epoch. This relay slice does not make that a usable ongoing-call contract.

## Local topology and boundaries

The selected host interface must be an assigned noninternal RFC1918 IPv4 address. Preparation checks reported interface subnets against dedicated bridge `172.30.240.0/29`; existing Docker networks, VPN routes, firewall/Docker Desktop/rootless behavior still require environment review during the later authorized checks. No automatic interface/public-IP detection, router mapping, firewall edit or host network mode.

Only UDP/TCP 3478 is published, bound to that host IP. Internal relay sockets use 49160–49179 on container `172.30.240.2`, with **no host media-range publishing or external-IP rewriting**. Both participants must use `iceTransportPolicy: relay` and this same coturn instance. The relay forwards between its own allocation endpoints, retaining its private bridge relay candidates. This design is inferred from the TURN forwarding model and reviewed ACL code; actual paired allocation/native connectivity is **unverified**. It cannot be treated as a general Docker bridge/NAT solution.

The peer policy denies every IPv4 and IPv6 destination except the exact container relay IP. This intentional same-relay exception preserves possible paired media without allowing the LAN host, database/Redis containers, other private/public addresses or metadata services as destinations. No loopback enablement or broad LAN subnet exception. The allowed self-IP covers coturn's own ports; it is not a peer-port allowlist or a guarantee about a compromised container. IPv6 allocations/mixed direct or multiple-relay calls and WAN use are outside this profile. A failed device check must not be worked around by allowing the whole LAN or publishing wildcard ports.

TURN client control supports UDP and TCP; `no-tcp-relay` disables TCP **peer allocations**, not client TCP control. Local control TLS/DTLS is disabled, with no self-signed-certificate trust bypass. Restrict this profile to a trusted private development network. Future WebRTC media DTLS-SRTP is distinct from TURN control TLS. Public/production use needs its own reviewed routable IP/DNS, TLS certificates, media ports/NAT/firewall/egress, abuse/metrics and capacity design before hosting authorization.

## Secret preparation — not executed in this pass

When preparing the selected development machine, replace the example IP with an actual reviewed interface. From the workspace root:

```powershell
node infra/calling/prepare-local-relay.mjs --lan-ip 192.168.1.50
```

This command is for file preparation only. It rejects production environment markers, missing/unassigned/public/loopback/link-local/bridge-conflicting addresses, root/invalid POSIX ownership, existing `.local` output and permission failures. It never overwrites or automatically rotates/deletes existing output. Failure after directory creation can leave a partial private directory; inspect it deliberately before retrying. No file contents should be pasted into chat or logged.

Preparation creates ignored `infra/calling/.local/` with:

| File | Consumer | Contents |
| --- | --- | --- |
| `turnserver.conf` | coturn via read-only `/run/secrets/turn-config` | Complete private config with fresh server-side authentication key |
| `turn-shared-secret` | Future API-only credential issuer; **not currently mounted/wired** | Same key plus trailing newline; no client username/password |
| `compose.env` | Local Compose invocation | Only LAN bind IP and numeric UID/GID; no credentials |

The shared key is generated from 32 cryptographic random bytes and written as 64 lowercase hex ASCII characters. Future coturn HMAC authentication uses the ASCII key string, not hex decoding. Never put it in backend/mobile public env, Docker arguments, queue events, screenshots or command output. No temporary client credentials are issued by this helper.

POSIX output is owner-only (directory0700/files0600); service UID/GID matches the non-root host owner. Windows secures the new directory by disabling inherited ACLs and granting the current user inherited child access **before any secret write**; failure aborts. Windows container user defaults to 65534. Docker file secrets are bind mounts, and Compose file-secret permission remapping is not assumed. Current OS account and Docker administrators remain trusted; filesystem/WSL/Desktop behavior still requires permission acceptance. No assertion of encrypted storage. Keep this private directory out of backups/artifacts that are not approved secret stores.

Compose executes the pinned binary directly, avoiding upstream shell `eval` and external-IP lookup. Read-only root and bounded non-executable tmpfs, non-root user, no-new-privileges, 128 MB memory/0.5 CPU, 64 PIDs/4096 file descriptors, one coturn relay thread, no automatic restart or health probe. All capabilities are dropped except the upstream binary's NET_BIND_SERVICE file-capability bounding requirement; actual non-root/NNP startup remains unverified. No privileged/network-admin/socket mounts or persistent relay data volume. Relay logs are discarded both in config and the Docker logging driver to avoid default username/address captures; safe operational observability must be designed before broader use.

Initial source limits: 20 total allocations, two per issued username, internal 20-port range, 64,000 bytes/s per-session limit and 1,280,000 bytes/s aggregate configured capacity; five unauthenticated UDP challenges/s/source, ten-second establishment and sixty-second maximum allocation refresh interval. These are **unmeasured limits, not call/user capacity guarantees**. Different usernames can consume separate per-user quotas; the future authorized issuer must enforce account/call budgets. Credential expiry, nonce expiry and allocation refresh bounds do not prove immediate revocation/peer teardown or bound total call duration.

## Checks performed and deliberately pending

Allowed source review/checks: official release/configuration/parser/peer/address/image source; public registry index/platform/config SHA256 verification and architecture/source labels; Node helper syntax; touched source formatting; Compose v5.5.1 `config --quiet` using the public example environment. Docker CLI warned that its user config file was unreadable in the sandbox; Compose source validation nevertheless exited0. No access to that config or registry login was required. Static Compose checks neither consult the engine nor open ports and do not establish secret availability or service startup.

`relay-config.test.mjs` is written, **unrun**: unsafe/broad/unassigned bindings and subnet overlap, current secret shape/config-line injection, exact self-peer exception and deny-all, non-root numeric ownership, public environment contents, reviewed image pin/isolated opt-in project/no wildcard or media-range exposure. These source-level checks cannot establish actual peer ACL/authentication or network behavior. No test runner, scanner, deliberate failure probe, coturn binary or image was executed. No actual secret/preparation command ran; the backend `.env` remains untouched.

On explicit testing command, identify the local environment, choose/prepare the interface and securely review files, verify subnet/route conflicts and host firewall scope, then retrieve/start this isolated profile as needed for the authorized checks. Current `pull_policy: never` prevents an implicit image download; an explicit pull of the pinned digest is required if unavailable locally. Do not start the profile merely because this runbook shows how it is named. The relevant Compose arguments are `--env-file infra/calling/.local/compose.env -f infra/calling/compose.yaml --profile voice-relay`; ordinary backend startup does not include it. No startup command was executed here.

Remaining runtime gates include image options/startup under retained capabilities/NNP/non-root/read-only/tmpfs, host file ACLs/UID ownership, current auth and expired credentials, exact peer/embedded IPv4/IPv6/SSRF/loop controls, bounded unauthenticated traffic/allocations/bandwidth, paired allocation routing, two qualified devices with relay-only private candidates, native audio/permission/routing, safe error/clock skew/restart, credential renewal and explicit teardown/revocation. Logging-off troubleshooting must use safe metadata, not enable raw signaling/contact/address logging by default. Later internet TLS, arbitrary NAT/firewalls, independent media load/capacity and iOS gates remain open.

Next implementation slice: backend **authorized short-lived relay credentials**, followed by an explicit ongoing-call/epoch/renewal/teardown/reconnect contract and mobile foreground media orchestration. Keep actual audio/backend enablement and incoming-call push gated; do not release any job/custody/funds because a call/relay times out.
