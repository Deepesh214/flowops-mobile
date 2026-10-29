jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Icon fonts are assets; tests only care that an icon element is rendered.
jest.mock('@expo/vector-icons/Feather', () => {
  const { Text } = require('react-native');
  const Icon = ({ name }) => require('react').createElement(Text, { testID: `icon-${name}` });
  return { __esModule: true, default: Icon };
});
