const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadService(fetch) {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/placeSearch.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({ BUEA_CENTER: { latitude: 4.155, longitude: 9.24 } }), process: { env: {} }, fetch });
  return exports;
}
const feature = (coordinates = [9.3001245, 4.1502427], countrycode = 'CM') => ({ geometry: { type: 'Point', coordinates }, properties: { name: 'Mile 17', city: 'Buea', countrycode } });

test('parses real-world GeoJSON axis order and filters invalid, duplicate and overseas results', () => {
  const { parsePlaceSuggestions } = loadService();
  const places = parsePlaceSuggestions({ features: [feature(), feature(), feature(['9', 4]), feature([9, 100]), feature([9, 4], 'DE'), null] });
  assert.equal(places.length, 1);
  assert.equal(places[0].coordinate.latitude, 4.1502427);
  assert.equal(places[0].coordinate.longitude, 9.3001245);
  assert.equal(places[0].label, 'Mile 17, Buea');
  assert.throws(() => parsePlaceSuggestions({ error: 'down' }));
});

test('encodes queries, passes cancellation, and caches repeat searches', async () => {
  let requests = 0;
  const controller = new AbortController();
  const { searchPlaces } = loadService(async (url, options) => {
    requests++;
    assert.match(url, /q=Mile%2017%20%26%20Buea/);
    assert.equal(options.signal, controller.signal);
    return { ok: true, json: async () => ({ features: [feature()] }) };
  });
  assert.equal((await searchPlaces('Mi', controller.signal)).length, 0);
  assert.equal((await searchPlaces('Mile 17 & Buea', controller.signal)).length, 1);
  await searchPlaces('Mile 17 & Buea', controller.signal);
  assert.equal(requests, 1);
});

test('failed requests are surfaced and are not cached', async () => {
  let requests = 0;
  const { searchPlaces } = loadService(async () => { requests++; return { ok: false }; });
  const signal = new AbortController().signal;
  await assert.rejects(searchPlaces('Mile 17', signal));
  await assert.rejects(searchPlaces('Mile 17', signal));
  assert.equal(requests, 2);
});
test('reverse lookup resolves a GPS pickup to its actual place label', async () => {
  const signal = new AbortController().signal;
  const { reversePlace } = loadService(async (url, options) => {
    assert.match(url, /\/reverse\?lat=4.1502427&lon=9.3001245/);
    assert.equal(options.signal, signal);
    return { ok: true, json: async () => ({ features: [feature()] }) };
  });
  assert.equal(await reversePlace({ latitude: 4.1502427, longitude: 9.3001245 }, signal), 'Mile 17, Buea');
});
