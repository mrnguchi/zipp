export abstract class DocumentStorage {
  abstract write(key: string, content: Uint8Array): Promise<void>;
  abstract read(key: string): Promise<Uint8Array>;
}
