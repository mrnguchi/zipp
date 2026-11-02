import type { MapCoordinate } from '../components/maps/mapGeometry';

// Fixture only: choose a nearby bearing from the pickup, independently of the
// passenger destination. Dispatch GPS should replace this when assigning drivers.
export function sampleDriverLocation(pickup: MapCoordinate): MapCoordinate {
  const seed = Math.abs(Math.round(pickup.latitude * 10000) * 31 + Math.round(pickup.longitude * 10000));
  const bearing = (seed % 360) * Math.PI / 180;
  const distance = 450 + (seed % 350);
  const angularDistance = distance / 6371000;
  const latitude = pickup.latitude * Math.PI / 180;
  const longitude = pickup.longitude * Math.PI / 180;
  const resultLatitude = Math.asin(Math.sin(latitude) * Math.cos(angularDistance) + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing));
  const resultLongitude = longitude + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude), Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(resultLatitude));
  return { latitude: resultLatitude * 180 / Math.PI, longitude: ((resultLongitude * 180 / Math.PI + 540) % 360) - 180 };
}
