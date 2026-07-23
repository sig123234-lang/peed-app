// Extends app.json and injects the Kakao Maps JS key from the build environment
// (NEXT_PUBLIC_KAKAO_MAP_KEY on Vercel) into `extra`, so the web bundle can read
// it at runtime via expo-constants. This is a public, domain-restricted client
// key (safe to ship to the browser). `config` is the resolved app.json content.
export default ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    kakaoMapKey:
      process.env.EXPO_PUBLIC_KAKAO_MAP_KEY ||
      process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ||
      '',
  },
});
