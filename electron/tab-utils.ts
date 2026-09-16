const ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];

export function nextZoom(current: number, direction: 1 | -1): number {
  return direction === 1
    ? (ZOOM_STEPS.find((step) => step > current) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1])
    : ([...ZOOM_STEPS].reverse().find((step) => step < current) ?? ZOOM_STEPS[0]);
}

export function moveTabOrder(order: number[], id: number, index: number): number[] {
  if (!Number.isSafeInteger(index)) throw new TypeError('分頁位置必須是整數');
  if (!order.includes(id)) return [...order];
  const next = order.filter((item) => item !== id);
  next.splice(Math.max(0, Math.min(next.length, index)), 0, id);
  return next;
}
