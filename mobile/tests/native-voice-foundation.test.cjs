// Written, unrun. Config/source doubles do not establish Android/iOS runtime,
// microphone permission, native audio routing, TURN or bidirectional call quality.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
function configHarness(env = {}) {
  const module = { exports: {} };
  const original = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../app.json"), "utf8"),
  );
  vm.runInNewContext(
    fs.readFileSync(path.resolve(__dirname, "../app.config.js"), "utf8"),
    {
      module,
      process: { env },
      require: (name) => {
        if (name !== "./app.json")
          throw new Error("Unexpected config dependency");
        return original;
      },
    },
  );
  return { resolve: () => module.exports({ config: {} }), original };
}
test("ordinary builds retain the microphone block and no development application identity", () => {
  const { resolve, original } = configHarness();
  const result = resolve();
  assert.equal(result.extra.voiceFoundation, false);
  assert.equal(result.android.package, undefined);
  assert.equal(
    result.plugins.find(
      (p) => Array.isArray(p) && p[0] === "expo-image-picker",
    )[1].microphonePermission,
    false,
  );
  assert.equal(
    original.expo.plugins.find(
      (p) => Array.isArray(p) && p[0] === "expo-image-picker",
    )[1].microphonePermission,
    false,
  );
});
test("voice foundation changes microphone purpose only for its development profile", () => {
  const { resolve, original } = configHarness({
    APP_ENV: "development",
    ZIPP_NATIVE_VOICE_BUILD: "true",
  });
  const result = resolve();
  assert.equal(result.android.package, "com.zipp.app.dev");
  const before = original.expo.plugins.find(
    (p) => Array.isArray(p) && p[0] === "expo-image-picker",
  )[1];
  const after = result.plugins.find(
    (p) => Array.isArray(p) && p[0] === "expo-image-picker",
  )[1];
  assert.equal(after.cameraPermission, before.cameraPermission);
  assert.equal(after.photosPermission, before.photosPermission);
  assert.match(after.microphonePermission, /call you choose to join/);
  assert.equal(before.microphonePermission, false);
  assert.throws(() =>
    configHarness({
      APP_ENV: "production",
      ZIPP_NATIVE_VOICE_BUILD: "true",
    }).resolve(),
  );
});
function nativeHarness({
  platform = "android",
  dev = true,
  expoGo = false,
  enabled = true,
  installed = true,
} = {}) {
  const imports = [],
    logging = [],
    exports = {};
  class InputFailure extends Error {}
  const source = ts.transpileModule(
    fs.readFileSync(
      path.resolve(__dirname, "../src/features/calling/native-foundation.ts"),
      "utf8",
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    __DEV__: dev,
    require: (name) => {
      imports.push(name);
      if (name === "expo-constants")
        return {
          default: {
            executionEnvironment: expoGo ? "store" : "bare",
            expoConfig: { extra: { voiceFoundation: enabled } },
          },
          ExecutionEnvironment: { StoreClient: "store" },
        };
      if (name === "react-native")
        return {
          Platform: { OS: platform },
          NativeModules: { WebRTCModule: installed ? {} : undefined },
        };
      if (name === "../api/transport") return { InputFailure };
      if (name === "react-native-webrtc")
        return {
          RTCPeerConnection: class {},
          RTCSessionDescription: class {},
          RTCIceCandidate: class {},
          mediaDevices: {
            getUserMedia() {
              throw new Error("Microphone must not start");
            },
          },
        };
      if (name === "react-native-webrtc/lib/module/Logger")
        return { default: { enable: (value) => logging.push(value) } };
      throw new Error("Unexpected native dependency");
    },
  });
  return { exports, imports, logging };
}
test("web, Expo Go, release and disabled profiles never import native WebRTC", async () => {
  for (const options of [
    { platform: "web" },
    { expoGo: true },
    { dev: false },
    { enabled: false },
  ]) {
    const h = nativeHarness(options);
    await assert.rejects(h.exports.loadNativeVoiceModule());
    assert.equal(h.imports.includes("react-native-webrtc"), false);
  }
});
test("native load is explicit and disables peer diagnostics without microphone capture", async () => {
  const h = nativeHarness();
  assert.equal(h.imports.includes("react-native-webrtc"), false);
  const result = await h.exports.loadNativeVoiceModule();
  assert.equal(typeof result.RTCPeerConnection, "function");
  assert.deepEqual(h.logging, ["-rn-webrtc:*"]);
  await assert.rejects(
    nativeHarness({ installed: false }).exports.loadNativeVoiceModule(),
    /Rebuild/,
  );
});

