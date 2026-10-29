import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { TextField, type TextInputHandle } from '@/components/TextField';
import { colors, radius, spacing } from '@/theme/tokens';

import { validateLogin, type LoginErrors } from './validation';

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  initialEmail?: string;
  initialPassword?: string;
  banner?: string | null;
}

export function LoginForm({
  onSubmit,
  initialEmail = '',
  initialPassword = '',
  banner,
}: LoginFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialPassword);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInputHandle>(null);

  // Lets the parent prefill (e.g. "Use demo account") after mount.
  const [seen, setSeen] = useState({ initialEmail, initialPassword });
  if (seen.initialEmail !== initialEmail || seen.initialPassword !== initialPassword) {
    setSeen({ initialEmail, initialPassword });
    setEmail(initialEmail);
    setPassword(initialPassword);
    setErrors({});
    setFormError(null);
  }

  async function submit() {
    if (submitting) return;
    const found = validateLogin({ email, password });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    try {
      await onSubmit(email.trim(), password);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const message = formError ?? banner;

  return (
    <View style={styles.form}>
      {message ? (
        <View style={styles.error} accessibilityRole="alert" testID="login-error">
          <AppText variant="caption" style={{ color: colors.accentPressed }}>
            {message}
          </AppText>
        </View>
      ) : null}
      <TextField
        testID="login-email"
        label="Work email"
        placeholder="you@company.com"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!submitting}
      />
      <TextField
        ref={passwordRef}
        testID="login-password"
        label="Password"
        placeholder="Your password"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        editable={!submitting}
      />
      <Button
        testID="login-submit"
        label={submitting ? 'Signing in…' : 'Sign in'}
        onPress={submit}
        loading={submitting}
        icon="arrow-right"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  error: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
