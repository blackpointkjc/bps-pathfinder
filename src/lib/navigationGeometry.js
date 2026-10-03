// Project onto road segments, including long straight highway segments.
export function projectOntoRoute(position, route, fromIndex = 0, toIndex = route.length - 1) {
  let best = { distance: Infinity, index: Math.max(0, fromIndex), point: position, bearing: null };
  const scaleY = 111195;
  const scaleX = scaleY * Math.cos(position[0] * Math.PI / 180);
  const start = Math.max(0, Math.min(route.length - 2, fromIndex));
  const end = Math.min(route.length - 1, toIndex);
  for (let index = start; index < end; index += 1) {
    const a = route[index], b = route[index + 1];
    const ax = (a[1] - position[1]) * scaleX, ay = (a[0] - position[0]) * scaleY;
    const dx = (b[1] - a[1]) * scaleX, dy = (b[0] - a[0]) * scaleY;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
    const distance = Math.hypot(ax + t * dx, ay + t * dy);
    if (distance < best.distance) {
      best = {
        distance, index,
        point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
        bearing: lengthSquared > 1 ? (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360 : null,
      };
    }
  }
  return best;
}

export function shortestHeadingDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}
