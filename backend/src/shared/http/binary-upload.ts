import type { Request } from 'express';
import { ApiError } from '../errors/api-error.js';

/** Per-process memory admission only; authorization/ownership live in PostgreSQL. */
let activeUploads = 0;
export async function readPrivateBinaryBody(
  request: Request,
  expectedLength: number,
): Promise<Uint8Array> {
  if (
    request.headers['content-type'] !== 'application/octet-stream' ||
    request.headers['content-encoding']
  )
    throw new ApiError(
      'VALIDATION_ERROR',
      400,
      'Use an unencoded application/octet-stream body',
    );
  if (request.headers['content-length'] !== String(expectedLength))
    throw new ApiError(
      'VALIDATION_ERROR',
      400,
      'Content-Length must match the upload intent',
    );
  if (activeUploads >= 2)
    throw new ApiError('UPLOAD_BUSY', 503, 'Retry upload shortly', 2);
  activeUploads++;
  const chunks: Buffer[] = [];
  let length = 0;
  const timer = setTimeout(
    () => request.destroy(new Error('Upload deadline exceeded')),
    10_000,
  );
  try {
    for await (const chunk of request) {
      const bytes: unknown = chunk;
      if (!Buffer.isBuffer(bytes))
        throw new ApiError('VALIDATION_ERROR', 400, 'Invalid binary upload');
      length += bytes.length;
      if (length > expectedLength || length > 3 * 1024 * 1024)
        throw new ApiError(
          'PAYLOAD_TOO_LARGE',
          413,
          'Document exceeds the declared size',
        );
      chunks.push(bytes);
    }
    if (length !== expectedLength)
      throw new ApiError('VALIDATION_ERROR', 400, 'Incomplete document upload');
    return Buffer.concat(chunks, length);
  } finally {
    clearTimeout(timer);
    activeUploads--;
  }
}
