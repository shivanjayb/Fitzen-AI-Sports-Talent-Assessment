import type { CapacitorConfig } from '@capacitor/cli';

// Native shells for Android and iOS: the same built web app (dist/) bundled inside the app, so it opens offline.
// Pose model files still download on first camera use and are cached by the WebView.
const config: CapacitorConfig = {
  appId: 'app.fitzen.mobile', // ponytail: placeholder bundle id; change once before the first store upload, never after
  appName: 'Fitzen',
  webDir: 'dist',
  ios: { contentInset: 'never', backgroundColor: '#f3f1ec' },
  android: { backgroundColor: '#f3f1ec' },
};
export default config;
