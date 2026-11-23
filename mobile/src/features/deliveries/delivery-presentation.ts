import { StyleSheet } from "react-native";
import { colors } from "../../constants/colors";
export const xaf = (value?: string) =>
  value === undefined
    ? "—"
    : `${value.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} XAF`;
export const titles: Record<string, string> = {
  SEARCHING: "Finding a courier",
  ASSIGNED: "Courier assigned",
  AT_PICKUP: "Courier at pickup",
  COLLECTED: "Package collected",
  IN_TRANSIT: "On the way",
  AT_DESTINATION: "Courier at destination",
  RETURNING: "Return authorized",
  AT_RETURN: "Courier back at pickup",
  DELIVERED: "Delivered",
  RETURNED: "Returned to sender",
  CANCELLED: "Cancelled",
  NO_COURIER: "No courier available",
};

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 44, gap: 18 },
  title: { fontSize: 20, fontWeight: "700", color: colors.navy },
  heading: { fontSize: 16, fontWeight: "600", color: colors.navy },
  copy: { fontSize: 12, color: colors.secondaryText },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  link: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  card: {
    borderRadius: 20,
    backgroundColor: colors.input,
    padding: 16,
    gap: 12,
  },
  item: { minHeight: 48, paddingVertical: 10, gap: 4 },
  choice: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: 14,
    padding: 12,
    backgroundColor: colors.input,
    justifyContent: "center",
    alignItems: "center",
  },
  selected: { backgroundColor: colors.yellow },
  input: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.white,
    padding: 12,
    color: colors.navy,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: { color: colors.error },
  map: { height: 240, borderRadius: 20, overflow: "hidden" },
});
