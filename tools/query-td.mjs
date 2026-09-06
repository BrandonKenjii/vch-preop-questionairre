// query-td.mjs — inspect specific items in textdump.json
// usage: node query-td.mjs <page> [yMin yMax]  — items on a page within y range
//        node query-td.mjs search <substring>   — items containing substring
import { readFileSync } from "node:fs";
const td = JSON.parse(readFileSync(new URL("./textdump.json", import.meta.url), "utf8"));

const [a, b, c] = process.argv.slice(2);
if (a === "search") {
  for (let p = 0; p < td.perPage.length; p++) {
    for (const it of td.perPage[p].items) {
      if (it.str.includes(b)) {
        console.log(`p${p + 1} "${it.str}" x=${it.x} y=${it.y} x1=${it.x1} w=${it.w} size=${it.size} font=${it.font}`);
      }
    }
  }
} else {
  const p = Number(a) - 1;
  const yMin = Number(b ?? -1e9);
  const yMax = Number(c ?? 1e9);
  const items = td.perPage[p].items
    .filter((it) => it.y >= yMin && it.y <= yMax)
    .sort((x, y) => (Math.abs(y.y - x.y) > 1.5 ? y.y - x.y : x.x - y.x));
  for (const it of items) {
    console.log(`p${p + 1} y=${String(it.y).padStart(6)} x=${String(it.x).padStart(6)} x1=${String(it.x1).padStart(7)} w=${String(it.w).padStart(6)} size=${String(it.size).padStart(4)} | ${it.str}`);
  }
}
