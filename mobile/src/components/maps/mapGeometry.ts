export type MapCoordinate = { latitude: number; longitude: number };
export const BUEA_CENTER: MapCoordinate = { latitude: 4.155, longitude: 9.24 };
export const TILE_SIZE = 256;

export function project(point: MapCoordinate, zoom: number) {
  const size = TILE_SIZE * 2 ** zoom;
  const latitude = Math.max(-85.0511, Math.min(85.0511, point.latitude));
  const sine = Math.sin(latitude * Math.PI / 180);
  return {
    x: (point.longitude + 180) / 360 * size,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size,
  };
}

export function unproject(x: number, y: number, zoom: number): MapCoordinate {
  const size = TILE_SIZE * 2 ** zoom;
  const boundedY = Math.max(0, Math.min(size, y));
  return {
    longitude: ((x / size * 360) % 360 + 360) % 360 - 180,
    latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * boundedY / size))) * 180 / Math.PI,
  };
}
