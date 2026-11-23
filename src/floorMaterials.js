// The floors a room can have (Menaxho sallën → Dyshemeja), drawn here as repeating SVG tiles so
// nothing is downloaded: oak and walnut planks laid in staggered rows, polished concrete,
// terrazzo. A venue's own floor from a photo replaces these (FloorPlan.jsx).

export const FLOOR_MATERIALS = [
  ["oak", "Lis i çelët"],
  ["walnut", "Arrë"],
  ["concrete", "Beton"],
  ["terrazzo", "Terrazzo"],
];

// The same "random" every time, so a floor never reshuffles between renders.
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const svgUrl = (body, w, h) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`)}")`;

// Planks: rows of boards of uneven length, each a slightly different tone, with a fine grain
// over all of it and darker joints, like a real laid floor seen from above.
function planks(tones, seam, grain, seed) {
  const rand = seeded(seed);
  const W = 640, ROW = 34, ROWS = 8;
  let boards = "";
  for (let r = 0; r < ROWS; r++) {
    let x = -Math.round(rand() * 220);
    while (x < W) {
      const len = 150 + Math.round(rand() * 190);
      const tone = tones[Math.floor(rand() * tones.length)];
      // A board that runs past the edge continues on the other side, so the tile has no seam.
      for (const dx of [0, x + len > W ? -W : 0, x < 0 ? W : 0])
        boards += `<rect x='${x + dx}' y='${r * ROW}' width='${len}' height='${ROW}' fill='${tone}'/><path d='M${x + dx + len - 0.5} ${r * ROW}v${ROW}' stroke='${seam}' stroke-width='1.2'/>`;
      x += len;
    }
    boards += `<path d='M0 ${r * ROW + ROW - 0.5}H${W}' stroke='${seam}' stroke-width='1.4'/>`;
  }
  const filter = `<filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.004 0.32' numOctaves='3' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${grain[0]} 0 0 0 0 ${grain[1]} 0 0 0 0 ${grain[2]} 0 0 0 0.55 -0.12'/></filter>`;
  return svgUrl(`${filter}${boards}<rect width='${W}' height='${ROW * ROWS}' filter='url(#g)'/>`, W, ROW * ROWS);
}

function speckles(base, colors, count, max, seed) {
  const rand = seeded(seed);
  let dots = "";
  for (let i = 0; i < count; i++) {
    const x = Math.round(rand() * 320), y = Math.round(rand() * 320), r = (0.8 + rand() * max).toFixed(1);
    dots += `<ellipse cx='${x}' cy='${y}' rx='${r}' ry='${(r * (0.6 + rand() * 0.5)).toFixed(1)}' transform='rotate(${Math.round(rand() * 180)} ${x} ${y})' fill='${colors[Math.floor(rand() * colors.length)]}'/>`;
  }
  return svgUrl(`<rect width='320' height='320' fill='${base}'/>${dots}`, 320, 320);
}

const concrete = svgUrl(
  "<filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.35 0 0 0 0 0.34 0 0 0 0.22 0'/></filter>" +
    "<filter id='c' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.012' numOctaves='2' seed='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.35 -0.1'/></filter>" +
    "<rect width='400' height='400' fill='#c4c2bd'/><rect width='400' height='400' filter='url(#c)'/><rect width='400' height='400' filter='url(#n)'/>",
  400,
  400,
);

const FLOORS = {
  oak: { image: planks(["#dccaa8", "#d5c19d", "#e0d0b2", "#d0bb95", "#d8c6a3"], "#b39d78", [0.42, 0.3, 0.16], 11), size: "640px 272px" },
  walnut: { image: planks(["#7a5638", "#6f4d31", "#83603f", "#6a4a30", "#77553a"], "#4e3420", [0.18, 0.1, 0.05], 5), size: "640px 272px" },
  concrete: { image: concrete, size: "400px 400px" },
  terrazzo: { image: speckles("#ece7df", ["#b9b2a6", "#8f8a83", "#d7a98c", "#9fb3a8", "#6f6a66", "#cfc6b8"], 260, 3.4, 9), size: "320px 320px" },
};

export const floorLook = (material) => FLOORS[material] || FLOORS.oak;
