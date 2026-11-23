import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { ActionButton } from "../../components/ActionButton";
import { RideMap } from "../../components/maps/RideMap";
import type { DeliveryApiModel } from "./use-delivery-api";
import * as api from "./delivery-api";
import { preCollection, terminal } from "./contracts";
import { styles, titles, xaf } from "./delivery-presentation";
import { useCourierLocation } from "./use-courier-location";
import { DeliveryTrackingAccess } from "./DeliveryTrackingAccess";
import { errorMessage } from "../api/transport";
import { environment } from "../../config/environment";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
export function DeliveryStatus({ flow }: { flow: DeliveryApiModel }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const d = flow.selected,
    booker = d?.viewerRole === "BOOKER",
    courier = d?.viewerRole === "COURIER",
    ended = !!d && terminal(d.status),
    gps = useCourierLocation(d);
  const [reason, setReason] = useState(""),
    [stars, setStars] = useState(0),
    [feedback, setFeedback] = useState(""),
    [notice, setNotice] = useState(""),
    [proof, setProof] = useState(""),
    [bill, setBill] = useState<Awaited<ReturnType<typeof api.receipt>> | null>(
      null,
    );
  useEffect(() => {
    let alive = true;
    if (d && ended && booker)
      void api
        .receipt(d.id)
        .then((v) => {
          if (alive) setBill(v);
        })
        .catch((e) => {
          if (alive) flow.setError(errorMessage(e));
        });
    return () => {
      alive = false;
    };
  }, [d?.id, ended, booker, d?.version]);
  const codePurpose =
    d?.status === "AT_PICKUP"
      ? "PICKUP"
      : d?.status === "AT_DESTINATION"
        ? "HANDOVER"
        : d?.status === "AT_RETURN"
          ? "RETURN"
          : null;
  const advance = d
    ? (
        {
          ASSIGNED: ["arrive-pickup", "Arrive at pickup"],
          AT_PICKUP: ["collect", "Confirm collection"],
          COLLECTED: ["transit", "Start transit"],
          IN_TRANSIT: ["arrive-destination", "Arrive at destination"],
          AT_DESTINATION: ["deliver", "Confirm handover"],
          RETURNING: ["arrive-return", "Arrive back at sender"],
          AT_RETURN: ["confirm-return", "Confirm return"],
        } as Record<string, [string, string]>
      )[d.status]
    : undefined;

  if (!d) return null;
  return (
    <>
      {environment.communicationsEnabled && (
        <ActionButton
          accessibilityLabel="Open delivery conversation"
          onPress={() =>
            navigation.navigate("Conversation", {
              jobType: "DELIVERY",
              jobId: d.id,
            })
          }
        >
          Message participants
        </ActionButton>
      )}
      {notice !== "" && <Text accessibilityLiveRegion="polite">{notice}</Text>}
      <View style={styles.card}>
        <Text style={styles.heading}>{titles[d.status]}</Text>
        <Text selectable>{d.id}</Text>
        <Text>
          {d.custody === "WITH_COURIER"
            ? "The courier holds your package. Returns require support authorization."
            : d.custody === "WITH_RECIPIENT"
              ? "Recipient handover confirmed."
              : d.custody === "RETURNED_TO_SENDER"
                ? "Sender return confirmed."
                : "Package is with the sender."}
        </Text>
        <Text>
          {d.package.description} · {d.package.weightGrams} g
        </Text>
        <Text>
          Sender: {d.sender.name}
          {d.sender.phone ? ` · ${d.sender.phone}` : ""}
        </Text>
        <Text>
          Recipient: {d.recipient.name}
          {d.recipient.phone ? ` · ${d.recipient.phone}` : ""}
        </Text>
        {booker && (
          <Text>
            Quoted {xaf(d.quotedAmountXaf)} · Charged {xaf(d.chargedAmountXaf)}{" "}
            · Refunded {xaf(d.refundedAmountXaf)}
          </Text>
        )}
      </View>
      {!ended && (
        <View style={styles.map}>
          <RideMap
            pickup={d.pickup}
            destination={d.destination}
            drivers={
              flow.position && !flow.position.stale
                ? [
                    {
                      id: "assigned-courier",
                      coordinate: flow.position,
                      kind: "courier",
                    },
                  ]
                : undefined
            }
            topInset={0}
            bottomInset={0}
            showControls={false}
          />
        </View>
      )}
      {!ended && (
        <Text style={styles.copy}>
          {flow.position
            ? flow.position.stale
              ? "Last courier position is stale. Refreshing…"
              : `Last courier position: ${new Date(flow.position.receivedAt).toLocaleTimeString()}`
            : "No current courier position available."}
        </Text>
      )}
      {codePurpose &&
        (booker ||
          courier ||
          (codePurpose === "HANDOVER"
            ? d.viewerRole === "RECIPIENT"
            : d.viewerRole === "SENDER")) && (
          <View style={styles.card}>
            <Text>
              Code delivery is sent only to the{" "}
              {codePurpose === "HANDOVER" ? "recipient" : "sender"} phone. Share
              it with the courier only after checking the package.
            </Text>
            <ActionButton
              accessibilityLabel="Request contact verification code"
              disabled={flow.busy}
              onPress={() => {
                void flow.perform(async () => {
                  await api.requestCode(d.id, codePurpose);
                  setNotice(
                    "Code delivery requested for the appropriate contact phone.",
                  );
                });
              }}
            >
              Request {codePurpose.toLowerCase()} code
            </ActionButton>
          </View>
        )}
      {courier && !ended && (
        <View style={styles.card}>
          <Text style={styles.heading}>Courier custody actions</Text>
          <Text>{gps.message}</Text>
          {codePurpose && (
            <TextInput
              accessibilityLabel="Six digit contact code"
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              value={proof}
              onChangeText={(v) => setProof(v.replace(/\D/g, ""))}
              style={styles.input}
            />
          )}{" "}
          {advance && (
            <ActionButton
              accessibilityLabel={advance[1]}
              disabled={flow.busy || (!!codePurpose && proof.length !== 6)}
              onPress={() => {
                void flow.mutate(
                  `courier:${advance[0]}`,
                  codePurpose ? { code: proof } : {},
                );
                setProof("");
              }}
            >
              {advance[1]}
            </ActionButton>
          )}
        </View>
      )}
      {(booker || courier) && preCollection(d.status) && (
        <View style={styles.card}>
          <Text>
            {courier
              ? "You may cancel before collection; the customer hold will be released."
              : `Cancelling after assignment may charge ${xaf(d.cancellationFeeXaf)}.`}
            Before assignment there is no charge.
          </Text>
          <TextInput
            accessibilityLabel="Cancellation reason"
            value={reason}
            onChangeText={setReason}
            maxLength={300}
            style={styles.input}
          />
          <ActionButton
            accessibilityLabel="Cancel delivery with reason"
            disabled={flow.busy || reason.trim().length < 10}
            onPress={() => {
              void flow.mutate("cancel", { reason: reason.trim() });
            }}
          >
            Cancel delivery
          </ActionButton>
        </View>
      )}
      {!ended && (
        <View style={styles.card}>
          <Text style={styles.heading}>Get help or request a return</Text>
          <TextInput
            accessibilityLabel="Delivery issue details"
            value={reason}
            onChangeText={setReason}
            maxLength={500}
            multiline
            style={styles.input}
          />
          <ActionButton
            accessibilityLabel="Open delivery support issue"
            disabled={flow.busy || reason.trim().length < 10}
            onPress={() => {
              void flow.mutate("issues", {
                kind:
                  d.custody === "WITH_COURIER" ? "RETURN_REQUEST" : "DISPUTE",
                reason: reason.trim(),
              });
            }}
          >
            Send to support
          </ActionButton>
        </View>
      )}
      {booker && !ended && <DeliveryTrackingAccess id={d.id} flow={flow} />}
      {bill && (
        <View style={styles.card}>
          <Text style={styles.heading}>Receipt</Text>
          <Text>Charged: {xaf(bill.chargedAmountXaf)}</Text>
          <Text>Refunded: {xaf(bill.refundedAmountXaf)}</Text>
          <Text>Net paid: {xaf(bill.netAmountXaf)}</Text>
        </View>
      )}
      {booker && d.status === "DELIVERED" && !bill?.rating && (
        <View style={styles.card}>
          <Text style={styles.heading}>Rate your delivery</Text>
          <View style={styles.row}>
            {[1, 2, 3, 4, 5].map((v) => (
              <Pressable
                key={v}
                accessibilityRole="button"
                accessibilityLabel={`${v} stars`}
                accessibilityState={{ selected: stars === v }}
                onPress={() => setStars(v)}
                style={styles.choice}
              >
                <Text>{v <= stars ? "★" : "☆"}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            accessibilityLabel="Optional delivery feedback"
            value={feedback}
            onChangeText={setFeedback}
            maxLength={500}
            style={styles.input}
          />
          <ActionButton
            accessibilityLabel="Submit delivery rating"
            disabled={!stars || flow.busy}
            onPress={() => {
              void flow
                .mutate("rating", {
                  stars,
                  ...(feedback.trim() ? { comment: feedback.trim() } : {}),
                })
                .then(() =>
                  flow.perform(async () => setBill(await api.receipt(d.id))),
                );
            }}
          >
            Submit rating
          </ActionButton>
        </View>
      )}
      {ended && (
        <ActionButton
          accessibilityLabel="Book another delivery"
          disabled={flow.busy || flow.uncertain}
          onPress={() => {
            flow.select(null);
            flow.invalidateQuote();
          }}
        >
          Book another delivery
        </ActionButton>
      )}
    </>
  );
}
