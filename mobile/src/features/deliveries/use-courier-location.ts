import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import * as Location from "expo-location";
import { authenticated } from "../identity/session";
import { errorMessage, record, uuid } from "../api/transport";
import type { DeliverySnapshot } from "./contracts";
import { terminal } from "./contracts";
/** Foreground only. Native background dispatch remains a separate acceptance gate. */
export function useCourierLocation(
  d: DeliverySnapshot | null,
  discovering = false,
) {
  const focused = useIsFocused(),
    [message, setMessage] = useState("Location is not sharing."),
    [ready, setReady] = useState(false),
    [foreground, setForeground] = useState(AppState.currentState === "active");
  const id = d?.id ?? (discovering ? "dispatch" : undefined),
    custody = d?.custody,
    courier = discovering || d?.viewerRole === "COURIER",
    ended = !discovering && (!d || terminal(d.status));
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setForeground(s === "active"),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    setReady(false);
    if (!id || !courier || ended || !focused || !foreground) return;
    let stopped = false,
      busy = false,
      sequence = 0,
      subscription: Location.LocationSubscription | undefined,
      last = 0,
      expiry: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (stopped) return;
        if (!permission.granted) {
          setMessage("Allow foreground location to confirm custody actions.");
          return;
        }
        const held = custody === "WITH_COURIER",
          root = `/courier/deliveries/${id}`,
          epoch = record(
            await authenticated(
              held
                ? `${root}/custody-location-session`
                : "/drivers/me/availability",
              {
                method: held ? "POST" : "PUT",
                body: JSON.stringify(held ? {} : { online: true }),
              },
            ),
          ),
          locationSessionId = uuid(epoch.locationSessionId);
        if (stopped) return;
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 0,
          },
          (location) => {
            if (stopped || busy || Date.now() - last < 5000) return;
            busy = true;
            last = Date.now();
            const accuracy = location.coords.accuracy;
            if (accuracy === null || accuracy > 100) {
              setMessage("Waiting for a more accurate GPS fix.");
              busy = false;
              return;
            }
            void authenticated(
              held ? `${root}/custody-location` : "/drivers/me/location",
              {
                method: "POST",
                body: JSON.stringify({
                  schemaVersion: 1,
                  locationSessionId,
                  sequence: ++sequence,
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                  accuracyMeters: Math.max(0, accuracy),
                  capturedAt: new Date(location.timestamp).toISOString(),
                }),
              },
            )
              .then(() => {
                if (!stopped) {
                  setReady(true);
                  clearTimeout(expiry);
                  expiry = setTimeout(() => {
                    if (!stopped) setReady(false);
                  }, 12000);
                  setMessage(
                    "Foreground location is sharing for this delivery.",
                  );
                }
              })
              .catch((e) => {
                if (!stopped) {
                  setReady(false);
                  setMessage(errorMessage(e));
                }
              })
              .finally(() => {
                busy = false;
              });
          },
        );
        if (stopped) subscription.remove();
      } catch (e) {
        if (!stopped) setMessage(errorMessage(e));
      }
    })();
    return () => {
      stopped = true;
      subscription?.remove();
      clearTimeout(expiry);
    };
  }, [id, courier, custody, ended, focused, foreground]);
  return { message, ready };
}
