import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { randomUUID } from 'node:crypto'

const publishedBuildId = randomUUID();

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  define: { 'import.meta.env.VITE_PATHFINDER_BUILD_ID': JSON.stringify(publishedBuildId) },
  plugins: [
    {
      name: 'pathfinder-published-version',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'pathfinder-version.json', source: JSON.stringify({ app: 'pathfinder', buildId: publishedBuildId }) });
      },
    },
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true'
    }),
    react(),
  ]
});