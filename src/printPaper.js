// Printing from the browser to a thermal roll. Left to itself Chrome prints on whatever
// page the printer driver reports (often A4, or a short fixed "receipt" size), so a long
// invoice gets cut or split and a narrow roll loses its right edge. Here the page is
// exactly the roll's width and exactly as long as what's printed.
const KEY = "bluebar-paper-width";
export const PAPERS = [80, 88];

// A property of the device's printer, so it's remembered per device. 80 mm is the
// common roll (e.g. ZJ-80 / GEZHI drivers: max page width 80 mm, 70 mm printable) —
// a page wider than the driver's maximum prints nothing at all.
export function paperWidth() {
  try {
    const mm = Number(localStorage.getItem(KEY));
    return PAPERS.includes(mm) ? mm : 80;
  } catch {
    return 80;
  }
}
export function setPaperWidth(mm) {
  try {
    localStorage.setItem(KEY, String(mm));
  } catch {
    // Blocked storage: it just won't be remembered.
  }
}

const PX_PER_MM = 96 / 25.4;
export function printFitted() {
  const paper = paperWidth();
  document.documentElement.style.setProperty("--paper", `${paper}mm`);
  // .print-only is hidden on screen: lay each page out off-screen for a moment to
  // measure it. Station tickets print one per page; the page fits the longest.
  let tallest = 0;
  for (const el of document.querySelectorAll(".print-only")) {
    el.classList.add("print-measure");
    tallest = Math.max(tallest, el.getBoundingClientRect().height);
    el.classList.remove("print-measure");
  }
  const length = Math.max(40, Math.ceil(tallest / PX_PER_MM) + 2);
  let style = document.getElementById("print-page-size");
  if (!style) {
    style = document.createElement("style");
    style.id = "print-page-size";
    document.head.append(style);
  }
  style.textContent = `@page { size: ${paper}mm ${length}mm; margin: 0; }`;
  window.print();
}
