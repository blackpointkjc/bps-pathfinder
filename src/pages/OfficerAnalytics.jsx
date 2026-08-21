import MyPerformanceAnalytics from './MyPerformanceAnalytics';

// Keep the legacy Officer Analytics route for bookmarks/navigation, but render the
// canonical live performance dashboard so every officer-facing performance route
// uses the same data source, refresh cadence, and scoring engine.
export default function OfficerAnalytics() {
  return <MyPerformanceAnalytics />;
}
