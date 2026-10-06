// Keep the ripple outside the control so routine rerenders do not interrupt it.
const rippleMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const activeRipples = new Map();
const rippleSelector = 'button, .routing-method, .community-toggle, .switch, .checkbox';
const lastPointerPress = new WeakMap();

function showRipple(surface, clientX, clientY) {
  if (rippleMotion.matches || surface.matches(':disabled') || surface.querySelector('input:disabled')) return;

  const rect = surface.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
  const radius = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));

  const layer = document.createElement('span');
  layer.className = 'contact-ripple-layer';
  layer.style.left = `${rect.left}px`;
  layer.style.top = `${rect.top}px`;
  layer.style.width = `${rect.width}px`;
  layer.style.height = `${rect.height}px`;
  layer.style.borderRadius = window.getComputedStyle(surface).borderRadius;

  const circle = document.createElement('span');
  circle.className = 'contact-ripple-circle';
  circle.style.width = circle.style.height = `${radius * 2}px`;
  circle.style.left = `${x - radius}px`;
  circle.style.top = `${y - radius}px`;
  layer.appendChild(circle);
  document.body.appendChild(layer);

  const cleanup = () => {
    clearTimeout(timer);
    activeRipples.delete(layer);
    layer.remove();
  };
  const timer = setTimeout(cleanup, 550);
  activeRipples.set(layer, cleanup);
  layer.addEventListener('animationend', cleanup, { once: true });
  if (activeRipples.size > 12) activeRipples.values().next().value();
}

function clearRipples() {
  for (const cleanup of [...activeRipples.values()]) cleanup();
}
document.addEventListener('app:popup-close', clearRipples);

document.addEventListener('pointerdown', event => {
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
  const surface = event.target.closest?.(rippleSelector);
  if (surface) {
    lastPointerPress.set(surface, Date.now());
    showRipple(surface, event.clientX, event.clientY);
  }
}, true);

// Keyboard activation has no pointerdown; start at the control's center.
document.addEventListener('click', event => {
  if (event.detail !== 0) return;
  const surface = event.target.closest?.(rippleSelector);
  if (!surface || Date.now() - (lastPointerPress.get(surface) || 0) < 600) return;
  const rect = surface.getBoundingClientRect();
  showRipple(surface, rect.left + rect.width / 2, rect.top + rect.height / 2);
}, true);
