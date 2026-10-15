import type { MaybeRefOrGetter, Ref } from "vue";
import { toValue } from "vue";
import { useEventListener } from "@vueuse/core";

/** Horizontal touch navigation without claiming scrolling, editing or OS edge gestures. */
export function useSidebarSwipe(
  target: MaybeRefOrGetter<HTMLElement | null>,
  open: Ref<boolean>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  let gesture: { id: number; x: number; y: number; open: boolean } | undefined;
  const reset = () => {
    gesture = undefined;
  };
  useEventListener(
    target,
    "touchstart",
    (event: TouchEvent) => {
      reset();
      if (!toValue(enabled) || event.touches.length !== 1) return;
      const element = event.target instanceof Element ? event.target : null;
      if (
        element?.closest(
          "input, textarea, select, [contenteditable], [role=slider], [data-no-swipe]",
        )
      )
        return;
      if (window.getSelection()?.toString()) return;
      const touch = event.touches[0]!;
      // Keep the outermost edge for the browser/OS back gesture. Open from the left gutter.
      if (!open.value && (touch.clientX < 20 || touch.clientX > 88)) return;
      gesture = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        open: open.value,
      };
    },
    { passive: true },
  );
  useEventListener(
    target,
    "touchmove",
    (event: TouchEvent) => {
      if (!gesture) return;
      if (
        !toValue(enabled) ||
        event.touches.length !== 1 ||
        gesture.open !== open.value
      )
        return reset();
      const touch = Array.from(event.touches).find(
        (t) => t.identifier === gesture!.id,
      );
      if (!touch) return reset();
      const dx = touch.clientX - gesture.x,
        dy = touch.clientY - gesture.y;
      // Once vertical intent is clear, this gesture belongs to the scroll container.
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx) * 0.7)
        return reset();
      const forward = gesture.open ? dx < 0 : dx > 0;
      if (forward && Math.abs(dx) > 12 && event.cancelable)
        event.preventDefault();
    },
    { passive: false },
  );
  useEventListener(
    target,
    "touchend",
    (event: TouchEvent) => {
      const current = gesture;
      reset();
      if (
        !current ||
        !toValue(enabled) ||
        event.touches.length ||
        current.open !== open.value
      )
        return;
      const touch = Array.from(event.changedTouches).find(
        (t) => t.identifier === current.id,
      );
      if (!touch || window.getSelection()?.toString()) return;
      const dx = touch.clientX - current.x,
        dy = touch.clientY - current.y;
      if (Math.abs(dx) < 64 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      if (current.open ? dx < 0 : dx > 0) open.value = !current.open;
    },
    { passive: true },
  );
  useEventListener(target, "touchcancel", reset, { passive: true });
}
