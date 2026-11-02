export const environment = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL,
};

export function requireApiBaseUrl(): string {
  const { apiBaseUrl } = environment;

  if (!apiBaseUrl) {
    throw new Error('EXPO_PUBLIC_API_URL must be set before making API requests.');
  }

  return apiBaseUrl.replace(/\/+$/, '');
}
