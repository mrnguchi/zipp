# Zipp mobile

Expo and React Native app foundation for the Zipp ride-hailing and delivery MVP.
The opening flow includes the branded splash, welcome, customer sign-up, and
rider/driver role-selection screens. Authentication, trip, delivery, wallet,
and backend workflows are not connected yet.

## Run locally

```sh
npm install
cp .env.example .env.local
npm start
```

Set `EXPO_PUBLIC_API_URL` in `.env.local` when the backend is available. Do not
put payment credentials, tokens, or other secrets in Expo public environment
variables.

## Profile settings preview

Profile uses the main Zipp navigation bar. Its footer displays the supplied
authorization number, `CMR-2026-2532/233`.

Password & Security includes device biometric unlock. Enabling or disabling it
requires device verification; leaving the foreground locks an enabled session.
Fingerprint/strong face biometrics and device-passcode fallback are handled by
`expo-local-authentication`. Face ID on iOS requires a development build rather
than Expo Go. This is a session lock, not account passkey registration or login;
account passkeys still require the authentication backend and associated domain.

Notifications provides separate Chime, Bell, Pulse, and Silent choices for each
existing notification event. Bundled tones play with in-app banners and can be
previewed in the sound chooser. Disabled categories do not queue new banners.
Device volume and silent mode apply. These sounds do not configure OS push
notification channels. Settings currently last for the app session.

## Messages and calls preview

Messages contains conversation and call-history tabs, unread/missed filters,
search, contact details, and individual conversation search. Driver contact
buttons in a booking open the same conversation used by this inbox.

Chat supports local text drafts, quick replies, photo selection with review,
single-location sharing with review, trip cards, and microphone voice notes with
playback before adding them. Voice notes stop when the app leaves the foreground
and are limited to one minute. Microphone permission is requested only after
tapping Start recording. New native builds must include the updated audio and
image-picker configuration.

Sample conversations and call history are development fixtures. Text, media,
drafts, and call history remain in memory for the current app session; selected
media and recordings use local cache URIs. Nothing is delivered to a contact.
Outgoing and incoming voice call screens are explicitly labeled previews.
They do not transmit audio or place phone calls. Production messaging needs
authenticated transport, server-side conversation membership and delivery state,
media storage, persistence, and signaling/media services for live calls.

## Source layout

- `src/components`: reusable UI
- `src/config`, `src/constants`, `src/theme`: app configuration and design tokens
- `src/contexts`, `src/hooks`: shared app state and hooks
- `src/i18n`: English and French translations
- `src/navigation`: typed role-aware navigation
- `src/query`, `src/services`: server-state and API integration foundations
- `src/screens`: app screens
- `src/types`, `src/utils`: shared domain types and helpers

The MVP targets Cameroon and uses the green, yellow, dark, light-grey, and white
brand palette.

## Ride booking UI

`BookRideScreen` opens from Book a ride or Where to? on Home. It uses the reusable
`RideMap` and `RideBottomSheet` components. The current flow supports landmark
labels, map-selected pickup/destination coordinates, zoom/pan/recenter, three ride
classes, and a local review. Wallet reservations and charges use session-only
development funds; no real payment or live booking is submitted.

The map uses MapLibre GL JS 5.6.2 inside the Expo-compatible
`react-native-webview` package, with OpenFreeMap vector data. The renderer assets
load from the pinned unpkg URLs in `mapDocument.ts`; map data and fonts load from
OpenFreeMap. Internet access and WebGL are required. Loading, retry, and attribution
are handled by `RideMap`. This renderer targets iOS and Android.

`mapTheme.ts` owns the complete base-map style: grayscale land, water, roads,
buildings, and labels. Named landmarks appear from zoom 15, building outlines
from zoom 15, and house numbers from zoom 18, where present in OpenStreetMap.
Landmark labels use collision detection and ranking to limit clutter. Zipp green is reserved for
route geometry and pickup/destination/driver overlays. Adjust colors, layer
visibility, fonts, or road widths there without changing screen components.
The initial viewport is Buea, not the device's current location.

`RideMap` accepts pickup/destination, driver coordinates, road route geometry,
route color, interaction controls, and sheet/top/attribution insets. See
https://openfreemap.org/quick_start/ for provider details. Keep the provider
attribution visible when adapting the component.

Home places the map edge-to-edge behind the status bar, header, and search, with
automatic WebView safe-area adjustment disabled. The white sheet rests at 46%
height; drag or tap its handle to expand it. Native-driven spring transforms
animate the sheet and attribution without resizing/reloading the map each frame.
Reduced-motion settings are respected. Navigation floats above the sheet.
My location requests foreground permission only when tapped and centers the map
on a fresh device position; denial, disabled GPS, and timeouts have retry guidance.
Custom native builds need rebuilding after adding expo-location.
The name from signup is retained in `ProfileContext` during the current
session; login must hydrate this context from the future profile API. If no name
is available, Home currently displays the requested preview name, Nguchi.
Shared `AppText` scales font size and line height using the shorter window edge:
standard 393-point phones retain base sizes, 430-point phones gain about 11%, and
growth caps at 18%. Native accessibility font scaling remains enabled.

Remaining integrations: persistent saved places, backend fare quotes, verified wallet balance, and dispatch.
Do not draw a straight line between stops as a substitute for road routing, or
enable booking/payment confirmation without these backend integrations.