function pluginHarness(enabled) {
  const module = { exports: {} };
  const audio = {
    $: {
      "android:name": "android.permission.RECORD_AUDIO",
      "tools:node": "remove",
    },
  };
  const manifest = {
    $: {},
    "uses-permission": [audio],
    application: [
      { service: [{ $: { "android:name": "existing.PrivateService" } }] },
    ],
  };
  function mod(config, slot, callback) {
    const result = callback({ ...config, modResults: config[slot] });
    const value = { ...config, [slot]: result.modResults };
    return value;
  }
  const api = {
    withAndroidManifest: (c, fn) => mod(c, "_manifest", fn),
    withInfoPlist: (c, fn) => mod(c, "_plist", fn),
    withProjectBuildGradle: (c, fn) => mod(c, "_gradle", fn),
    withAppBuildGradle: (c, fn) => mod(c, "_appGradle", fn),
    createRunOncePlugin: (fn) => fn,
    AndroidConfig: {
      Manifest: { getMainApplicationOrThrow: (m) => m.manifest.application[0] },
      Permissions: {
        withPermissions: (c, names) => {
          for (const name of names)
            if (
              !c._manifest.manifest["uses-permission"].some(
                (p) => p.$["android:name"] === name,
              )
            )
              c._manifest.manifest["uses-permission"].push({
                $: { "android:name": name },
              });
          return c;
        },
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.resolve(__dirname, "../plugins/with-foreground-voice.cjs"),
      "utf8",
    ),
    {
      module,
      require: (name) => {
        if (name !== "expo/config-plugins")
          throw new Error("Unexpected plugin dependency");
        return api;
      },
    },
  );
  const config = {
    _manifest: { manifest },
    _plist: { NSCameraUsageDescription: "Existing package photo permission" },
    _gradle: {
      language: "groovy",
      contents: "allprojects { repositories { mavenCentral() } }\n",
    },
    _appGradle: {
      language: "groovy",
      contents: "android { defaultConfig { minSdkVersion 24 } }\n",
    },
  };
  return { apply: (c) => module.exports(c, { enabled }), config, audio };
}
test("voice manifest reconciles the old microphone block without replacing other services or camera purpose", () => {
  const h = pluginHarness(true),
    result = h.apply(h.config),
    manifest = result._manifest.manifest;
  assert.equal(h.audio.$["tools:node"], undefined);
  assert.equal(
    result._plist.NSCameraUsageDescription,
    "Existing package photo permission",
  );
  assert.ok(
    manifest.application[0].service.some(
      (s) => s.$["android:name"] === "existing.PrivateService",
    ),
  );
  assert.ok(
    manifest.application[0].service.some(
      (s) =>
        s.$["android:name"] ===
          "com.oney.WebRTCModule.MediaProjectionService" &&
        s.$["tools:node"] === "remove",
    ),
  );
  const names = manifest["uses-permission"].map((p) => p.$["android:name"]);
  assert.ok(!names.includes("android.permission.CAMERA"));
  assert.ok(!names.includes("android.permission.BLUETOOTH_CONNECT"));
  const reapplied = h.apply(result);
  assert.equal(
    reapplied._gradle.contents.split("// zipp-foreground-webrtc-version-start")
      .length - 1,
    1,
  );
  assert.ok(
    reapplied._gradle.contents.includes("details.useVersion '155.0.1'"),
  );
  assert.equal(
    reapplied._appGradle.contents.split("// zipp-native-object-path-start")
      .length - 1,
    1,
  );
  assert.ok(
    reapplied._appGradle.contents.includes("-DCMAKE_OBJECT_PATH_MAX=240"),
  );
  assert.ok(reapplied._appGradle.contents.includes("minSdkVersion 24"));
});
test("default manifest keeps the microphone block and private camera purpose", () => {
  const h = pluginHarness(false),
    result = h.apply(h.config);
  assert.equal(h.audio.$["tools:node"], "remove");
  assert.equal(result._plist.NSMicrophoneUsageDescription, undefined);
});

test("native preparation refuses an existing tree before spawning Expo", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../scripts/prepare-voice-android.cjs"),
    "utf8",
  );
  let spawned = false;
  assert.throws(
    () =>
      vm.runInNewContext(source, {
        __dirname: path.resolve(__dirname, "../scripts"),
        process: { argv: ["node", "prepare"] },
        require: (name) => {
          if (name === "node:path") return path;
          if (name === "node:fs") return { existsSync: () => true };
          if (name === "node:child_process")
            return {
              spawnSync: () => {
                spawned = true;
              },
            };
          throw new Error("Unexpected preparation dependency");
        },
      }),
    /already exists/,
  );
  assert.equal(spawned, false);
});

test("new-tree preparation explicitly disables Expo cleaning and restores start scripts", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../scripts/prepare-voice-android.cjs"),
    "utf8",
  );
  const before = {
    scripts: { android: "expo start --android", ios: "expo start --ios" },
  };
  let reads = 0,
    written,
    args;
  const fakeFs = {
    existsSync: () => false,
    readFileSync: () =>
      JSON.stringify(
        reads++ === 0
          ? before
          : { scripts: { android: "expo run:android", ios: "expo run:ios" } },
      ),
    writeFileSync: (_file, value) => {
      written = JSON.parse(value);
    },
  };
  vm.runInNewContext(source, {
    __dirname: path.resolve(__dirname, "../scripts"),
    process: { argv: ["node", "prepare"], execPath: "node", env: {} },
    require: (name) => {
      if (name === "node:path") return path;
      if (name === "node:fs") return fakeFs;
      if (name === "node:child_process")
        return {
          spawnSync: (_bin, value) => {
            args = value;
            return { status: 0 };
          },
        };
      throw new Error("Unexpected preparation dependency");
    },
  });
  assert.ok(args.includes("--no-clean"));
  assert.ok(args.includes("--no-install"));
  assert.ok(!args.includes("--clean"));
  assert.deepEqual(written.scripts, before.scripts);
});
