import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { AppText as Text } from "../../components/AppText";
import { ActionButton } from "../../components/ActionButton";
import { authenticated } from "../identity/session";
import { errorMessage } from "../api/transport";
import { courierOffers, respondToOffer } from "./delivery-api";
import { requestId } from "./crypto";
import { useCourierLocation } from "./use-courier-location";
import { styles, xaf } from "./delivery-presentation";
/** Discovery needs approved DRIVER authority and fresh foreground GPS; acceptance rechecks both. */
export function CourierOffers({ onAssigned }: { onAssigned: () => void }) {
  const [online, setOnline] = useState(false),
    [rows, setRows] = useState<Awaited<ReturnType<typeof courierOffers>>>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    focused = useIsFocused(),
    gps = useCourierLocation(null, online);
  const keys = useRef(new Map<string, string>()),
    running = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    try {
      const offers = await courierOffers();
      if (alive.current) setRows(offers);
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    if (!online || !focused || !gps.ready) return;
    let stopped = false,
      pending = false;
    const reload = async () => {
      if (pending || stopped) return;
      pending = true;
      await refresh();
      pending = false;
    };
    void reload();
    const timer = setInterval(() => {
      void reload();
    }, 10000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [online, focused, gps.ready, refresh]);
  async function respond(id: string, accept: boolean) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const scope = `${id}:${accept}`;
      let key = keys.current.get(scope);
      if (!key) {
        key = await requestId();
        keys.current.set(scope, key);
      }
      await respondToOffer(id, key, accept);
      await refresh();
      if (accept) onAssigned();
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function offline() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await authenticated("/drivers/me/availability", {
        method: "PUT",
        body: JSON.stringify({ online: false }),
      });
      setOnline(false);
      setRows([]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Courier offers</Text>
      <Text>
        Go online to share foreground location and receive eligible delivery
        offers.
      </Text>
      {error !== "" && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {online ? (
        <>
          <Text>{gps.message}</Text>
          <ActionButton
            accessibilityLabel="Go offline for delivery offers"
            disabled={busy}
            onPress={() => {
              void offline();
            }}
          >
            Go offline
          </ActionButton>
          <ActionButton
            accessibilityLabel="Refresh delivery offers"
            disabled={busy}
            onPress={() => {
              void refresh();
            }}
          >
            Refresh offers
          </ActionButton>
          {rows.length === 0 && (
            <Text>
              No current offers. Availability depends on your approval, location
              and existing jobs.
            </Text>
          )}
          {rows.map((o) => (
            <View key={o.id} style={styles.item}>
              <Text>
                Delivery {o.deliveryId.slice(0, 8)} · Fare{" "}
                {xaf(o.quotedAmountXaf)}
              </Text>
              <Text>Expires {new Date(o.expiresAt).toLocaleTimeString()}</Text>
              <ActionButton
                accessibilityLabel="Accept delivery offer"
                disabled={
                  busy || !gps.ready || Date.parse(o.expiresAt) <= Date.now()
                }
                onPress={() => {
                  void respond(o.id, true);
                }}
              >
                Accept offer
              </ActionButton>
              <ActionButton
                accessibilityLabel="Decline delivery offer"
                disabled={busy}
                onPress={() => {
                  void respond(o.id, false);
                }}
              >
                Decline offer
              </ActionButton>
            </View>
          ))}
        </>
      ) : (
        <ActionButton
          accessibilityLabel="Go online for delivery offers"
          disabled={busy}
          onPress={() => setOnline(true)}
        >
          Go online
        </ActionButton>
      )}
    </View>
  );
}
