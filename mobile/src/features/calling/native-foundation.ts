import Constants, { ExecutionEnvironment } from "expo-constants";
import { NativeModules, Platform } from "react-native";
import { InputFailure } from "../api/transport";

/** This only loads the native implementation. It never requests microphone
 * access, creates a peer or changes backend call eligibility on module import. */
export async function loadNativeVoiceModule() {
  if (Platform.OS !== "android" && Platform.OS !== "ios")
    throw new InputFailure("Native voice is not available on this platform.");
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient)
    throw new InputFailure("Voice requires the Zipp development build.");
  if (!__DEV__ || Constants.expoConfig?.extra?.voiceFoundation !== true)
    throw new InputFailure("Voice calling is not available in this build.");
  try {
    if (!NativeModules.WebRTCModule)
      throw new Error("Native WebRTC module unavailable");
    const module = await import("react-native-webrtc");
    // This exact pinned SDK enables verbose debug namespaces on import. Keep
    // its signaling/peer diagnostics off before any media operation is exposed.
    const { default: WebRtcLogger } =
      await import("react-native-webrtc/lib/module/Logger");
    WebRtcLogger.enable("-rn-webrtc:*");
    return {
      RTCPeerConnection: module.RTCPeerConnection,
      RTCSessionDescription: module.RTCSessionDescription,
      RTCIceCandidate: module.RTCIceCandidate,
      mediaDevices: module.mediaDevices,
    };
  } catch {
    // A JavaScript export/OTA cannot add a native module to an older binary.
    throw new InputFailure(
      "Rebuild the Zipp development app to include voice support.",
    );
  }
}
