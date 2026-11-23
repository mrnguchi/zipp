import { InputFailure } from "../api/transport";
import { File } from "expo-file-system";
export async function readPhoto(uri: string) {
  if (!/^(file|content):/.test(uri))
    throw new InputFailure("Choose a local package photo");
  const file = new File(uri);
  if (!file.exists || file.size < 16 || file.size > 3145728)
    throw new InputFailure("Use a package photo no larger than 3 MiB");
  const bytes = await file.bytes();
  if (bytes.length > 3145728) throw new InputFailure("Photo exceeds 3 MiB");
  return bytes;
}
