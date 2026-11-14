// Registra en estado.json cómo ha ido la última actualización de cada tienda.
// La app puede leer estado.json para mostrar un aviso ("precios de X sin actualizar desde ...").
//
// Entrada: variables R_<TIENDA> = resultado del paso del workflow ("success" | "failure" | ...)
//          y logs/<tienda>.log con la salida del scraper (para sacar el motivo del fallo).
// Salida:  estado.json, logs/resumen.md (cuerpo del aviso) y, en GitHub Actions, la salida "fallos".
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";

const TIENDAS = ["mercadona", "consum", "alcampo"];
const ahora = new Date().toISOString();

async function leer(ruta, defecto) {
  try { return await readFile(ruta, "utf8"); } catch { return defecto; }
}

function motivo(log) {
  const lineas = log.split("\n").map((l) => l.trim()).filter(Boolean);
  const clave = lineas.find((l) => /^(Error|Solo|HTTP)|bloqueado|No se encuentra/i.test(l));
  return (clave || lineas.at(-1) || "sin detalles").replace(/^Error:\s*/, "").slice(0, 300);
}

const previo = JSON.parse(await leer("estado.json", "{}"));
const tiendas = {};
const fallos = [];

for (const t of TIENDAS) {
  const ok = process.env[`R_${t.toUpperCase()}`] === "success";
  const antes = previo.tiendas?.[t] || {};
  if (ok) {
    tiendas[t] = { ok: true, ultimo_ok: ahora };
  } else {
    const error = motivo(await leer(`logs/${t}.log`, ""));
    tiendas[t] = { ok: false, ultimo_ok: antes.ultimo_ok || null, ultimo_intento: ahora, error };
    fallos.push(t);
  }
}

await writeFile("estado.json", JSON.stringify({ v: 1, actualizado: ahora, tiendas }, null, 2) + "\n");

await mkdir("logs", { recursive: true });
const md = fallos
  .map((t) => `- **${t}**: ${tiendas[t].error}\n  - Últimos precios buenos: ${tiendas[t].ultimo_ok || "nunca"}`)
  .join("\n");
await writeFile("logs/resumen.md", md + "\n");

if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `fallos=${fallos.join(",")}\n`);
console.log(fallos.length ? `Sin actualizar: ${fallos.join(", ")}` : "Todas las tiendas actualizadas");
