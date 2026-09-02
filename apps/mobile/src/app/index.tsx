import { StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder route. The scaffold exists to prove Metro bundles through pnpm's
 * symlinked store; the real "Where should I hunt this weekend?" screen replaces
 * this once the API client lands.
 */
export default function IndexScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>HuntStack</Text>
      <Text style={styles.subtitle}>Pre-hunt intelligence. Coming to your phone.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
});
