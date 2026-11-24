const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
if (process.argv.length > 2)
  throw new Error("This preparation command takes no arguments");
const native = path.join(root, "android");
// Never regenerate/clean an existing native tree or launch a phone/emulator.
if (fs.existsSync(native))
  throw new Error(
    "Android tree already exists. Review it before any further native generation.",
  );
const env = {
  ...process.env,
  APP_ENV: "development",
  ZIPP_NATIVE_VOICE_BUILD: "true",
  CI: "1",
};
const manifestPath = path.join(root, "package.json");
const before = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const result = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules/expo/bin/cli"),
    "prebuild",
    "--platform",
    "android",
    "--no-install",
    "--no-clean",
  ],
  { cwd: root, env, stdio: "inherit" },
);
// Expo prebuild rewrites convenience scripts to commands that install/launch
// native apps. Preserve this workspace's existing start-only commands.
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
for (const name of ["android", "ios"]) {
  if (before.scripts[name] === undefined) delete manifest.scripts[name];
  else manifest.scripts[name] = before.scripts[name];
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
process.exitCode = result.status ?? 1;
