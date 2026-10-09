import assert from 'node:assert/strict';
import test from 'node:test';
import { hasSameRequestOrigin } from '../lib/company-reading/request-origin.js';
test('same-origin commits honor HTTP host despite Next URL normalization', () => {
  const request = { url: 'http://localhost:3107/api/public/company-thesis/MSFT', headers: new Headers({ host: '127.0.0.1:3107', origin: 'http://127.0.0.1:3107' }) };
  assert.equal(hasSameRequestOrigin(request), true);
  request.headers.set('origin', 'https://foreign.example');
  assert.equal(hasSameRequestOrigin(request), false);
  request.headers.set('x-forwarded-host', 'foreign.example');
  assert.equal(hasSameRequestOrigin(request), false);
  request.headers.delete('origin');
  assert.equal(hasSameRequestOrigin(request), false);
});
