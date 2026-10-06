const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'ripple.js'), 'utf8');

function fixture(reducedMotion = false) {
  const handlers = {};
  const layers = [];
  const timers = [];
  const document = {
    body: { appendChild(node) { layers.push(node); } },
    createElement() {
      return {
        style: {}, children: [],
        appendChild(child) { this.children.push(child); },
        addEventListener(type, callback) { this[type] = callback; },
        remove() { this.removed = true; }
      };
    },
    addEventListener(type, callback) { handlers[type] = callback; }
  };
  const surface = {
    disabled: false,
    matches() { return this.disabled; },
    querySelector() { return this.disabledInput ? {} : null; },
    getBoundingClientRect() { return { left: 10, top: 20, width: 100, height: 40 }; }
  };
  const context = {
    document,
    window: { matchMedia: () => ({ matches: reducedMotion }), getComputedStyle: () => ({ borderRadius: '8px' }) },
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {},
    Date
  };
  vm.runInNewContext(source, context);
  const target = { closest: () => surface };
  return { handlers, layers, timers, surface, target };
}

test('pointer ripple starts at contact and covers the farthest corner', () => {
  const app = fixture();
  app.handlers.pointerdown({ isPrimary: true, pointerType: 'mouse', button: 0, target: app.target, clientX: 30, clientY: 30 });
  assert.equal(app.layers.length, 1);
  const layer = app.layers[0];
  const circle = layer.children[0];
  assert.equal(layer.style.left, '10px');
  assert.equal(layer.style.borderRadius, '8px');
  assert.equal(circle.style.width, `${2 * Math.hypot(80, 30)}px`);
  assert.equal(circle.style.left, `${20 - Math.hypot(80, 30)}px`);
  app.timers[0]();
  assert.equal(layer.removed, true);
});

test('keyboard activation uses the center and pointer clicks do not duplicate the ripple', () => {
  const app = fixture();
  app.handlers.click({ detail: 0, target: app.target });
  assert.equal(app.layers[0].children[0].style.left, `${50 - Math.hypot(50, 20)}px`);
  app.handlers.pointerdown({ isPrimary: true, pointerType: 'touch', button: 0, target: app.target, clientX: 20, clientY: 30 });
  app.handlers.click({ detail: 0, target: app.target });
  assert.equal(app.layers.length, 2);
});

test('disabled controls and reduced-motion preference suppress the ripple', () => {
  const disabled = fixture();
  disabled.surface.disabledInput = true;
  disabled.handlers.pointerdown({ isPrimary: true, pointerType: 'mouse', button: 0, target: disabled.target, clientX: 20, clientY: 30 });
  assert.equal(disabled.layers.length, 0);
  const reduced = fixture(true);
  reduced.handlers.click({ detail: 0, target: reduced.target });
  assert.equal(reduced.layers.length, 0);
});

test('closing a popup removes active ripples immediately', () => {
  const app = fixture();
  app.handlers.pointerdown({ isPrimary: true, pointerType: 'mouse', button: 0, target: app.target, clientX: 20, clientY: 30 });
  app.handlers['app:popup-close']();
  assert.equal(app.layers[0].removed, true);
});
