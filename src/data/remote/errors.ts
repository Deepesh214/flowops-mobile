export type RemoteErrorKind =
  | 'network' // no connection, DNS, socket closed
  | 'timeout'
  | 'server' // 5xx
  | 'auth' // expired session, forbidden
  | 'invalid_credentials'
  | 'validation' // bad payload, constraint violation
  | 'conflict' // remote changed after our base version
  | 'not_found';

export class RemoteError extends Error {
  constructor(
    readonly kind: RemoteErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}

export type ErrorClass = 'retryable' | 'auth' | 'validation' | 'conflict';

/** How the sync worker should treat a failure. */
export function classifyError(error: unknown): ErrorClass {
  if (error instanceof RemoteError) {
    switch (error.kind) {
      case 'network':
      case 'timeout':
      case 'server':
        return 'retryable';
      case 'auth':
      case 'invalid_credentials':
        return 'auth';
      case 'conflict':
        return 'conflict';
      case 'validation':
      case 'not_found':
        return 'validation';
    }
  }
  // fetch() rejects with a TypeError when the network is unreachable.
  if (error instanceof TypeError) return 'retryable';
  return 'validation';
}

/** Human-readable message: never shows raw backend text to the user. */
export function userMessage(error: unknown): string {
  if (error instanceof RemoteError) {
    switch (error.kind) {
      case 'network':
        return "Can't reach the server. Check your connection and try again.";
      case 'timeout':
        return 'The server took too long to respond. Please try again.';
      case 'server':
        return 'The server had a problem. We will retry automatically.';
      case 'auth':
        return 'Your session has expired. Please sign in again.';
      case 'invalid_credentials':
        return 'Email or password is incorrect.';
      case 'conflict':
        return 'This task was changed elsewhere. The latest server version was kept.';
      case 'validation':
        return 'This change was rejected by the server.';
      case 'not_found':
        return 'This item no longer exists on the server.';
    }
  }
  if (error instanceof TypeError)
    return "Can't reach the server. Check your connection and try again.";
  return 'Something went wrong. Please try again.';
}
