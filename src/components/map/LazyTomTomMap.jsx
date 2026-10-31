import { lazy, Suspense } from 'react';

// Loading the GPS/dispatch page should not download the entire WebGL/3D map
// engine until the map itself is opened. Shared across all Pathfinder maps.
const TomTomMap = lazy(() => import('./TomTomSdkMapPreview'));

export default function LazyTomTomMap(props) {
  return (
    <Suspense fallback={<div role="status" className="absolute inset-0 flex items-center justify-center bg-[#0b1725] text-sm text-slate-200">Opening live map…</div>}>
      <TomTomMap {...props} />
    </Suspense>
  );
}
