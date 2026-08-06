export const calculatePaidHours = (entry) => {
  if (!entry?.clock_in || !entry?.clock_out) return 0;

  const shiftStart = new Date(entry.clock_in).getTime();
  const shiftEnd = new Date(entry.clock_out).getTime();

  if (!Number.isFinite(shiftStart) || !Number.isFinite(shiftEnd) || shiftEnd <= shiftStart) {
    return 0;
  }

  const completedBreakMs = (Array.isArray(entry.break_periods) ? entry.break_periods : []).reduce(
    (total, period) => {
      const breakStart = new Date(period?.start).getTime();
      const breakEnd = new Date(period?.end).getTime();

      if (!Number.isFinite(breakStart) || !Number.isFinite(breakEnd) || breakEnd <= breakStart) {
        return total;
      }

      const boundedStart = Math.max(shiftStart, breakStart);
      const boundedEnd = Math.min(shiftEnd, breakEnd);
      return total + Math.max(0, boundedEnd - boundedStart);
    },
    0
  );

  // A completed shift only deducts recorded, completed break periods. Stale
  // on_break flags must never erase hours after the employee has clocked out.
  return Math.max(0, (shiftEnd - shiftStart - completedBreakMs) / 3600000);
};
