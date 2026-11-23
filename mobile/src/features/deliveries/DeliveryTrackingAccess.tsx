import { useRef, useState } from "react";
import { Pressable, Share, View } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { ActionButton } from "../../components/ActionButton";
import type { DeliveryApiModel } from "./use-delivery-api";
import * as api from "./delivery-api";
import { trackingCredential } from "./crypto";
import { styles } from "./delivery-presentation";
export function DeliveryTrackingAccess({
  id,
  flow,
}: {
  id: string;
  flow: DeliveryApiModel;
}) {
  const d = { id };
  const [caps, setCaps] = useState<
    Awaited<ReturnType<typeof api.capabilities>>
  >([]);
  const pendingShare = useRef<{
    deliveryId: string;
    input: Awaited<ReturnType<typeof trackingCredential>>;
  } | null>(null);
  async function share() {
    if (!d) return;
    if (pendingShare.current?.deliveryId !== d.id)
      pendingShare.current = {
        deliveryId: d.id,
        input: await trackingCredential(),
      };
    const input = pendingShare.current.input,
      cap = await api.issueCapability(d.id, input);
    if (cap.revokedAt) throw new Error("Tracking credential revoked");
    await Share.share({
      message: `Zipp delivery tracking. Open Zipp, choose View shared tracking and paste this credential. It expires ${new Date(cap.expiresAt).toLocaleString()}. Keep it private.\n${input.id}.${input.secret}`,
    });
    pendingShare.current = null;
    setCaps(await api.capabilities(d.id));
  }

  return (
    <View style={styles.card}>
      <ActionButton
        accessibilityLabel="Share restricted tracking"
        disabled={flow.busy}
        onPress={() => {
          void flow.perform(share);
        }}
      >
        Share restricted tracking
      </ActionButton>
      <ActionButton
        accessibilityLabel="List tracking access"
        disabled={flow.busy}
        onPress={() => {
          void flow.perform(async () => setCaps(await api.capabilities(d.id)));
        }}
      >
        Manage tracking access
      </ActionButton>
      {caps.map((cap) => (
        <Pressable
          key={cap.id}
          accessibilityRole="button"
          disabled={!!cap.revokedAt || flow.busy}
          onPress={() => {
            void flow.perform(async () => {
              await api.revokeCapability(d.id, cap.id);
              setCaps(await api.capabilities(d.id));
            });
          }}
          style={styles.item}
        >
          <Text>
            {cap.id.slice(0, 8)} · {cap.revokedAt ? "Revoked" : "Revoke access"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
