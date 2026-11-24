const appJson = require("./app.json");

module.exports = ({ config }) => {
  const appEnvironment = process.env.APP_ENV || "development";
  const rawVoice = process.env.ZIPP_NATIVE_VOICE_BUILD || "false";
  if (!["true", "false"].includes(rawVoice))
    throw new Error("Invalid ZIPP_NATIVE_VOICE_BUILD");
  const voiceFoundation = rawVoice === "true";
  if (voiceFoundation && appEnvironment !== "development")
    throw new Error("Voice foundation is development-only");
  const applicationId =
    process.env.ZIPP_ANDROID_APPLICATION_ID ||
    (voiceFoundation ? "com.zipp.app.dev" : undefined);
  if (
    applicationId &&
    !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(applicationId)
  )
    throw new Error("Invalid Android application ID");
  return {
    ...config,
    ...appJson.expo,
    android: {
      ...config.android,
      ...appJson.expo.android,
      ...(applicationId ? { package: applicationId } : {}),
    },
    plugins: [
      ...(appJson.expo.plugins || []).map((plugin) =>
        voiceFoundation &&
        Array.isArray(plugin) &&
        plugin[0] === "expo-image-picker"
          ? [
              plugin[0],
              {
                ...plugin[1],
                microphonePermission:
                  "Allow Zipp to use your microphone during a call you choose to join.",
              },
            ]
          : plugin,
      ),
      ["./plugins/with-foreground-voice.cjs", { enabled: voiceFoundation }],
    ],
    extra: {
      ...config.extra,
      ...appJson.expo.extra,
      appEnvironment,
      voiceFoundation,
    },
  };
};
