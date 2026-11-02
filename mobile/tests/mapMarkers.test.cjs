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
  window.updateZippMap({ drivers: [{ coordinate: pickup, heading: 90 }] });
  assert.equal(car.element.children[0].style.transform, 'scaleX(-1)', 'original artwork faces right when traveling east');
  window.updateZippMap({ drivers: [{ coordinate: pickup, heading: 270 }] });
  assert.equal(car.element.children[0].style.transform, 'scaleX(1)', 'original artwork faces left when traveling west');
  window.updateZippMap({ drivers: [{ coordinate: pickup, heading: 0 }] });
  assert.equal(car.element.children[0].style.transform, 'scaleX(1)', 'northbound motion preserves facing without flipping back and forth');
  assert.equal(car.element.children[1].style.transform, undefined, 'heading never rotates the label');
  window.updateZippMap({ pickup, destination });
  assert.equal(sources['driver-route'].features.length, 0);
});

test('route movement faces each road segment and keeps the final heading at arrival', () => {
  const { routeProgress } = load(path.resolve(__dirname, '../src/utils/routeProgress.ts'));
  const points = [{latitude: 0, longitude: 0}, {latitude: 0, longitude: 1}, {latitude: 1, longitude: 1}];
  assert.equal(routeProgress(points, 0).heading, 90);
  assert.equal(routeProgress(points, 0.25).heading, 90);
  assert.equal(routeProgress(points, 0.5).heading, 0);
  assert.equal(routeProgress(points, 0.75).heading, 0);
  assert.equal(routeProgress(points, 1).heading, 0);
  assert.equal(routeProgress([...points, points[2]], 1).heading, 0);
  assert.equal(routeProgress([points[0], points[0], points[1]], 0).heading, 90);
  assert.equal(routeProgress([points[1], points[0]], 0.5).heading, 270);
  assert.equal(routeProgress([points[0], points[0]], 0.5).heading, undefined);
});

test('the booking map keeps the complete route when the ride starts and progresses', () => {
  const source = ts.createSourceFile('BookRideScreen.tsx', fs.readFileSync(path.resolve(__dirname, '../src/screens/BookRideScreen.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'RideMap') {
      expression = node.attributes.properties.find(prop => prop.name?.getText(source) === 'route').initializer.expression.getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const coordinates = [{latitude: 4.1, longitude: 9.2}, {latitude: 4.2, longitude: 9.3}];
  for (const phase of ['arriving', 'arrived', 'in_progress', 'processing_payment']) {
    const route = vm.runInNewContext(expression, { phase, passengerRoute: { coordinates }, roadRoute: { route: { coordinates } }, journeyMovement: { remaining: [] } });
    assert.equal(route, coordinates, `${phase} retains the full road geometry`);
  }
});
