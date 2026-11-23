// Web sessions deliberately do not persist bearer credentials in browser storage.
let refresh: string | null = null;
export const readRefresh = async () => refresh;
export const saveRefresh = async (value: string) => {
  refresh = value;
};
export const removeRefresh = async () => {
  refresh = null;
};
