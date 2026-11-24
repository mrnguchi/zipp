const {
  AndroidConfig,
  withAndroidManifest,
  withInfoPlist,
  withProjectBuildGradle,
  withAppBuildGradle,
  createRunOncePlugin,
} = require("expo/config-plugins");
const nativeWebRtcVersion = "155.0.1";
const gradleStart = "// zipp-foreground-webrtc-version-start";
const gradleEnd = "// zipp-foreground-webrtc-version-end";
function withForegroundVoice(config, options = {}) {
  const enabled = options.enabled === true;
  // The installed native library declares a screen-capture service even when
  // unused. Remove that component specifically, preserving photo-camera setup.
  config = withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    manifest.$ ??= {};
    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    if (enabled) {
      const permission = manifest["uses-permission"]?.find(
        (p) => p.$?.["android:name"] === "android.permission.RECORD_AUDIO",
      );
      // Reconcile an earlier generated photo-only manifest. withPermissions
      // adds the name but does not clear a previous tools:node=remove marker.
      if (permission?.$["tools:node"] === "remove")
        delete permission.$["tools:node"];
    }
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    app.service ??= [];
    const name = "com.oney.WebRTCModule.MediaProjectionService";
    const prior = app.service.find((v) => v.$?.["android:name"] === name);
    if (prior) prior.$["tools:node"] = "remove";
    else
      app.service.push({ $: { "android:name": name, "tools:node": "remove" } });
    return c;
  });
  if (enabled) {
    config = AndroidConfig.Permissions.withPermissions(config, [
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      "android.permission.ACCESS_NETWORK_STATE",
      "android.permission.INTERNET",
    ]);
    config = withInfoPlist(config, (c) => {
      c.modResults.NSMicrophoneUsageDescription =
        "Allow Zipp to use your microphone during a call you choose to join.";
      return c;
    });
  }
  config = withProjectBuildGradle(config, (c) => {
    if (c.modResults.language !== "groovy")
      throw new Error("Review native voice pin for this Gradle format");
    // Pin only the upstream library's 155.+ media artifact. RN's own Gradle
    // plugin remains responsible for selecting its matching React artifacts.
    const block = `${gradleStart}
allprojects {
  configurations.configureEach {
    resolutionStrategy.eachDependency { details ->
      if (details.requested.group == 'org.jitsi' && details.requested.name == 'webrtc') {
        details.useVersion '${nativeWebRtcVersion}'
        details.because 'Reviewed Zipp foreground WebRTC native version'
      }
    }
  }
}
${gradleEnd}`;
    const source = c.modResults.contents,
      start = source.indexOf(gradleStart),
      end = source.indexOf(gradleEnd);
    if (start < 0 !== end < 0)
      throw new Error("Incomplete native WebRTC version block");
    c.modResults.contents =
      start >= 0
        ? source.slice(0, start) + block + source.slice(end + gradleEnd.length)
        : `${source.trimEnd()}\n\n${block}\n`;
    return c;
  });
  config = withAppBuildGradle(config, (c) => {
    if (c.modResults.language !== "groovy")
      throw new Error(
        "Review native voice object paths for this Gradle format",
      );
    const startTag = "// zipp-native-object-path-start";
    const endTag = "// zipp-native-object-path-end";
    // Installed Windows Ninja rejects generated codegen paths over 260 chars.
    // Let CMake hash long object paths; preserve RN's other native arguments.
    const block = `${startTag}
android {
  defaultConfig {
    externalNativeBuild {
      cmake {
        arguments '-DCMAKE_OBJECT_PATH_MAX=240'
      }
    }
  }
}
${endTag}`;
    const source = c.modResults.contents;
    const start = source.indexOf(startTag),
      end = source.indexOf(endTag);
    if (start < 0 !== end < 0)
      throw new Error("Incomplete native object path block");
    c.modResults.contents =
      start >= 0
        ? source.slice(0, start) + block + source.slice(end + endTag.length)
        : `${source.trimEnd()}\n\n${block}\n`;
    return c;
  });
  return config;
}
module.exports = createRunOncePlugin(
  withForegroundVoice,
  "zipp-foreground-voice",
  "1.0.0",
);
