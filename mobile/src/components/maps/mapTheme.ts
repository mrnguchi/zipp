import { colors } from '../../constants/colors';

// Equal RGB channels keep every base-map feature strictly grayscale.
// Trip overlays are rendered separately in Zipp green.
export const mapTheme = {
  background: '#FAFAFA',
  land: '#F4F4F4',
  park: '#EEEEEE',
  water: '#E5E5E5',
  building: '#EAEAEA',
  buildingOutline: '#D8D8D8',
  road: '#FFFFFF',
  roadOutline: '#DEDEDE',
  label: '#888888',
  landmarkLabel: '#666666',
  labelHalo: '#FFFFFF',
  accent: colors.primary,
};

export function createMapStyle() {
  const vector = { source: 'openmaptiles' };
  const roadWidth = ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 3, 18, 16];
  return {
    version: 8,
    sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': mapTheme.background } },
      { id: 'land', type: 'fill', ...vector, 'source-layer': 'landcover', paint: { 'fill-color': mapTheme.land } },
      { id: 'landuse', type: 'fill', ...vector, 'source-layer': 'landuse', paint: { 'fill-color': mapTheme.land } },
      { id: 'parks', type: 'fill', ...vector, 'source-layer': 'park', paint: { 'fill-color': mapTheme.park } },
      { id: 'water', type: 'fill', ...vector, 'source-layer': 'water', paint: { 'fill-color': mapTheme.water } },
      { id: 'waterways', type: 'line', ...vector, 'source-layer': 'waterway', paint: { 'line-color': mapTheme.water, 'line-width': 1.5 } },
      { id: 'buildings', type: 'fill', ...vector, 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': mapTheme.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.6, 16, 1] } },
      { id: 'building-outlines', type: 'line', ...vector, 'source-layer': 'building', minzoom: 15, paint: { 'line-color': mapTheme.buildingOutline, 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.4, 18, 1] } },
      { id: 'road-outlines', type: 'line', ...vector, 'source-layer': 'transportation', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': mapTheme.roadOutline, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 5, 18, 19] } },
      { id: 'roads', type: 'line', ...vector, 'source-layer': 'transportation', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': mapTheme.road, 'line-width': roadWidth } },
      { id: 'road-labels', type: 'symbol', ...vector, 'source-layer': 'transportation_name', minzoom: 14, layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name'], ''], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'symbol-spacing': 350 }, paint: { 'text-color': mapTheme.label, 'text-halo-color': mapTheme.labelHalo, 'text-halo-width': 2 } },
      { id: 'place-labels', type: 'symbol', ...vector, 'source-layer': 'place', maxzoom: 15, layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name'], ''], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-transform': 'uppercase', 'text-letter-spacing': 0.1 }, paint: { 'text-color': mapTheme.label, 'text-halo-color': mapTheme.labelHalo, 'text-halo-width': 2 } },
      {
        id: 'landmark-labels', type: 'symbol', ...vector, 'source-layer': 'poi', minzoom: 15,
        filter: ['!=', ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name'], ''], ''],
        layout: {
          'text-field': ['concat', '• ', ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name'], '']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10, 18, 12],
          'text-max-width': 10, 'text-padding': 8,
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 1000],
          'text-allow-overlap': false, 'text-ignore-placement': false,
        },
        paint: { 'text-color': mapTheme.landmarkLabel, 'text-halo-color': mapTheme.labelHalo, 'text-halo-width': 1.5 },
      },
      {
        id: 'house-numbers', type: 'symbol', ...vector, 'source-layer': 'housenumber', minzoom: 18,
        layout: { 'text-field': ['to-string', ['get', 'housenumber']], 'text-font': ['Noto Sans Regular'], 'text-size': 9, 'text-padding': 4 },
        paint: { 'text-color': mapTheme.label, 'text-halo-color': mapTheme.labelHalo, 'text-halo-width': 1 },
      },
    ],
  };
}
