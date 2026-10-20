// ResizeObserver callbacks must not synchronously change the observed layout.
export function observeElementSize(element, onResize) {
 let frame = null;
 let stopped = false;
 let previous = '';
 const refresh = () => {
  if (stopped || frame !== null) return;
  frame = requestAnimationFrame(() => {
   frame = null;
   if (stopped || !element?.isConnected) return;
   const rect = element.getBoundingClientRect();
   const width = Math.round(rect.width);
   const height = Math.round(rect.height);
   const key = width + ':' + height;
   if (key === previous) return;
   previous = key;
   onResize({width,height});
  });
 };
 const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(refresh) : null;
 if (element) observer?.observe(element);
 refresh();
 return {
  refresh,
  disconnect() {
   stopped = true;
   observer?.disconnect();
   if (frame !== null) cancelAnimationFrame(frame);
   frame = null;
  },
 };
}
