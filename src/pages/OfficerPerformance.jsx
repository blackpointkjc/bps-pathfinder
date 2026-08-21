import MyPerformanceAnalytics from './MyPerformanceAnalytics';

// Legacy route kept for compatibility. Pathfinder has one performance source of
// truth so this route renders the same canonical scoring page used by My Performance.
export default function OfficerPerformance() {
  return <MyPerformanceAnalytics />;
}
