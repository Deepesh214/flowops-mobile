import * as Crypto from 'expo-crypto';

function fallbackUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Client-generated ids let offline records exist before the server sees them. */
export function uuid(): string {
  try {
    const id = Crypto.randomUUID();
    if (typeof id === 'string' && id.length > 0) return id;
  } catch {
    // Native module unavailable (tests, some web builds).
  }
  return fallbackUuid();
}
