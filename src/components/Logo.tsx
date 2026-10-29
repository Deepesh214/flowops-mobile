import { StyleSheet, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

import { AppText } from './AppText';

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <View style={styles.row} accessible accessibilityLabel="FlowOps">
      <View style={{ width: size, height: size }}>
        <View
          style={[
            styles.red,
            { width: size * 0.62, height: size * 0.62, borderTopLeftRadius: size * 0.08 },
          ]}
        />
        <View
          style={[
            styles.black,
            {
              left: size * 0.38,
              top: size * 0.38,
              borderLeftWidth: size * 0.62,
              borderBottomWidth: size * 0.62,
            },
          ]}
        />
      </View>
      <AppText style={{ fontFamily: fonts.bold, fontSize: size * 0.82, letterSpacing: -0.4 }}>
        FlowOps
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  red: { position: 'absolute', left: 0, top: 0, backgroundColor: colors.accent },
  black: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderBottomColor: colors.dark,
  },
});
