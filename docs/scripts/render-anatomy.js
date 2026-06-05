#!/usr/bin/env node
/*
 * render-anatomy.js — rasterize the inline SVG diagrams in
 * docs/clinical-anatomy.html to PNGs, so layout/clipping bugs can be caught
 * without a browser (handy in headless / CI environments).
 *
 * Why this exists: clinical-anatomy.html is hand-authored inline SVG. Bugs
 * like text running past the viewBox edge get clipped by the browser and are
 * invisible in source review — this renders each <svg> so you can eyeball them.
 *
 * Usage:
 *   npm i --no-save @resvg/resvg-js     # one-time, ~self-contained Rust binary
 *   node docs/scripts/render-anatomy.js # writes PNGs to docs/scripts/_render-out/
 *
 * NOTE: resvg does NOT resolve CSS custom properties (var(--x)) or apply the
 * document's external stylesheet. This script inlines both: it substitutes the
 * 9-service color vars with their hex values and injects the text-label CSS
 * into each extracted SVG before rendering. Keep COLORS / CSS in sync with the
 * :root and .lbl rules in clinical-anatomy.html if those ever change.
 *
 * resvg also approximates fonts, so text widths differ slightly from Chrome —
 * good enough to catch clipping/overflow, not pixel-exact.
 */
const fs = require('fs');
const path = require('path');

let Resvg;
try {
  ({ Resvg } = require('@resvg/resvg-js'));
} catch (e) {
  console.error('Missing dependency. Run:  npm i --no-save @resvg/resvg-js');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = path.join(ROOT, 'docs', 'clinical-anatomy.html');
const OUT = path.join(__dirname, '_render-out');

// 9-service color system — must match :root in clinical-anatomy.html
const COLORS = {
  '--navy': '#1e3a5f', '--ink': '#1f2937', '--muted': '#6b7280', '--line': '#e5e7eb',
  '--bg': '#f9fafb', '--optical': '#2563eb', '--sensor': '#7c3aed', '--transport': '#4338ca',
  '--coordination': '#0d9488', '--surface': '#0891b2', '--pressure': '#ea580c',
  '--vascular': '#dc2626', '--immune': '#16a34a', '--autonomic': '#ca8a04',
};
const resolveVars = (s) => s.replace(/var\((--[a-z]+)\)/g, (m, n) => COLORS[n] || m);

// text-label CSS used inside the SVGs (resvg won't read the page stylesheet)
const CSS = `
text{font-family:Arial,Helvetica,sans-serif}
.lbl{font-size:12px;fill:#1f2937}
.lbl.vn{fill:#6b7280;font-size:10.5px}
.lbl.key{font-weight:700}
`;

const html = fs.readFileSync(HTML, 'utf8');
const svgs = html.match(/<svg[\s\S]*?<\/svg>/g) || [];
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
console.log(`found ${svgs.length} svgs in ${path.relative(ROOT, HTML)}`);

svgs.forEach((svg, i) => {
  let s = resolveVars(svg);
  if (!/xmlns=/.test(s)) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  // inject stylesheet + white background as the first children
  s = s.replace(/<svg([^>]*)>/, (m, attrs) =>
    `<svg${attrs}><style>${CSS}</style><rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>`);
  const r = new Resvg(s, {
    background: '#ffffff',
    fitTo: { mode: 'width', value: 1100 },
    font: { loadSystemFonts: true },
  });
  const out = path.join(OUT, `diagram-${i + 1}.png`);
  fs.writeFileSync(out, r.render().asPng());
  console.log('wrote', path.relative(ROOT, out));
});
