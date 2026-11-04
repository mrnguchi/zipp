const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(fetch, clock = Date) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/services/roadRoute.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, process: { env: {} }, fetch, Date: clock });
  return exports;
}
const response = () => ({ code: 'Ok', routes: [{ geometry: { type: 'LineString', coordinates: [[9.24, 4.155], [9.25, 4.16], [9.3, 4.15]] }, distance: 9381.3, duration: 1023.4 }] });
test('preserves the full road geometry and converts GeoJSON longitude/latitude order', () => {
  const { parseRoadRoute } = load();
  const route = parseRoadRoute(response());
  assert.equal(route.coordinates.length, 3);
  assert.equal(route.coordinates[0].latitude, 4.155);
  assert.equal(route.coordinates[0].longitude, 9.24);
  assert.equal(route.distanceMeters, 9381.3);
  assert.equal(route.durationSeconds, 1023.4);
});

test('expired routes and explicit retries fetch fresh geometry instead of session-old cache', async () => {
  let now = 0, calls = 0;
  const { fetchRoadRoute } = load(async () => {
    calls++;
    return { ok: true, json: async () => response() };
  }, { now: () => now });
  const signal = new AbortController().signal;
  const from = { latitude: 4.155, longitude: 9.24 }, to = { latitude: 4.15, longitude: 9.3 };
  await fetchRoadRoute(from, to, signal);
  now = 119999;
  await fetchRoadRoute(from, to, signal);
  assert.equal(calls, 1);
  now = 120000;
  await fetchRoadRoute(from, to, signal);
  assert.equal(calls, 2);
  await fetchRoadRoute(from, to, signal, true);
  assert.equal(calls, 3);
});
test('rejects missing routes, invalid geometry and invalid summaries without a straight-line fallback', () => {
  const { parseRoadRoute } = load();
  assert.throws(() => parseRoadRoute({ code: 'NoRoute', routes: [] }));
  const bad = response(); bad.routes[0].geometry.coordinates[1] = [9, 91];
  assert.throws(() => parseRoadRoute(bad));
  const summary = response(); summary.routes[0].duration = -1;
  assert.throws(() => parseRoadRoute(summary));
});
test('requests full driving geometry with cancellation and reuses cached results', async () => {
  let calls = 0;
  const signal = new AbortController().signal;
  const { fetchRoadRoute } = load(async (url, options) => {
    calls++;
    assert.match(url, /9.24,4.155;9.3,4.15\?/);
    assert.match(url, /overview=full&geometries=geojson/);
    assert.equal(options.signal, signal);
    return { ok: true, json: async () => response() };
  });
  const from = { latitude: 4.155, longitude: 9.24 }, to = { latitude: 4.15, longitude: 9.3 };
  await fetchRoadRoute(from, to, signal);
  await fetchRoadRoute(from, to, signal);
  assert.equal(calls, 1);
  await assert.rejects(fetchRoadRoute({ latitude: 91, longitude: 9 }, to, signal));
});
