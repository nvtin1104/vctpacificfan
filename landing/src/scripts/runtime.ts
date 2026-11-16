// Site-wide client behaviour: local time formatting, countdowns and the spoiler-free toggle.
// Everything here is progressive enhancement over correct server-rendered HTML.

const lang = document.documentElement.lang || 'en';
const SPOILER_KEY = 'vct:spoilers';

const FORMATS: Record<string, Intl.DateTimeFormatOptions> = {
  datetime: { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' },
  time: { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' },
  date: { weekday: 'short', day: 'numeric', month: 'short' },
};

function formatLocalTimes(root: ParentNode = document) {
  for (const el of root.querySelectorAll<HTMLTimeElement>('time[data-local-time]')) {
    const date = new Date(el.dateTime);
    if (Number.isNaN(date.getTime())) continue;
    el.textContent = new Intl.DateTimeFormat(lang, FORMATS[el.dataset.localTime ?? 'datetime']).format(date);
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  for (const el of root.querySelectorAll<HTMLElement>('[data-timezone]')) el.textContent = el.dataset.template?.replace('{tz}', tz) ?? tz;
}

function tickCountdowns() {
  const now = Date.now();
  for (const el of document.querySelectorAll<HTMLElement>('[data-countdown]')) {
    let diff = Math.max(0, Date.parse(el.dataset.countdown ?? '') - now);
    if (Number.isNaN(diff)) continue;
    const parts: Record<string, number> = {};
    for (const [unit, ms] of [['d', 86_400_000], ['h', 3_600_000], ['m', 60_000], ['s', 1000]] as const) {
      parts[unit] = Math.floor(diff / ms);
      diff -= parts[unit] * ms;
    }
    for (const slot of el.querySelectorAll<HTMLElement>('[data-unit]')) {
      const value = parts[slot.dataset.unit!];
      slot.textContent = slot.dataset.unit === 'd' ? String(value) : String(value).padStart(2, '0');
    }
  }
}

function readSpoilers(): 'hidden' | 'shown' {
  try {
    return localStorage.getItem(SPOILER_KEY) === 'shown' ? 'shown' : 'hidden';
  } catch {
    return 'hidden';
  }
}

function applySpoilers(state: 'hidden' | 'shown') {
  document.documentElement.dataset.spoilers = state;
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-spoiler-toggle]')) {
    btn.setAttribute('aria-pressed', String(state === 'shown'));
    const label = btn.querySelector('[data-spoiler-label]');
    if (label) label.textContent = state === 'shown' ? (btn.dataset.labelHide ?? '') : (btn.dataset.labelShow ?? '');
  }
}

document.addEventListener('click', event => {
  const btn = (event.target as Element | null)?.closest('[data-spoiler-toggle]');
  if (!btn) return;
  const next = document.documentElement.dataset.spoilers === 'shown' ? 'hidden' : 'shown';
  try {
    localStorage.setItem(SPOILER_KEY, next);
  } catch {
    /* storage unavailable: keep the choice for this page view only */
  }
  applySpoilers(next);
});

applySpoilers(readSpoilers());
formatLocalTimes();
tickCountdowns();
if (document.querySelector('[data-countdown]')) setInterval(tickCountdowns, 1000);

export {};
