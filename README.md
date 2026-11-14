# cesta-precios

Catálogos de precios de supermercados para la lista de la compra. Los JSON se regeneran solos cada lunes.

| Tienda | Fichero | Script |
|---|---|---|
| Mercadona | `mercadona.json` | `scripts/mercadona.mjs` |
| Consum | `consum.json` | `scripts/consum.mjs` |
| Alcampo | `alcampo.json` | **fijo**, sin script (ver abajo) |

## Formato

Cada JSON: `{ "v": 1, "tienda", "actualizado", "p": [[id, nombre, precio, formato, imagen], ...] }`.

## Actualización y avisos

- Workflow: `.github/workflows/actualizar.yml` (lunes 04:17 UTC, a mano con *Run workflow*, o al cambiar `scripts/`).
- Cada scraper, si algo va mal, **no toca su JSON** (se conserva el último bueno) y termina con error.
- `estado.json` guarda por tienda si la última ejecución fue bien (`ok`), cuándo fue la última buena (`ultimo_ok`) y el motivo del fallo (`error`). La app puede leerlo para mostrar un aviso.
- Si alguna tienda falla se abre/actualiza el issue **⚠️ Precios sin actualizar** (te llega por correo) y la ejecución queda en rojo. El issue se cierra solo cuando todas vuelven a ir bien.

## Desarrollo local

Requiere Node 22+.

```bash
npm run mercadona   # o consum / todo
```

## Notas

- **Alcampo es un catálogo fijo** (precios de referencia del 14/11/2026, ~46.000 productos). Su web bloquea las descargas automáticas (AWS WAF con captcha), así que no se actualiza solo. Para refrescarlo hay que bajarlo a mano desde un navegador y regenerar `alcampo.json`. En el JSON, `"fijo": true` evita el aviso de "precios desactualizados" en la app, y la foto va sin el prefijo común `37ea0506-72ec-4543-93c8-a77bb916ec12/`.
