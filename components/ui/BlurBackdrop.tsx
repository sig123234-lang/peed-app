import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

// Native fallback — no CSS backdrop-filter, so we just dim behind the popup.
// (The web variant, BlurBackdrop.web.tsx, does the real blur.)
export function BlurBackdrop({
  children,
  onPress,
  tint = 'rgba(10, 12, 20, 0.7)',
}: {
  children: React.ReactNode;
  onPress?: () => void;
  tint?: string;
  blur?: number;
}) {
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          zIndex: 100,
          backgroundColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        },
      ]}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onPress} />
      <View style={{ maxWidth: '100%', maxHeight: '100%' }}>{children}</View>
    </View>
  );
}
