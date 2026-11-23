export abstract class NotificationCrypto {
  abstract digest(purpose: string, value: string): string;
  abstract matches(expected: string, value: string): boolean;
  abstract seal(deviceId: string, generation: number, token: string): string;
  abstract open(
    deviceId: string,
    generation: number,
    ciphertext: string,
  ): string;
}
