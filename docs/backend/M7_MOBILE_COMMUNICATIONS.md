# M7 foreground mobile communications and activity inbox

Updated 2026-11-23. Opt-in source integration and test source are present; API/runtime/native/accessibility/network acceptance is pending. No test or native flow was run. This does not add real push, voice audio or native incoming calls.

Read [chat/support](M7_CHAT_SUPPORT.md), [notifications](M7_NOTIFICATIONS.md), [calling](M7_CALLING.md), [self-hosted decision](adr/0016-m7-self-hosted-calling-direction.md), [M7 evidence](M7_VERIFICATION.md).

## Entry points and behavior

`EXPO_PUBLIC_COMMUNICATIONS_ENABLED=false` and `EXPO_PUBLIC_NOTIFICATION_INBOX_ENABLED=false` default off. Existing demo flows remain the default. The Messages tab uses `mobile/src/features/communications` when either flag is on. Its signed-in owner can list/create support requests and open a persistent conversation. A delivery's participant button opens an authorized job conversation with server checks; no manually entered peer/user identity or staff shortcut. The typed Conversation route supports rides, but the ride demo booking screen is not converted to the backend here.

Conversation history pages contain <=50 messages; an active focused screen polls every five seconds with one in-flight read, aborts on blur/background/unmount and resynchronizes from REST. At most 200 message rows stay in memory. Acknowledgements advance only through the fetched/rendered page, not unseen server lastSequence. New sends render only after confirmed server state, with explicit pending/retry UI. Terminal/read-only conversations do not offer new sends. Auth account changes remount/clear private feature state.

Support lists and activity inbox page at 20 items (bounded 100-row retained window), with separate cursors. The generic inbox contains only the exact approved ACTIVITY text and read timestamps, no job/thread IDs, secret payload or invented deep link. Mark-read uses the owner-authorized API. Inbox entries require backend materialization; ordinary M7.3 LOCAL capture is not real push delivery. No real token registration, OS notification permission, APNs/FCM credential or VoIP wake path is installed by this integration.

## Retry identities and privacy

No automatic mutation retry. Ticket/message commands use CSPRNG UUID keys. Native SecureStore (WHEN_UNLOCKED_THIS_DEVICE_ONLY) stores one unresolved key, path and salted input digest **per account and command path**, not message text. Writes are serialized. Retry must match original path/details; mismatched new input cannot silently overwrite an ambiguous key. A lost-access job does not block a separate support request or another authorized conversation. Accepted receipt clears pending metadata. Known post-receipt-lookup business rejections may clear an unaccepted command; auth/dependency/unknown outcomes retain it. Keys have no local expiry. Reenter the same message after native restart; descriptions/drafts are not persisted. Lost original text, unavailable SecureStore or incompatible server contract requires explicit recovery/support, not automatic new keys. Web metadata is memory-only, so browser restart recovery is not claimed.

Inputs are plain text, bounded characters/UTF-8/control rules; server authorizes again. Remote receipt/thread/page IDs, sequences and generic activity text are validated before use. No credentials/contents in URLs, logs or analytics. Microphone/call permissions and frontend staff tools are outside this slice. Safe-area/keyboard containers, >=48-point actions, labels, scalable text, bounded width and explicit loading/empty/error/retry states are implemented; physical small/large phones, screen readers/font/reduced-motion, OS background and keyboard evidence is pending.

## Compatibility and checks

No new dependency/lockfile/image version. Reuse installed Expo 58.0.19/RN 0.88.0/React 19.3.0, Expo Crypto 58.0.8, SecureStore 58.0.3 and current React Navigation contracts. Reviewed 2026-11-23 [Expo 58 Crypto](https://docs.expo.dev/versions/v58.0.0/sdk/crypto/), [React useEffect](https://react.dev/reference/react/useEffect), [RN KeyboardAvoidingView](https://reactnative.dev/docs/keyboardavoidingview) and installed types. Zipp frontend skill/checklist applied; optional ui-skills CLI was not cached/accessible, so no tool or dependency was installed and established components/tokens were reused. The skill's full-test recommendation is superseded by the user's explicit no-test policy.

`mobile/tests/communications.test.cjs` is written, unrun: ambiguous send identity, changed-body rejection, no stored message text, account separation, wrong-thread/page/order validation and injected inbox data. Transport/storage doubles do not establish actual SecureStore, DB, provider or UI correctness. TypeScript/format and production exports are build checks only. All runtime/native/reconnect/expiry/lost-receipt/storage/account-switch/end-job cases await explicit testing authorization.
