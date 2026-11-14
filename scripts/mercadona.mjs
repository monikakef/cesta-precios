// Descarga el catálogo de Mercadona (precio, formato y foto) y lo guarda en mercadona.json.
// Si algo sale mal NO toca el archivo anterior: el proceso termina con error y se conserva el último bueno.
import { writeFile } from "node:fs/promises";

const WH = process.env.MERCADONA_WH || "vlc1"; // almacén: determina precios y disponibilidad
const BASE = "https://tienda.mercadona.es/api";
const HEADERS = {
  "User-Agent": "cesta-precios (uso personal, 1 consulta semanal)",
  "Accept": "application/json",
  "Accept-Language": "es-ES,es;q=0.9",
};
const MIN_PRODUCTOS = 1500; // por debajo se considera un fallo y no se publica

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(path, intentos = 4) {
  let ultimo;
  for (let i = 1; i <= intentos; i++) {
    try {
      const res = await fetch(`${BASE}${path}${path.includes("?") ? "&" : "?"}lang=es&wh=${WH}`, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${path}`);
      return await res.json();
    } catch (e) {
      ultimo = e;
      await sleep(1500 * i);
    }
  }
  throw ultimo;
}

const num = (v) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
};

function tamano(pi) {
  if (pi.unit_size && pi.size_format) return `${String(pi.unit_size).replace(".", ",")} ${pi.size_format}`;
  return "";
}

const raiz = await getJson("/categories/");
const subs = raiz.results.flatMap((c) => c.categories.map((s) => s.id));
console.log(`Categorías: ${raiz.results.length}, subcategorías: ${subs.length}, almacén: ${WH}`);

const productos = new Map();
for (const id of subs) {
  const cat = await getJson(`/categories/${id}/`);
  for (const grupo of cat.categories || []) {
    for (const p of grupo.products || []) {
      const pi = p.price_instructions || {};
      const precio = num(pi.unit_price);
      const m = String(p.thumbnail || "").match(/\/images\/([0-9a-f]{32}\.(?:jpg|jpeg|png|webp))/i);
      if (!p.id || !p.display_name || precio === null || p.published === false) continue;
      productos.set(String(p.id), [
        String(p.id),
        String(p.display_name).slice(0, 90),
        Math.round(precio * 100) / 100,
        [p.packaging, tamano(pi)].filter(Boolean).join(" · ").slice(0, 40),
        m ? m[1] : "",
      ]);
    }
  }
  await sleep(250);
}

if (productos.size < MIN_PRODUCTOS) {
  console.error(`Solo ${productos.size} productos (mínimo ${MIN_PRODUCTOS}): no se publica nada.`);
  process.exit(1);
}

const salida = { v: 1, tienda: "mercadona", almacen: WH, actualizado: new Date().toISOString(), p: [...productos.values()] };
await writeFile("mercadona.json", JSON.stringify(salida));
console.log(`OK: ${productos.size} productos`);
