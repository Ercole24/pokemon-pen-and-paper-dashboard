import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trusted} from './trusted.ts';

test('host e origin ammessi', () => {
  for (const host of ['localhost:3000', '192.168.1.20:3000', '[::1]:3000', 'mypc:3000', 'mypc.local:3000'])
    assert.ok(trusted({host}), host);
  assert.ok(trusted({host: '192.168.1.20:3000', origin: 'http://192.168.1.20:3000'}));
  assert.ok(trusted({host: 'localhost:5173', origin: 'http://localhost:5173'})); // Vite in sviluppo
});

test('siti esterni rifiutati', () => {
  assert.ok(!trusted({host: 'evil.example.com:3000'}), 'DNS rebinding');
  assert.ok(!trusted({host: 'localhost:3000', origin: 'https://evil.example.com'}), 'altra origine');
  assert.ok(!trusted({host: 'localhost:3000', origin: 'null'}));
  assert.ok(!trusted({}));
});
