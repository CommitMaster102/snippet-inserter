// Unit tests for extension/lib/keyboard.js, which names the key of a shortcut the same way on every
// keyboard layout. Run with: npm run test:unit
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shortcutKey } = require('../../extension/lib/keyboard.js');

test('a Latin letter is the letter in lower case, whatever the layout puts on that key', () => {
  assert.equal(shortcutKey({ key: 'z', code: 'KeyZ' }), 'z');
  assert.equal(shortcutKey({ key: 'Z', code: 'KeyZ' }), 'z');
  // On a Dvorak layout the key labelled Z sits where a QWERTY keyboard has the slash.
  assert.equal(shortcutKey({ key: 'z', code: 'Slash' }), 'z');
  assert.equal(shortcutKey({ key: 's', code: 'KeyO' }), 's');
});

test('a letter of another alphabet gives the Latin letter of the same physical key', () => {
  assert.equal(shortcutKey({ key: 'я', code: 'KeyZ' }), 'z');
  assert.equal(shortcutKey({ key: 'ы', code: 'KeyS' }), 's');
  assert.equal(shortcutKey({ key: 'ض', code: 'KeyQ' }), 'q');
  assert.equal(shortcutKey({ key: 'ι', code: 'KeyK' }), 'k');
});

test('a digit comes from the key, or from the physical digit key on a layout such as AZERTY', () => {
  assert.equal(shortcutKey({ key: '2', code: 'Digit2' }), '2');
  assert.equal(shortcutKey({ key: 'é', code: 'Digit2' }), '2');
  assert.equal(shortcutKey({ key: '&', code: 'Digit1' }), '1');
  assert.equal(shortcutKey({ key: '9', code: 'Numpad9' }), '9');
});

test('a numpad key with Num Lock off keeps the name of the key it acts as', () => {
  assert.equal(shortcutKey({ key: 'PageUp', code: 'Numpad9' }), 'PageUp');
  assert.equal(shortcutKey({ key: 'ArrowDown', code: 'Numpad2' }), 'ArrowDown');
  assert.equal(shortcutKey({ key: 'ArrowLeft', code: 'Numpad4' }), 'ArrowLeft');
  assert.equal(shortcutKey({ key: 'Home', code: 'Numpad7' }), 'Home');
});

test('other keys keep their own name, even on a letter or digit key', () => {
  assert.equal(shortcutKey({ key: 'Enter', code: 'Enter' }), 'Enter');
  assert.equal(shortcutKey({ key: 'Escape', code: 'Escape' }), 'Escape');
  assert.equal(shortcutKey({ key: ';', code: 'Semicolon' }), ';');
  // A dead key or an input method reports a name, not a printed character, so the physical key
  // does not stand in for it.
  assert.equal(shortcutKey({ key: 'Dead', code: 'KeyA' }), 'Dead');
  assert.equal(shortcutKey({ key: 'Process', code: 'KeyZ' }), 'Process');
  assert.equal(shortcutKey({}), '');
});

test('the digit zero is not a shortcut digit', () => {
  assert.equal(shortcutKey({ key: 'à', code: 'Digit0' }), 'à');
  assert.equal(shortcutKey({ key: '0', code: 'Digit0' }), '0');
});
