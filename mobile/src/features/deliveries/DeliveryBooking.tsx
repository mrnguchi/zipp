import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText as Text } from "../../components/AppText";
import { ActionButton } from "../../components/ActionButton";
import { DeliveryDetailsForm } from "../../components/DeliveryDetailsForm";
import { DeliveryPerspectivePicker } from "../../components/DeliveryPerspectivePicker";
import { PlacePickerSheet } from "../../components/PlacePickerSheet";
import { RideMap } from "../../components/maps/RideMap";
import {
  switchDeliveryPerspective,
  validateDelivery,
} from "../../services/deliveryFlow";
import type { DeliveryDraft, DeliveryStop } from "../../services/deliveryFlow";
import type { DeliveryApiModel } from "./use-delivery-api";
import { styles, xaf } from "./delivery-presentation";
import * as api from "./delivery-api";
import { requestId } from "./crypto";
import { normalizePhone, sessionSnapshot } from "../identity/session";
import { errorMessage } from "../api/transport";
export function DeliveryBooking({
  draft,
  setDraft,
  flow,
}: {
  draft: DeliveryDraft;
  setDraft: Dispatch<SetStateAction<DeliveryDraft>>;
  flow: DeliveryApiModel;
}) {
  const [picker, setPicker] = useState<"pickup" | "dropoff" | null>(null),
    [map, setMap] = useState<"pickup" | "dropoff" | null>(null),
    [consent, setConsent] = useState(false),
    [claimId, setClaimId] = useState(""),
    [claimRole, setClaimRole] = useState<"SENDER" | "RECIPIENT">("RECIPIENT");
  const change = (update: Partial<DeliveryDraft>) => {
    if (flow.uncertain) return;
    setDraft((v) => ({ ...v, ...update }));
    flow.invalidateQuote();
  };
  function validate() {
    const problem = validateDelivery(draft, 2);
    if (problem) {
      flow.setError(problem);
      return false;
    }
    if (
      draft.senderName.trim().length > 100 ||
      draft.recipientName.trim().length > 100
    ) {
      flow.setError("Contact names must be at most 100 characters.");
      return false;
    }
    try {
      const sender = normalizePhone(draft.senderPhone),
        recipient = normalizePhone(draft.recipientPhone),
        own = draft.perspective === "sending" ? sender : recipient;
      if (own !== sessionSnapshot()?.phone) {
        flow.setError(
          "Use your verified phone number for your selected contact role.",
        );
        return false;
      }
    } catch (e) {
      flow.setError(errorMessage(e));
      return false;
    }
    return true;
  }
  const choose = (stop: DeliveryStop) => {
    if (picker) change({ [picker]: stop });
    setPicker(null);
  };

  return (
    <>
      <DeliveryPerspectivePicker
        value={draft.perspective}
        onChange={(v) => {
          setDraft((current) => switchDeliveryPerspective(current, v));
          flow.invalidateQuote();
        }}
      />
      {__DEV__ && (
        <ActionButton
          accessibilityLabel="Use documented local development route"
          onPress={() =>
            change({
              pickup: {
                label: "Local development pickup",
                coordinate: { latitude: 4.05, longitude: 9.7 },
              },
              dropoff: {
                label: "Local development destination",
                coordinate: { latitude: 4.06, longitude: 9.72 },
              },
            })
          }
        >
          Use local development route
        </ActionButton>
      )}
      <View style={styles.card}>
        {(["pickup", "dropoff"] as const).map((key) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            onPress={() => setPicker(key)}
            style={styles.item}
          >
            <Text style={styles.heading}>
              {key === "pickup" ? "Pickup" : "Drop-off"}
            </Text>
            <Text>{draft[key]?.label ?? "Choose a location"}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        {(["standard", "express"] as const).map((mode) => (
          <Pressable
            key={mode}
            accessibilityRole="radio"
            accessibilityState={{ checked: draft.mode === mode }}
            onPress={() => change({ mode })}
            style={[styles.choice, draft.mode === mode && styles.selected]}
          >
            <Text>{mode === "standard" ? "Standard" : "Express"}</Text>
          </Pressable>
        ))}
      </View>
      <DeliveryDetailsForm draft={draft} onChange={change} />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        onPress={() => setConsent(!consent)}
        style={styles.item}
      >
        <Text>
          {consent ? "☑" : "☐"} I accept the delivery terms and agree to share
          these contacts with the assigned courier.
        </Text>
      </Pressable>
      <Text>Available wallet: {xaf(flow.available ?? undefined)}</Text>
      <ActionButton
        accessibilityLabel="Get server delivery quote"
        disabled={flow.busy || !flow.ready}
        onPress={() => {
          if (validate()) void flow.review(draft);
        }}
      >
        Review fare
      </ActionButton>
      {flow.quote && (
        <View style={styles.card}>
          <Text style={styles.heading}>{xaf(flow.quote.totalAmountXaf)}</Text>
          <Text>
            Quote expires {new Date(flow.quote.expiresAt).toLocaleTimeString()}
          </Text>
          <Text>
            {(flow.quote.distanceMeters / 1000).toFixed(1)} km ·{" "}
            {Math.ceil(flow.quote.durationSeconds / 60)} min
          </Text>
          <ActionButton
            accessibilityLabel="Book delivery and reserve wallet funds"
            disabled={!consent || flow.busy}
            onPress={() => {
              if (validate()) void flow.book(draft);
            }}
          >
            Confirm and reserve funds
          </ActionButton>
        </View>
      )}
      <View style={styles.card}>
        <Text style={styles.heading}>Claim a delivery contact role</Text>
        <TextInput
          accessibilityLabel="Delivery ID to claim"
          value={claimId}
          onChangeText={setClaimId}
          autoCapitalize="none"
          maxLength={36}
          style={styles.input}
        />
        <View style={styles.row}>
          {(["SENDER", "RECIPIENT"] as const).map((role) => (
            <Pressable
              key={role}
              accessibilityRole="radio"
              accessibilityState={{ checked: claimRole === role }}
              onPress={() => setClaimRole(role)}
              style={styles.choice}
            >
              <Text>{role}</Text>
            </Pressable>
          ))}
        </View>
        <ActionButton
          accessibilityLabel="Claim verified contact"
          disabled={flow.busy}
          onPress={() => {
            void flow.perform(async () => {
              const value = await api.action(
                claimId,
                "claim-contact",
                await requestId(),
                { role: claimRole },
              );
              flow.select(value);
            });
          }}
        >
          Claim with my verified phone
        </ActionButton>
      </View>
      <PlacePickerSheet
        visible={!!picker}
        title={picker === "pickup" ? "Pickup" : "Drop-off"}
        value={picker ? draft[picker] : undefined}
        onClose={() => setPicker(null)}
        onSelect={choose}
        onMap={() => {
          setMap(picker);
          setPicker(null);
        }}
      />
      <Modal visible={!!map} onRequestClose={() => setMap(null)}>
        <SafeAreaView style={styles.flex}>
          <Text style={styles.heading}>Tap to choose {map}</Text>
          <View style={styles.flex}>
            <RideMap
              pickup={draft.pickup?.coordinate}
              destination={draft.dropoff?.coordinate}
              topInset={0}
              bottomInset={0}
              showControls={false}
              onSelectCoordinate={(coordinate) => {
                if (map)
                  change({
                    [map]: {
                      label: `${coordinate.latitude.toFixed(4)}, ${coordinate.longitude.toFixed(4)}`,
                      coordinate,
                    },
                  });
              }}
            />
          </View>
          <ActionButton
            accessibilityLabel="Confirm map location"
            onPress={() => setMap(null)}
          >
            Use this location
          </ActionButton>
        </SafeAreaView>
      </Modal>
    </>
  );
}
