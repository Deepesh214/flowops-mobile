// White and soft-gray surfaces, heavy black display type, and a single
// coral-red accent used sparingly.
export const colors = {
  background: '#F4F4F4',
  surface: '#FFFFFF',
  surfaceMuted: '#EFEFEF',
  surfaceSunken: '#E9E9E9',
  border: '#E4E4E4',
  borderStrong: '#CFCFCF',

  text: '#111111',
  textSecondary: '#555555',
  textTertiary: '#8E8E8E',
  textOnAccent: '#FFFFFF',

  accent: '#F2453D',
  accentPressed: '#D63A33',
  accentSoft: '#FDE8E7',

  success: '#1F9D55',
  successSoft: '#E3F5EA',
  warning: '#B7791F',
  warningSoft: '#FDF3DF',
  info: '#2B6CB0',
  infoSoft: '#E5EFFA',
  dark: '#111111',
} as const;

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const type = {
  display: { fontFamily: fonts.extrabold, fontSize: 32, lineHeight: 36, letterSpacing: -1 },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
  heading: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
} as const;

/** Minimum touch target, per platform accessibility guidance. */
export const HIT_SIZE = 44;
