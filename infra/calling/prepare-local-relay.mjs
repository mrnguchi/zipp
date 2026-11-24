import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  requireAssignedLanAddress,
  renderComposeEnvironment,
  renderTurnConfig,
} from "./relay-config.mjs";

const callingRoot = fileURLToPath(new URL(".", import.meta.url));

export function prepareLocalRelay(argv) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.APP_ENV === "production"
  ) {
    throw new Error("Relay preparation is local development only.");
  }
  if (argv.length !== 2 || argv[0] !== "--lan-ip") {
    throw new Error(
      "Usage: node infra/calling/prepare-local-relay.mjs --lan-ip <assigned-private-IPv4>",
    );
  }
  const address = requireAssignedLanAddress(argv[1], networkInterfaces());
  const windows = process.platform === "win32";
  const uid = windows ? 65534 : process.getuid?.();
  const gid = windows ? 65534 : process.getgid?.();
  const environment = renderComposeEnvironment(address, uid, gid);
  const directory = path.join(callingRoot, ".local");

  // Exclusive directory creation is the no-overwrite/rotation boundary. A
  // partial attempt stays for deliberate review; never delete it automatically.
  mkdirSync(directory, { mode: 0o700 });
  if (windows) {
    // Secure the directory before generating/writing any secret. Node POSIX
    // modes alone do not restrict inherited Windows ACLs. No shell interpolation.
    try {
      const sid = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ).trim();
      if (!/^S-1-\d+(?:-\d+)+$/.test(sid))
        throw new Error("Invalid local identity");
      execFileSync(
        "icacls.exe",
        [directory, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch {
      throw new Error(
        "Unable to restrict the private relay directory ACL; no secret was written.",
      );
    }
  }
  const secret = randomBytes(32).toString("hex");
  const options = { flag: "wx", mode: 0o600, encoding: "utf8" };
  writeFileSync(
    path.join(directory, "turnserver.conf"),
    renderTurnConfig(secret),
    options,
  );
  writeFileSync(
    path.join(directory, "turn-shared-secret"),
    `${secret}\n`,
    options,
  );
  writeFileSync(path.join(directory, "compose.env"), environment, options);
  // Do not return, echo, hash or produce a mobile credential from this key.
  return directory;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    prepareLocalRelay(process.argv.slice(2));
    console.log(
      "Prepared private local relay files. No service or tests were started.",
    );
  } catch (error) {
    // Filesystem errors may include paths but never secret contents. Keep child
    // tool stderr and stacks out of command output; do not weaken permissions.
    const code =
      error?.code === "EEXIST"
        ? " Existing output must be reviewed; it was not overwritten."
        : "";
    console.error(
      `Local relay preparation failed.${code} Check the LAN address, non-root identity and private-directory permissions. See docs/backend/M7_TURN_RELAY.md.`,
    );
    process.exitCode = 1;
  }
}
