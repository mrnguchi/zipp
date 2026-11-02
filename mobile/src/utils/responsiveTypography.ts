// Use the shorter window dimension so rotating a phone does not inflate text.
// Keep the existing size on standard phones; larger phones gain up to 18%.
export function screenTextScale(width: number, height: number): number {
  const shortEdge = Math.min(width, height);
  return Math.min(1.18, Math.max(1, 1 + ((shortEdge - 393) / 393) * 1.2));
}
