// Extends app.json with values that must not be committed.
// The Android Google Maps key comes from the environment:
//   - local builds: put GOOGLE_MAPS_ANDROID_API_KEY=... in .env
//   - EAS cloud builds: `eas env:create --name GOOGLE_MAPS_ANDROID_API_KEY ...`
module.exports = ({ config }) => {
  const googleMapsApiKey =
    process.env.GOOGLE_MAPS_ANDROID_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!googleMapsApiKey) {
    console.warn(
      '[app.config] GOOGLE_MAPS_ANDROID_API_KEY is not set; maps will not work in Android builds.'
    );
    return config;
  }

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: { apiKey: googleMapsApiKey },
      },
    },
  };
};