The booking screen now provides an expandable ride-options sheet, manual landmark
entry, map-selected stops, GPS pickup, Everyday/Comfort/Premium vehicle selection,
and wallet-only payment presentation. Confirm advances directly to an in-sheet
driver/vehicle preview with message-draft and call controls. Demo identity and
vehicle details are sample fixtures; calling and dispatch await a real driver assignment.
The flow uses sample fares and session-only wallet transactions, with no real payment.
Pickup and destination entry search live Photon/OpenStreetMap places after three
characters and a 450 ms typing pause. Tapping a suggestion saves its coordinates
and fits the map to the stops. Manual text remains available without a map pin.
Search is biased towards Buea and limited to Cameroon, with cancellation, a 10-second
timeout, retry/empty states, and a bounded five-minute cache. No device GPS is sent
to the search provider. Configure `EXPO_PUBLIC_PLACE_SEARCH_URL` with a Photon-compatible
endpoint; the default public demo is best-effort and intended for modest usage.
Use a managed/self-hosted service before production scale. Provider documentation:
https://github.com/komoot/photon and https://github.com/komoot/photon/blob/master/docs/api-v1.md.

Road routing uses an OSRM-compatible driving endpoint configured by
`EXPO_PUBLIC_ROUTING_URL`, defaulting to the public OSRM demo. Both stops need
coordinates from GPS, place search, or map selection. Full road geometry is
rendered in green, with total distance and a driving-time estimate (not live traffic).
Requests are debounced, canceled when stops change, timed out after 15 seconds,
and cached for the session. Failed routes show retry; no straight-line substitute
is drawn. The provider receives the two stop coordinates. Configure a dedicated
production routing service before launch. Route summaries are separate from
the preview driver-distance and fare values on vehicle cards.

The driver page places a sample car 450–799 meters from pickup on a stable bearing
independent of the passenger destination, then requests an OSRM route to pickup.
The car is shown at the road-snapped route origin after routing. Its approach is yellow and a map bubble shows that
route's distance and estimated driving time. Both routes fit within the map view.
`driver car.png` is embedded for native WebView rendering. Replace this fixture
position with dispatch GPS updates before live use; this is not live tracking.

Driver arrival includes a three-dot opacity animation that respects reduced motion.
Cancellation uses a custom modal showing 25% of the selected sample fare, rounded
to whole XAF, before the user accepts. Cancellation deducts the fee from the local
development wallet and releases the remainder of the fare hold. Production must
obtain the cancellation quote and atomically cancel/debit on the server.

## Ride lifecycle and notifications

The rider UI now follows `arriving → arrived → in_progress → processing_payment → completed → rated`.
Arrival displays a four-digit trip PIN with instructions to check the car before
sharing it. Only the driver's verified-PIN event permits the start event; the
rider has no Start ride button. In-progress includes sharing real trip details
and a safety panel. Completion shows a receipt, wallet-payment state, five-star
rating and optional feedback. The wallet fare is reserved at confirmation and
settled after a three-second processing stage. A payment is marked paid only after local settlement succeeds.

In development builds, confirming a ride starts a 10-second arrival simulation.
The sample car progresses along the road approach and its yellow path shortens.
At 10 seconds, the driver is placed at pickup and the PIN interface opens. This
fixture is disabled in release builds; actual arrival must come from dispatch.
If approach routing fails, no straight-line movement is invented.

To review the later interfaces in a development build, long-press **Your ride**
at the top of the map. The compact step-based simulation sheet can advance arrival
and simulate driver PIN verification/start. Wallet deposits are not ride controls.
It is excluded from release UI. Sample PIN `4826`, driver identity, fares and
movement remain fixtures; no live dispatch, verification or financial processing
is performed. `publishRideEvent` is the boundary for authenticated server events;
`publishWalletDeposit` must only be called for a server-confirmed deposit.

`NotificationProvider` displays queued in-app banners, deduplicates events, and
retains up to 50 notices during the app session. The Home notification bell opens
the history. Ride arrival/start/completion/cancellation/payment and wallet deposits
use this system. These are in-app notifications, not OS push notifications;
background push delivery still requires native notification configuration, device
tokens, permissions and server delivery. Ride state and ratings are currently
local to the booking screen; persist and reconcile them with the backend before launch.

After simulated PIN verification, the trip runs for 10 seconds. The car progresses
along the passenger route and the green path shortens. Completion first displays
a circular spinner and “Processing payment” for three seconds in development,
then settles the fare and displays a paid receipt followed by rating. If a final fare cannot be settled,
the receipt stays pending and offers payment retry instead of claiming success.

`WalletProvider` shares funds across Home and booking. Development builds begin
with 25,500 XAF in sample funds; release builds start at zero pending server hydration.
Confirmation requires enough available balance for the complete fare. Fare holds
reduce available balance, prevent overspending, and are consumed exactly once by
completion or cancellation. Duplicate deposit IDs and repeated settlement cannot
credit/debit twice. Insufficient funds open a balance/fare/shortfall sheet linking
to wallet top-up. These client checks are for development; production must enforce
reservations, deposits, fares and settlement atomically on the authenticated backend.

GPS and map-selected pickup coordinates are reverse-geocoded through Photon to
a nearby street/landmark label. The receipt uses that label, or precise coordinates
if the lookup fails, never “My current location”. Lookups are canceled when pickup
changes and time out after 10 seconds. This reverse lookup sends the selected pickup
coordinates to the configured Photon-compatible provider.
