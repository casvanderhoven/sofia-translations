/**
 * Reader interactivity: structure toggle, hover linking across columns, pin on click, tooltip.
 * Delegated listeners; the page is fully readable without this script.
 */
const STORAGE_KEY = "sofia.structure";
const main = document.querySelector("main");
const toggle = document.querySelector<HTMLButtonElement>("#structure-toggle");
const tooltip = document.querySelector<HTMLElement>("#tooltip");

function setStructure(on: boolean) {
  main?.classList.toggle("structure", on);
  toggle?.setAttribute("aria-pressed", String(on));
  if (toggle) toggle.textContent = on ? "Hide structure" : "Show structure";
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {}
}

let initial = false;
try {
  initial = localStorage.getItem(STORAGE_KEY) === "1";
} catch {}
setStructure(initial);
toggle?.addEventListener("click", () => setStructure(!main?.classList.contains("structure")));

let pinnedGroup: string | undefined;
let pinnedSection: Element | undefined;

function groupTokens(section: Element, g: string): HTMLElement[] {
  return Array.from(section.querySelectorAll<HTMLElement>(`[data-g="${CSS.escape(g)}"]`));
}

function clearClass(cls: string, scope: ParentNode = document) {
  for (const el of scope.querySelectorAll(`.${cls}`)) el.classList.remove(cls);
}

function showTooltip(anchor: HTMLElement) {
  if (!tooltip) return;
  const gloss = anchor.dataset.gloss ?? "";
  const note = anchor.dataset.note ?? "";
  if (!gloss && !note) {
    tooltip.hidden = true;
    return;
  }
  tooltip.textContent = "";
  if (gloss) {
    const [lemma, ...rest] = gloss.split(" · ");
    const l = document.createElement("span");
    l.className = rest.length ? "lemma" : "parse";
    l.textContent = lemma ?? "";
    tooltip.append(l);
    if (rest.length) {
      const p = document.createElement("span");
      p.className = "parse";
      p.textContent = rest.join(" · ");
      tooltip.append(p);
    }
  }
  if (note) {
    const n = document.createElement("span");
    n.className = "note";
    n.textContent = note;
    tooltip.append(n);
  }
  tooltip.hidden = false;
  const r = anchor.getBoundingClientRect();
  const top = r.bottom + window.scrollY + 6;
  let left = r.left + window.scrollX;
  const maxLeft = window.scrollX + document.documentElement.clientWidth - tooltip.offsetWidth - 8;
  if (left > maxLeft) left = Math.max(8, maxLeft);
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
}

function hideTooltip() {
  if (tooltip) tooltip.hidden = true;
}

function tokenFrom(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(".tok") : null;
}

document.addEventListener("mouseover", (e) => {
  const tok = tokenFrom(e.target);
  if (!tok) return;
  const section = tok.closest("[data-section]");
  if (!section) return;
  const g = tok.dataset.g;
  if (g) for (const el of groupTokens(section, g)) el.classList.add("hl");
  if (!pinnedGroup) showTooltip(tok);
});

document.addEventListener("mouseout", (e) => {
  const tok = tokenFrom(e.target);
  if (!tok) return;
  const section = tok.closest("[data-section]");
  if (section) clearClass("hl", section);
  if (!pinnedGroup) hideTooltip();
});

document.addEventListener("click", (e) => {
  const tok = tokenFrom(e.target);
  const section = tok?.closest("[data-section]");
  clearClass("pinned");
  if (
    !tok ||
    !section ||
    !tok.dataset.g ||
    (pinnedGroup === tok.dataset.g && pinnedSection === section)
  ) {
    pinnedGroup = undefined;
    pinnedSection = undefined;
    hideTooltip();
    return;
  }
  pinnedGroup = tok.dataset.g;
  pinnedSection = section;
  for (const el of groupTokens(section, pinnedGroup)) el.classList.add("pinned");
  showTooltip(tok);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    clearClass("pinned");
    pinnedGroup = undefined;
    pinnedSection = undefined;
    hideTooltip();
  }
});
