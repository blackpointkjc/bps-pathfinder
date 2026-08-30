import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";

/**
 * PullToRefresh wrapper.
 * Usage: <PullToRefresh onRefresh={async () => { await refetch(); }}>...</PullToRefresh>
 */
export default function PullToRefresh({ onRefresh, children }) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(null);
  const THRESHOLD = 70;

  const handleTouchStart = (e) => {
    // Layout owns vertical scrolling. Pull-to-refresh should only begin when
    // that shared page scroller is already at the top.
    const pageScroller = e.currentTarget.closest('.mobile-field-content');
    if ((pageScroller?.scrollTop || 0) > 0) return;
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    if (startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      setPulling(true);
      setPullDistance(Math.min(delta * 0.5, THRESHOLD + 20));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    setPulling(false);
    setPullDistance(0);
    startY.current = null;
  };

  const progress = Math.min(pullDistance / THRESHOLD, 1);

  return (
    <div
      className="relative min-h-full overflow-visible overscroll-y-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Indicator */}
      <motion.div
        animate={{ height: pullDistance, opacity: pullDistance > 10 ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="overflow-hidden flex items-center justify-center bg-transparent pointer-events-none"
      >
        <motion.div
          animate={{ rotate: refreshing ? 360 : progress * 180 }}
          transition={refreshing ? { duration: 0.7, repeat: Infinity, ease: "linear" } : { duration: 0 }}
        >
          <RefreshCw
            className={`w-5 h-5 transition-colors ${progress >= 1 ? "text-blue-600" : "text-slate-400"}`}
          />
        </motion.div>
      </motion.div>

      {children}
    </div>
  );
}