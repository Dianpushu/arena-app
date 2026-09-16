export interface WindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export interface DisplayWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getVisibleWindowBounds(
  bounds: WindowBounds | null,
  displays: { workArea: DisplayWorkArea }[],
): WindowBounds | null {
  if (!bounds) return null;
  if (bounds.x === undefined || bounds.y === undefined) return bounds;
  try {
    if (displays.length === 0) return bounds;
    const winRect = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
    const visible = displays.some((d) => {
      const area = d.workArea;
      return (
        winRect.x < area.x + area.width &&
        winRect.x + winRect.width > area.x &&
        winRect.y < area.y + area.height &&
        winRect.y + winRect.height > area.y
      );
    });
    if (!visible) {
      return { width: bounds.width, height: bounds.height };
    }
    return bounds;
  } catch {
    return bounds;
  }
}
