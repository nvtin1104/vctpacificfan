// Mega menu (hover + click + keyboard) and mobile drawer for the sticky header.

const triggers = [...document.querySelectorAll<HTMLButtonElement>('[data-mega-trigger]')];
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
let closeTimer: number | undefined;

const panelOf = (btn: HTMLButtonElement) => document.getElementById(btn.getAttribute('aria-controls') ?? '');

function setOpen(btn: HTMLButtonElement, open: boolean) {
  btn.setAttribute('aria-expanded', String(open));
  panelOf(btn)?.toggleAttribute('hidden', !open);
}

function closeAll(except?: HTMLButtonElement) {
  for (const btn of triggers) if (btn !== except) setOpen(btn, false);
}

for (const btn of triggers) {
  const panel = panelOf(btn);
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    closeAll(btn);
    setOpen(btn, open);
  });
  const wrapper = btn.closest('[data-mega]');
  wrapper?.addEventListener('pointerenter', () => {
    if (!finePointer.matches) return;
    window.clearTimeout(closeTimer);
    closeAll(btn);
    setOpen(btn, true);
  });
  wrapper?.addEventListener('pointerleave', () => {
    if (!finePointer.matches) return;
    closeTimer = window.setTimeout(() => setOpen(btn, false), 160);
  });
  panel?.addEventListener('focusout', event => {
    if (!wrapper?.contains(event.relatedTarget as Node)) setOpen(btn, false);
  });
}

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const open = triggers.find(btn => btn.getAttribute('aria-expanded') === 'true');
  if (open) {
    setOpen(open, false);
    open.focus();
  }
  if (drawer && !drawer.hidden) toggleDrawer(false);
});

document.addEventListener('click', event => {
  if (!(event.target as Element).closest('[data-mega]')) closeAll();
});

// Mobile drawer
const drawer = document.getElementById('mobile-drawer');
const drawerBtn = document.querySelector<HTMLButtonElement>('[data-drawer-toggle]');

function toggleDrawer(open: boolean) {
  if (!drawer || !drawerBtn) return;
  drawer.hidden = !open;
  drawerBtn.setAttribute('aria-expanded', String(open));
  document.documentElement.classList.toggle('overflow-hidden', open);
  if (open) drawer.querySelector<HTMLElement>('a, button')?.focus();
  else drawerBtn.focus();
}

drawerBtn?.addEventListener('click', () => toggleDrawer(drawer?.hidden ?? true));
for (const el of document.querySelectorAll('[data-drawer-close]')) el.addEventListener('click', () => toggleDrawer(false));

export {};
