import type { ProofPurpose } from '../contracts/delivery.schemas.js';
export abstract class PackagePhotoStorage {
  abstract write(key: string, bytes: Uint8Array): Promise<void>;
  abstract read(key: string): Promise<Uint8Array>;
}
export interface ContactCodeMessage {
  requestId: string;
  deliveryId: string;
  purpose: ProofPurpose;
  phone: string;
  code: string;
  expiresAt: Date;
}
export abstract class ContactCodeDelivery {
  abstract send(message: ContactCodeMessage): Promise<void>;
}
