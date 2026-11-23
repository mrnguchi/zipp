import { StyleSheet } from "react-native";
import { colors } from "../../constants/colors";
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: 24,
    gap: 18,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  group: { gap: 16 },
  heading: { fontSize: 26, fontWeight: "700", color: colors.navy },
  label: { fontSize: 16, fontWeight: "600", color: colors.navy },
  muted: { fontSize: 14, color: colors.secondaryText, lineHeight: 22 },
  error: { color: colors.error, fontSize: 14, lineHeight: 22 },
  card: {
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
  },
  own: { backgroundColor: colors.primarySoft },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    fontSize: 16,
    textAlignVertical: "top",
  },
  link: { minHeight: 48, justifyContent: "center", paddingVertical: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
});
