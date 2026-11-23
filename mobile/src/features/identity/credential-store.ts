import * as SecureStore from "expo-secure-store";
const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const key = "zipp.refresh.v1";
export const readRefresh = () => SecureStore.getItemAsync(key, options);
export const saveRefresh = (value: string) =>
  SecureStore.setItemAsync(key, value, options);
export const removeRefresh = () => SecureStore.deleteItemAsync(key, options);
