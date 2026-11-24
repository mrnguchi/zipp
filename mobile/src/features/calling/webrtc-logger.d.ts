// Pinned react-native-webrtc 155.0.1 ships this declaration under lib/typescript,
// but TypeScript cannot associate it with the Metro lib/module subpath. Mirror
// only the reviewed privacy switch, not an untyped declaration for the SDK.
declare module "react-native-webrtc/lib/module/Logger" {
  export default class WebRtcLogger {
    static enable(namespace: string): void;
  }
}
