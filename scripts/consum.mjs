// Descarga el catálogo de Consum (precio, formato y foto) y lo guarda en consum.json.
// Si algo sale mal NO toca el archivo anterior: el proceso termina con error y se conserva el último bueno.
import { writeFile } from "node:fs/promises";

const BASE = process.env.CONSUM_BASE || "https://tienda.consum.es";
const PAGINA = 100;
const MIN_PRODUCTOS = 3000; // por debajo se considera un fallo y no se publica
const HEADERS = {
  "User-Agent": "cesta-precios (uso personal, 1 consulta semanal)",
  "Accept": "application/json",
  "Accept-Language": "es-ES,es;q=0.9",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(offset, intentos = 4) {
  const url = `${BASE}/api/rest/V1.0/catalog/product?limit=${PAGINA}&offset=${offset}&orderById=5&showRecommendations=false&showProducts=true&widgets=null`;
  let ultimo;
  for (let i = 1; i <= intentos; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status} (offset ${offset})`);
      return await res.json();
    } catch (e) {
      ultimo = e;
      await sleep(1500 * i);
    }
  }
  throw ultimo;
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();

function precioActual(prices) {
  const lista = Array.isArray(prices) ? prices : [];
  const oferta = lista.find((p) => p.id === "OFFER_PRICE");
  const normal = lista.find((p) => p.id === "PRICE");
  const v = Number((oferta || normal)?.value?.centAmount); // "centAmount" ya viene en euros
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
}

const productos = new Map();
let total = Infinity;
for (let offset = 0; offset < total; offset += PAGINA) {
  const d = await getJson(offset);
  total = Number(d.totalCount) || 0;
  for (const p of d.products || []) {
    const pd = p.productData || {};
    const code = String(p.code || "");
    const precio = precioActual(p.priceData?.prices);
    if (!/^\d{3,12}$/.test(code) || !pd.name || precio === null) continue;
    const marca = pd.brand?.name ? cap(String(pd.brand.name)) : "";
    const nombre = marca && !String(pd.name).toLowerCase().includes(marca.toLowerCase()) ? `${pd.name} ${marca}` : String(pd.name);
    const desc = String(pd.description || "");
    const formato = desc.toLowerCase().startsWith(String(pd.name).toLowerCase()) ? desc.slice(String(pd.name).length).trim() : "";
    productos.set(code, [code, nombre.slice(0, 90), precio, formato.slice(0, 40), code]);
  }
  if (!d.hasMore) break;
  await sleep(300);
}

if (productos.size < MIN_PRODUCTOS) {
  console.error(`Solo ${productos.size} productos (mínimo ${MIN_PRODUCTOS}): no se publica nada.`);
  process.exit(1);
}

const salida = { v: 1, tienda: "consum", actualizado: new Date().toISOString(), p: [...productos.values()] };
await writeFile("consum.json", JSON.stringify(salida));
console.log(`OK: ${productos.size} productos de ${total}`);
