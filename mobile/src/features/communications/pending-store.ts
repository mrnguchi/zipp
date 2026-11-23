import * as SecureStore from "expo-secure-store";
const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
export const readPending = (user: string) =>
  SecureStore.getItemAsync(`zipp.communications.pending.${user}`, options);
export const writePending = (user: string, value: string) =>
  SecureStore.setItemAsync(
    `zipp.communications.pending.${user}`,
    value,
    options,
  );
export const removePending = (user: string) =>
  SecureStore.deleteItemAsync(`zipp.communications.pending.${user}`, options);
