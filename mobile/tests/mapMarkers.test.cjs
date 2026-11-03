const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require: name => load(path.resolve(path.dirname(file), name + '.ts')) });
  return exports;
}
test('GPS replaces coincident pickup, while distinct pickup and destination stay visible', () => {
  const { createMapDocument } = load(path.resolve(__dirname, '../src/components/maps/mapDocument.ts'));
  const scripts = [...createMapDocument().matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const markers = [];
  const sources = {};
  const handler = { enable() {}, disable() {}, disableRotation() {} };
  class Map {
    constructor() { for (const key of ['dragPan', 'scrollZoom', 'boxZoom', 'doubleClickZoom', 'touchZoomRotate']) this[key] = handler; }
    on() {} getSource(id) { return { setData(data) { sources[id] = data; } }; } setPaintProperty() {} easeTo() {} fitBounds() {}
  }
  class Marker {
    constructor(options) { this.element = options.element; markers.push(this); }
    setLngLat() { return this; } addTo() { return this; } remove() { this.removed = true; }
  }
  class Bounds { extend() {} }
  const window = { innerHeight: 850, addEventListener() {} };
  const context = { window, document: { createElement: () => ({ style: {}, children: [], appendChild(child) { this.children.push(child); } }) }, maplibregl: { Map, Marker, LngLatBounds: Bounds }, send: value => { if (value.type === 'error') throw Error('Map script failed'); } };
  for (const script of scripts.slice(1)) vm.runInNewContext(script, context);
  const pickup = { latitude: 4.155, longitude: 9.24 };
  const destination = { latitude: 4.16, longitude: 9.25 };
  window.updateZippMap({ pickup, destination, locationFocus: { coordinate: pickup, requestId: 1 } });
  let active = markers.filter(marker => !marker.removed);
  assert.equal(active.length, 2);
  assert.ok(active.some(marker => marker.element.className === 'pin current-location'));
  assert.ok(!active.some(marker => marker.element.className === 'pin pickup'));
  window.updateZippMap({ pickup, destination, locationFocus: { coordinate: destination, requestId: 2 } });
  active = markers.filter(marker => !marker.removed);
  assert.equal(active.length, 2);
  assert.ok(!active.some(marker => marker.element.className === 'pin destination'));
  assert.ok(active.some(marker => marker.element.className === 'pin current-location'));
  window.updateZippMap({ pickup: { latitude: 4.17, longitude: 9.26 }, destination, locationFocus: { coordinate: pickup, requestId: 1 } });
  active = markers.filter(marker => !marker.removed);
  assert.equal(active.length, 3);
  window.updateZippMap({ pickup, destination, driverRoute: [destination, pickup], drivers: [{ coordinate: destination, arrivalLabel: '1.2 km away · 3 min' }] });
  const car = markers.filter(marker => !marker.removed).find(marker => marker.element.className === 'pin car');
  assert.ok(car.element.children[0].src.startsWith('data:image/png;base64,'));
  assert.equal(car.element.children[1].textContent, '1.2 km away · 3 min');
  assert.equal(sources['driver-route'].features[0].geometry.coordinates.length, 2);
  window.updateZippMap({ pickup, destination, driverRoute: [destination, pickup], drivers: [{ coordinate: pickup, arrivalLabel: '0.1 km away · 1 min' }] });
  assert.equal(markers.filter(marker => !marker.removed && marker.element.className === 'pin car')[0], car);
  assert.equal(car.element.children[1].textContent, '0.1 km away · 1 min');
  window.updateZippMap({ pickup, destination });
  assert.equal(sources['driver-route'].features.length, 0);
  window.updateZippMap({ pickup, destination, drivers: [{ id: 'courier', kind: 'courier', coordinate: pickup, arrivalLabel: 'Courier at pickup' }] });
  const courier = markers.filter(marker => !marker.removed).find(marker => marker.element.className === 'pin courier');
  assert.equal(courier.element.children[0].alt, 'Delivery courier');
  assert.ok(courier.element.children[0].src.startsWith('data:image/png;base64,'));
});
