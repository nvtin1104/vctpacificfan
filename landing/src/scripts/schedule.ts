// Client-side filtering for the static schedule. Filters are mirrored into the query string
// (?tournament=…&team=…) and synced with the season strip tabs when on /schedule.

const form = document.querySelector<HTMLFormElement>('[data-schedule-filters]');
const cards = [...document.querySelectorAll<HTMLElement>('[data-match-card]')];
const groups = [...document.querySelectorAll<HTMLElement>('[data-group]')];
const empty = document.querySelector<HTMLElement>('[data-no-results]');
const count = document.querySelector<HTMLElement>('[data-count]');
const strip = document.querySelector<HTMLElement>('[data-season-strip][data-strip-mode="schedule"]');
const stripButtons = strip ? [...strip.querySelectorAll<HTMLButtonElement>('[data-strip-tab]')] : [];
const FIELDS = ['tier', 'tournament', 'team', 'status', 'month'] as const;

function matches(card: HTMLElement, values: Record<string, string>) {
  return FIELDS.every(field => {
    const wanted = values[field];
    if (!wanted) return true;
    if (field === 'team') return (card.dataset.teams ?? '').split(' ').includes(wanted);
    if (field === 'tournament' && wanted === 'offseason') return card.dataset.kind === 'offseason';
    return card.dataset[field] === wanted;
  });
}

function syncStrip(activeTournament: string) {
  for (const btn of stripButtons) {
    btn.setAttribute('aria-pressed', String(btn.dataset.stripTab === activeTournament));
  }
}

function apply() {
  if (!form) return;
  const data = new FormData(form);
  const values = Object.fromEntries(FIELDS.map(f => [f, String(data.get(f) ?? '')]));
  let visible = 0;
  for (const card of cards) {
    const show = matches(card, values);
    card.hidden = !show;
    if (show) visible++;
  }
  for (const group of groups) group.hidden = !group.querySelector('[data-match-card]:not([hidden])');
  if (empty) empty.hidden = visible > 0;
  if (count) count.textContent = (count.dataset.template ?? '{n}').replace('{n}', String(visible));
  syncStrip(values.tournament);

  const url = new URL(location.href);
  for (const f of FIELDS) {
    if (values[f]) url.searchParams.set(f, values[f]);
    else url.searchParams.delete(f);
  }
  history.replaceState(null, '', url);
}

function defaultTournamentId() {
  if (!strip) return '';
  const pick = (selector: string) => strip.querySelector<HTMLButtonElement>(selector)?.dataset.stripTab ?? '';
  return (
    pick('li[data-state="now"] [data-strip-tab][data-has-matches="true"]') ||
    pick('li[data-state="next"] [data-strip-tab][data-has-matches="true"]') ||
    pick('[data-strip-tab][data-has-matches="true"]') ||
    pick('li[data-state="now"] [data-strip-tab]') ||
    pick('li[data-state="next"] [data-strip-tab]')
  );
}

if (form) {
  const params = new URLSearchParams(location.search);
  const hasAnyParam = FIELDS.some(f => params.has(f));
  const tournamentSelect = form.elements.namedItem('tournament') as HTMLSelectElement | null;

  for (const f of FIELDS) {
    const select = form.elements.namedItem(f) as HTMLSelectElement | null;
    const value = params.get(f);
    if (select && value && [...select.options].some(o => o.value === value)) select.value = value;
  }

  // Default to the current or next upcoming tournament when opening /schedule with no filters.
  if (!hasAnyParam && tournamentSelect) {
    const def = defaultTournamentId();
    if (def && [...tournamentSelect.options].some(o => o.value === def)) tournamentSelect.value = def;
  }

  for (const btn of stripButtons) {
    btn.addEventListener('click', () => {
      if (!tournamentSelect) return;
      const target = btn.dataset.stripTab ?? '';
      tournamentSelect.value = tournamentSelect.value === target ? '' : target;
      apply();
    });
  }

  form.addEventListener('change', apply);
  form.addEventListener('reset', () => setTimeout(apply));
  form.addEventListener('submit', event => event.preventDefault());
  apply();
}

export {};
