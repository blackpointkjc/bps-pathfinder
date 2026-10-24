import { lazy } from 'react';
import Layout from '@/Layout';
import generatedConfig from '../pages.config.js?raw';

// Read generated route metadata as text, preserving aliases without eager page imports.
const pageModules = import.meta.glob('../pages/*.jsx');
const imports = Object.fromEntries([...generatedConfig.matchAll(/^import\s+(\w+)\s+from\s+['"]\.\/pages\/([^'"]+)['"]/gm)]
  .map(([, name, path]) => [name, path.endsWith('.jsx') ? path : path + '.jsx']));
const registry = generatedConfig.match(/^export const PAGES\s*=\s*\{([\s\S]*?)\n\}/m)?.[1] || '';
const entries = [...registry.matchAll(/["']([^"']+)["']\s*:\s*(\w+)/g)].map(([, name, component]) => [name, imports[component]]);
const routes = new Map([...entries, ['UnitStatus', 'UnitStatus.jsx'], ['AdminAbsenceCoverage', 'AdminAbsenceCoverage.jsx']]);
const Pages = Object.fromEntries([...routes].map(([name, file]) => {
  const loader = pageModules[`../pages/${file}`];
  if (!loader) throw new Error(`Missing route module: ${name}`);
  return [name, lazy(loader)];
}));
const mainPage = generatedConfig.match(/^export const pagesConfig\s*=\s*\{\s*mainPage:\s*["']([^"']+)["']/m)?.[1] || 'Home';
export const pagesConfig = { Pages, mainPage, Layout };
