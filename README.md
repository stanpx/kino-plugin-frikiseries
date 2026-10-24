# Kino Plugin: Frikiseries

Plugin para [Kino](https://kinotvapp.github.io/kino-plugins/) que permite acceder al catálogo de series retro, anime clásico de los 80 y 90, dibujos animados y películas de [Frikiseries](https://www.frikiserie.com).

## Características

- **Catálogo Home temático**: filas organizadas por categorías (*Nuevos*, *Clásicos 80s*, *Anime*, *Transformers*, *Para volver a ver*, etc.).
- **Búsqueda integrada**: encuentra tanto películas como series animadas en toda la base de datos.
- **Series retro en maratón**: para series alojadas en archivos completos de larga duración, Kino genera un episodio único llamado *"Maratón completo"*, guardando el punto de reproducción y permitiendo retomarlo directamente desde *"Continuar viendo"*.
- **Películas clásicas**: reproducción directa en formato de película (`movie`).
- **Extractor OKRU nativo**: parseo directo de opciones del reproductor (`data-options`) para obtener streams MP4 en máxima calidad (`hd`, `sd`, `full`, etc.) con calidades alternativas en el menú de servidores de Kino.
- **Plugin firmado**: validado y firmado oficialmente por su autor (`stanpx`) con apiVersion 5.

## Instalación en Kino

1. Abre **Kino** en tu dispositivo (Android TV, Chromecast con Google TV o móvil).
2. Ve a **Ajustes** ▸ **Plugins**.
3. Selecciona **Agregar plugin**.
4. Escribe o pega la dirección del repositorio:
   ```text
   stanpx/kino-plugin-frikiseries
   ```
5. Acepta los permisos solicitados e instálalo.

## Desarrollo y Pruebas

Para validar el plugin localmente con el SDK oficial de Kino:

```bash
# Validar contrato y manifiesto
node sdk/validate.mjs . --repo stanpx/kino-plugin-frikiseries

# Ejecutar pruebas unitarias
node --test test/plugin.test.mjs

# Probar funciones interactivas
node sdk/run.mjs . home
node sdk/run.mjs . search "zodiaco"
```

## Advertencias técnicas y legales

- Este plugin es únicamente un conector/indexador que consulta información pública en la web de Frikiseries. No aloja, almacena ni redistribuye ningún archivo multimedia.
- Los videos provienen de plataformas externas (como OK.ru). La disponibilidad y velocidad de los streams depende de los servidores de origen.
