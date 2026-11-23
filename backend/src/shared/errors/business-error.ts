/** Transport-independent failures with deliberately safe public messages. */
export class BusinessError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly operationId?: string,
  ) {
    super(message);
  }
}
