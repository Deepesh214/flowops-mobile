import Feather from '@expo/vector-icons/Feather';
import { Redirect, Tabs } from 'expo-router';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { useAuthStore } from '@/features/auth/authStore';
import { useAppStore } from '@/store/appStore';
import { colors, fonts } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof Feather>['name'];

function TabIcon({
  name,
  color,
  focused,
}: {
  name: IconName;
  color: ColorValue;
  focused: boolean;
}) {
  return (
    <View style={styles.iconWrap}>
      <Feather name={name} size={21} color={color as string} />
      {focused ? <View style={styles.dot} /> : null}
    </View>
  );
}

export default function TabsLayout() {
  const status = useAuthStore((s) => s.status);
  const failed = useAppStore((s) => s.failedCount);

  if (status === 'signedOut') return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64,
          paddingTop: 6,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: (p) => <TabIcon name="home" {...p} /> }}
      />
      <Tabs.Screen
        name="tasks"
        options={{ title: 'Tasks', tabBarIcon: (p) => <TabIcon name="check-square" {...p} /> }}
      />
      <Tabs.Screen
        name="analytics"
        options={{ title: 'Insights', tabBarIcon: (p) => <TabIcon name="bar-chart-2" {...p} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: (p) => <TabIcon name="user" {...p} />,
          tabBarBadge: failed > 0 ? failed : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.accent,
            fontFamily: fonts.bold,
            fontSize: 10,
          },
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: { alignItems: 'center' },
  dot: {
    position: 'absolute',
    top: -7,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
});
