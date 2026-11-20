// On the web, a home-screen app on iPhone draws under the status bar (viewport-fit=cover), but the safe-area
// library measures before that setting is applied and reads 0, so headers and the map's Back button sat under
// the clock. Measure the browser's own env(safe-area-inset-*) instead, again on resize and rotation.
import { useSyncExternalStore } from 'react';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

const NONE: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
let current = NONE;

function measure() {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const s = getComputedStyle(probe);
  const next = { top: parseFloat(s.paddingTop) || 0, right: parseFloat(s.paddingRight) || 0, bottom: parseFloat(s.paddingBottom) || 0, left: parseFloat(s.paddingLeft) || 0 };
  probe.remove();
  // The same object while nothing changed, as useSyncExternalStore needs.
  if (next.top !== current.top || next.right !== current.right || next.bottom !== current.bottom || next.left !== current.left) current = next;
}

function subscribe(changed: () => void) {
  const update = () => {
    measure();
    changed();
  };
  update();
  // Again once the page's viewport settings are in place.
  const frame = requestAnimationFrame(update);
  const later = setTimeout(update, 500);
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(later);
    window.removeEventListener('resize', update);
    window.removeEventListener('orientationchange', update);
  };
}

export function useInsets(): EdgeInsets {
  const fallback = useSafeAreaInsets();
  const measured = useSyncExternalStore(subscribe, () => current, () => NONE);
  return {
    top: Math.max(measured.top, fallback.top),
    right: Math.max(measured.right, fallback.right),
    bottom: Math.max(measured.bottom, fallback.bottom),
    left: Math.max(measured.left, fallback.left),
  };
}
