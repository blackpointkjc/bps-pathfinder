import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { randomUUID } from 'node:crypto'

const publishedBuildId = randomUUID();

// Pages are loaded on demand, so the development server used to discover their
// packages one page at a time. Every discovery re-bundled dependencies, and the
// module the browser was already loading came back "504 Outdated Optimize Dep",
// which surfaces as "Failed to fetch dynamically imported module" and reloads the
// workspace (white flash, then "Preparing your tools" again). Declaring these
// packages up front means they are bundled once at start-up instead.
const prebundledDependencies = [
  'react',
  'react-dom',
  'react-dom/client',
  '@base44/sdk',
  'react-router-dom',
  '@tanstack/react-query',
  'lucide-react',
  'date-fns',
  'moment',
  'lodash',
  'sonner',
  'framer-motion',
  'recharts',
  'react-leaflet',
  'react-leaflet-cluster',
  'leaflet',
  'leaflet-rotate/dist/leaflet-rotate.js',
  'maplibre-gl',
  '@tomtom-org/maps-sdk/map',
  '@tomtom-org/maps-sdk/core',
  'react-markdown',
  'react-hook-form',
  '@hookform/resolvers',
  'zod',
  'clsx',
  'tailwind-merge',
  'class-variance-authority',
  'vaul',
  'cmdk',
  'input-otp',
  'react-day-picker',
  'react-resizable-panels',
  'embla-carousel-react',
  'next-themes',
  'qrcode.react',
  'html5-qrcode',
  'canvas-confetti',
  'react-hot-toast',
  'html2canvas',
  'jspdf',
  'jspdf-autotable',
  'exceljs',
  'three',
  '@hello-pangea/dnd',
  '@radix-ui/react-accordion',
  '@radix-ui/react-alert-dialog',
  '@radix-ui/react-aspect-ratio',
  '@radix-ui/react-avatar',
  '@radix-ui/react-checkbox',
  '@radix-ui/react-collapsible',
  '@radix-ui/react-context-menu',
  '@radix-ui/react-dialog',
  '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-hover-card',
  '@radix-ui/react-label',
  '@radix-ui/react-menubar',
  '@radix-ui/react-navigation-menu',
  '@radix-ui/react-popover',
  '@radix-ui/react-progress',
  '@radix-ui/react-radio-group',
  '@radix-ui/react-scroll-area',
  '@radix-ui/react-select',
  '@radix-ui/react-separator',
  '@radix-ui/react-slider',
  '@radix-ui/react-slot',
  '@radix-ui/react-switch',
  '@radix-ui/react-tabs',
  '@radix-ui/react-toast',
  '@radix-ui/react-toggle',
  '@radix-ui/react-toggle-group',
  '@radix-ui/react-tooltip',
];

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  define: { 'import.meta.env.VITE_PATHFINDER_BUILD_ID': JSON.stringify(publishedBuildId) },
  optimizeDeps: {
    include: prebundledDependencies,
    // The offline language-model worker bundles its own dependencies.
    exclude: ['@huggingface/transformers'],
  },
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