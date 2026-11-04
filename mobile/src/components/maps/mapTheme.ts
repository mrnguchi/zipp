import { colors } from '../../constants/colors';

// Equal RGB channels keep every base-map feature strictly grayscale.
// Trip overlays are rendered separately in Zipp green.
export const mapTheme = {
  background: '#FAFAFA',
  land: '#F4F4F4',
  park: '#EEEEEE',
  water: '#E5E5E5',
  building: '#DEDEDE',
  buildingOutline: '#BEBEBE',
  road: '#FFFFFF',
  roadOutline: '#CDCDCD',
  label: '#666666',
  landmarkLabel: '#444444',
  labelHalo: '#FFFFFF',
  accent: colors.primary,
};

export function createMapStyle() {
  const vector = { source: 'openmaptiles' };
  const name = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name'], ''];
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
      { id: 'buildings', type: 'fill', ...vector, 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': mapTheme.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.45, 15, 0.85, 17, 1] } },
      { id: 'building-outlines', type: 'line', ...vector, 'source-layer': 'building', minzoom: 14, paint: { 'line-color': mapTheme.buildingOutline, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.35, 17, 0.8, 19, 1.2] } },
      { id: 'road-outlines', type: 'line', ...vector, 'source-layer': 'transportation', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': mapTheme.roadOutline, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 5, 18, 19] } },
      { id: 'roads', type: 'line', ...vector, 'source-layer': 'transportation', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': mapTheme.road, 'line-width': roadWidth } },
      { id: 'road-labels', type: 'symbol', ...vector, 'source-layer': 'transportation_name', minzoom: 12, layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 15, 13, 18, 15], 'symbol-spacing': 220, 'text-padding': 4 }, paint: { 'text-color': mapTheme.label, 'text-halo-color': mapTheme.labelHalo, 'text-halo-width': 2 } },
      { id: 'place-labels', type: 'symbol', ...vector, 'source-layer': 'place', layout: { 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 12, 14, 14, 17, 16], 'text-padding': 10 }, paint: { 'text-color': mapTheme.label, 'text-halo-color': mapTheme.labelHalo, 'text-halo-width': 2 } },
      {
        id: 'landmark-labels', type: 'symbol', ...vector, 'source-layer': 'poi', minzoom: 15,
        filter: ['!=', ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name'], ''], ''],
        layout: {
          'text-field': ['concat', '• ', ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name'], '']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 12, 18, 14],
          'text-max-width': 12, 'text-padding': 5,
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 1000],
          'text-allow-overlap': false, 'text-ignore-placement': false,
        },
        paint: { 'text-color': mapTheme.landmarkLabel, 'text-halo-color': mapTheme.labelHalo, 'text-halo-width': 1.5 },
      },
      {
        id: 'essential-landmarks', type: 'symbol', ...vector, 'source-layer': 'poi', minzoom: 13,
        filter: ['all', ['!=', name, ''], ['match', ['get', 'class'], ['hospital', 'college', 'school', 'university', 'bus', 'railway', 'town_hall'], true, false]],
        layout: { 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 12, 17, 14], 'text-max-width': 12, 'text-padding': 7, 'symbol-sort-key': ['coalesce', ['get', 'rank'], 1000], 'text-allow-overlap': false },
        paint: { 'text-color': mapTheme.landmarkLabel, 'text-halo-color': mapTheme.labelHalo, 'text-halo-width': 2 },
      },
      {
        id: 'water-labels', type: 'symbol', ...vector, 'source-layer': 'water_name', minzoom: 12,
        layout: { 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-padding': 8 },
        paint: { 'text-color': mapTheme.label, 'text-halo-color': mapTheme.labelHalo, 'text-halo-width': 1.5 },
      },
      {
        id: 'house-numbers', type: 'symbol', ...vector, 'source-layer': 'housenumber', minzoom: 17,
        layout: { 'text-field': ['to-string', ['get', 'housenumber']], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-padding': 3 },
        paint: { 'text-color': mapTheme.label, 'text-halo-color': mapTheme.labelHalo, 'text-halo-width': 1 },
      },
    ],
  };
}
