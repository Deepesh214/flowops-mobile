import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email.')
    .pipe(z.email('Enter a valid email address.')),
  password: z
    .string()
    .min(1, 'Enter your password.')
    .min(6, 'Password must be at least 6 characters.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type LoginErrors = Partial<Record<keyof LoginInput, string>>;

export function validateLogin(input: LoginInput): LoginErrors {
  const result = loginSchema.safeParse(input);
  if (result.success) return {};
  const errors: LoginErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof LoginInput;
    errors[field] ??= issue.message;
  }
  return errors;
}
