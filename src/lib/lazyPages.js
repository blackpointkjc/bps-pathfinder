import { lazy } from 'react';
import Layout from '@/Layout';
import generatedConfig from '../pages.config.js?raw';

// Keep generated route membership and mainPage, without importing every page.
const pageModules = import.meta.glob('../pages/*.jsx');
const registry = generatedConfig.match(/^export const PAGES\s*=\s*\{([\s\S]*?)\n\}/m)?.[1] || '';
const names = [...registry.matchAll(/["']([^"']+)["']\s*:/g)].map(match => match[1]);
const Pages = Object.fromEntries([...new Set([...names, 'UnitStatus', 'AdminAbsenceCoverage'])].map(name => {
  const loader = pageModules[`../pages/${name}.jsx`];
  if (!loader) throw new Error(`Missing route module: ${name}`);
  return [name, lazy(loader)];
}));
const mainPage = generatedConfig.match(/^export const pagesConfig\s*=\s*\{\s*mainPage:\s*["']([^"']+)["']/m)?.[1] || 'Home';
export const pagesConfig = { Pages, mainPage, Layout };
