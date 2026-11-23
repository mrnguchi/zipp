// No message body/credential in browser persistence. This page's unresolved key
// survives component unmounts only; do not claim recovery after browser restart.
const pending = new Map<string, string>();
export const readPending = async (user: string) => pending.get(user) ?? null;
export const writePending = async (user: string, value: string) => {
  pending.set(user, value);
};
export const removePending = async (user: string) => {
  pending.delete(user);
};
