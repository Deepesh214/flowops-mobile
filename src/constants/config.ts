export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Without Supabase credentials the app runs against an on-device demo backend. */
export const IS_DEMO_MODE = !SUPABASE_URL || !SUPABASE_ANON_KEY;

export const DEMO_ACCOUNT = { email: 'alex@flowops.app', password: 'flowops123' } as const;

export const EVIDENCE_BUCKET = 'evidence';
export const MAX_IMAGE_WIDTH = 1600;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const REQUEST_TIMEOUT_MS = 15_000;
export const DUE_SOON_MINUTES = 30;
