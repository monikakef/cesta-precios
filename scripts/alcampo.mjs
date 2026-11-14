// Descarga el catálogo de Alcampo (precio, formato y foto) y lo guarda en alcampo.json.
// Si algo sale mal NO toca el archivo anterior: el proceso termina con error y se conserva el último bueno.
//
// Alcampo usa la plataforma Ocado: las categorías salen de /categories y los productos de
// /api/webproductpagews/v6/product-pages (paginado con pageToken).
// OJO: la web está detrás de un AWS WAF que a veces responde con un "challenge" (HTTP 202 +
// cabecera x-amzn-waf-action) a los accesos automáticos. NO se intenta saltarlo: se aborta con un
// mensaje claro y el workflow avisa de que Alcampo no se ha podido actualizar.
import { writeFile } from "node:fs/promises";

const BASE = process.env.ALCAMPO_BASE || "https://www.compraonline.alcampo.es";
const MIN_PRODUCTOS = 3000; // por debajo se considera un fallo y no se publica
const PAGINA = 300;
const OMITIR = new Set(["OCFYP"]); // folletos y promociones: repite productos de otras categorías
const HEADERS = {
  "User-Agent": "cesta-precios (uso personal, 1 consulta semanal)",
  "Accept-Language": "es-ES,es;q=0.9",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Bloqueado extends Error {}

async function pedir(url, accept, intentos = 4) {
  let ultimo;
  for (let i = 1; i <= intentos; i++) {
    try {
      const res = await fetch(url, { headers: { ...HEADERS, Accept: accept } });
      if (res.status === 202 || res.headers.get("x-amzn-waf-action")) {
        throw new Bloqueado("Alcampo ha bloqueado la descarga automática (verificación anti-bots de AWS WAF)");
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url.replace(BASE, "")}`);
      return res;
    } catch (e) {
      if (e instanceof Bloqueado) throw e; // reintentar solo empeoraría el bloqueo
      ultimo = e;
      await sleep(1500 * i);
    }
  }
  throw ultimo;
}

// La lista de categorías viene incrustada en el HTML como window.__INITIAL_STATE__ = {...}
async function categoriasRaiz() {
  const html = await (await pedir(`${BASE}/categories`, "text/html")).text();
  const ini = html.indexOf("window.__INITIAL_STATE__");
  const llave = ini < 0 ? -1 : html.indexOf("{", ini);
  if (llave < 0) throw new Error("No se encuentra window.__INITIAL_STATE__ en /categories (¿cambió la web?)");
  // el JSON termina donde se equilibran las llaves (respetando cadenas)
  let prof = 0, enCadena = false, esc = false, fin = -1;
  for (let i = llave; i < html.length; i++) {
    const c = html[i];
    if (enCadena) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') enCadena = false; continue; }
    if (c === '"') enCadena = true;
    else if (c === "{") prof++;
    else if (c === "}" && --prof === 0) { fin = i + 1; break; }
  }
  const estado = JSON.parse(html.slice(llave, fin));
  const cats = estado?.data?.categories?.categories || {};
  return Object.values(cats)
    .map((c) => c.retailerCategoryId)
    .filter((id) => id && !OMITIR.has(id));
}

const num = (v) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
};

function fila(p) {
  const id = String(p.retailerProductId || p.productId || "");
  const precio = num(p.price?.current?.amount);
  if (!id || !p.name || precio === null || p.available === false) return null;
  const m = String(p.image?.src || "").match(/\/images-v3\/([0-9a-f-]{36}\/[0-9a-f-]{36})\//i);
  return [id, String(p.name).slice(0, 90), Math.round(precio * 100) / 100, String(p.size?.value || "").slice(0, 40), m ? m[1] : ""];
}

const productos = new Map();
const raiz = await categoriasRaiz();
console.log(`Categorías: ${raiz.length}`);

for (const cat of raiz) {
  let token = "";
  do {
    const q = new URLSearchParams({ maxPageSize: PAGINA, maxProductsToDecorate: PAGINA, retailerCategoryId: cat });
    q.append("tag", "web");
    q.append("tag", "category-item");
    if (token) q.set("pageToken", token);
    else q.set("includeAdditionalPageInfo", "true");
    const d = await (await pedir(`${BASE}/api/webproductpagews/v6/product-pages?${q}`, "application/json")).json();
    for (const g of d.productGroups || []) {
      for (const p of g.decoratedProducts || []) {
        const f = fila(p);
        if (f) productos.set(f[0], f);
      }
    }
    token = d.metadata?.nextPageToken || d.nextPageToken || "";
    await sleep(400);
  } while (token);
}

if (productos.size < MIN_PRODUCTOS) {
  console.error(`Solo ${productos.size} productos (mínimo ${MIN_PRODUCTOS}): no se publica nada.`);
  process.exit(1);
}

const salida = { v: 1, tienda: "alcampo", actualizado: new Date().toISOString(), p: [...productos.values()] };
await writeFile("alcampo.json", JSON.stringify(salida));
console.log(`OK: ${productos.size} productos`);
