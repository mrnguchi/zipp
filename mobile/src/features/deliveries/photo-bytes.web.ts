import { InputFailure } from "../api/transport";
export async function readPhoto(uri: string) {
  if (!/^(blob:|data:image\/(png|jpeg);)/.test(uri) || uri.length > 4200000)
    throw new InputFailure("Choose a JPEG or PNG package photo");
  const c = new AbortController(),
    timer = setTimeout(() => c.abort(), 10000);
  try {
    const response = await fetch(uri, { signal: c.signal });
    const blob = await response.blob();
    if (blob.size < 16 || blob.size > 3145728)
      throw new InputFailure("Use a photo no larger than 3 MiB");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}
