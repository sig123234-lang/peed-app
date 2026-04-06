import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const BRAND_BLUE = '#4F6BFF';

type AppHeaderProps = {
  pbAmount?: string;
  onPressLogo?: () => void;
  onPressBell?: () => void;
};

export default function AppHeader({
  pbAmount = '0',
  onPressLogo,
  onPressBell,
}: AppHeaderProps) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onPressLogo}>
        <Text style={styles.logo}>PEED</Text>
      </TouchableOpacity>

      <View style={styles.rightRow}>
        <View style={styles.pbChip}>
          <Text style={styles.pbIcon}>PB</Text>
          <Text style={styles.pbText}>{pbAmount}</Text>
        </View>

        <TouchableOpacity style={styles.bellButton} onPress={onPressBell}>
          <Text style={styles.bellIcon}>🔔</Text>
          <View style={styles.redDot} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },

  logo: {
    fontSize: 22,
    fontWeight: '900',
    color: BRAND_BLUE,
    letterSpacing: 0.5,
  },

  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  pbChip: {
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#DCE6FF',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  pbIcon: {
    color: BRAND_BLUE,
    fontSize: 12,
    fontWeight: '900',
    marginRight: 8,
  },

  pbText: {
    color: BRAND_BLUE,
    fontSize: 16,
    fontWeight: '800',
  },

  bellButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },

  bellIcon: {
    fontSize: 17,
  },

  redDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
});