export const environment = {
  communicationsEnabled:
    process.env.EXPO_PUBLIC_COMMUNICATIONS_ENABLED === "true",
  notificationInboxEnabled:
    process.env.EXPO_PUBLIC_NOTIFICATION_INBOX_ENABLED === "true",
  realtimeEnabled: process.env.EXPO_PUBLIC_REALTIME_ENABLED === "true",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL,
  deliveryApiEnabled: process.env.EXPO_PUBLIC_DELIVERY_API_ENABLED === "true",
};

export function requireApiBaseUrl(): string {
  const { apiBaseUrl } = environment;

  if (!apiBaseUrl) {
    throw new Error(
      "EXPO_PUBLIC_API_URL must be set before making API requests.",
    );
  }

  const parsed = new URL(apiBaseUrl);
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !["https:", "http:"].includes(parsed.protocol) ||
    (!__DEV__ && parsed.protocol !== "https:")
  )
    throw new Error(
      "Configure a secure API URL without credentials or query parameters.",
    );
  return apiBaseUrl.replace(/\/+$/, "");
}
