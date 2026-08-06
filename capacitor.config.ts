import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.blackpointkjc.pathfinder',
  appName: 'BPS CAD',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
