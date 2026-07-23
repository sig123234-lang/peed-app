import { Platform, useWindowDimensions } from 'react-native';

// Desktop layout (3-column) only kicks in on web when the viewport is wide
// enough to fit it. Mobile browsers + native fall back to the phone layout.
const DESKTOP_BREAKPOINT = 1280;

export function useIsDesktop() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
}
