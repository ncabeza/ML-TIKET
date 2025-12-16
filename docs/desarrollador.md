# Guía de desarrollo y conexión

Esta guía explica cómo levantar cada pieza del proyecto, validar el código localmente y entender rápidamente el rol de cada carpeta.

## Visión general rápida
- La arquitectura completa se resume en el README raíz: React en el front, funciones serverless para orquestación, un worker de ML y un worker de Python dedicado al parseo de Excel.【F:README.md†L1-L55】
- El flujo de importación tiene dos fases: **preview** (solo lectura, se calculan sugerencias) y **run** (crea tickets después de que el usuario confirma la plantilla/version).【F:apps/api/src/importRoutes.ts†L35-L76】【F:apps/worker/src/pipeline.ts†L16-L82】

## Requisitos previos
- Node.js 18+ con npm (el repo usa workspaces y TypeScript).
- Python 3.10+ para el worker de Excel.
- `make` no es necesario; todo se ejecuta con npm o comandos directos.

### Checklist paso a paso (Debian/Ubuntu)
1. Instala dependencias base:
   ```bash
   sudo apt-get update
   sudo apt-get install -y python3.10 python3.10-venv python3-pip
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
2. Descarga paquetes del monorepo y valida tipos:
   ```bash
   npm install
   npm run typecheck
   ```
3. Prepara el entorno virtual para el worker de Python y levanta FastAPI:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r apps/python-worker/requirements.txt
   uvicorn apps.python-worker.main:app --reload
   ```
4. Prueba el endpoint `/preview` con un Excel incluido en `excels/` y verifica que devuelve JSON estructurado:
   ```bash
   curl -F "file=@excels/NOMINAS CIBERNOS - The Tiket.xlsx" http://localhost:8000/preview
   ```
5. (Opcional) Ejecuta `python apps/python-worker/preview_excels.py` para recorrer varios Excels sin necesidad del servidor.

### Pruebas rápidas
- `npm run typecheck`: valida que los paquetes de Node compilan sin emitir archivos (usa `tsc --noEmit`).
- `npm test`: ejecuta Vitest a través de `scripts/test.js`, que propaga los argumentos estándar y muestra una nota si pasas `--runInBand` porque Vitest ya corre en modo multihilo.
- `curl -F "file=@excels/NOMINAS CIBERNOS - The Tiket.xlsx" http://localhost:8000/preview`: asegura que el worker de FastAPI responde antes de probar el orquestador.

## Instalación base (Node/TypeScript)
1. Instala dependencias de la raíz (incluye workspaces):
   ```bash
   npm install
   ```
2. Valida que los tipos compilén sin emitir archivos:
   ```bash
   npm run typecheck
   ```
   Esto ejecuta `tsc --noEmit` sobre los paquetes compartidos y los apps de orquestación.【F:package.json†L6-L15】

## Entender los módulos clave
- **apps/api**: Handlers tipo Vercel para crear jobs, disparar el preview (solo lectura) y ejecutar la corrida final después de confirmar plantilla y versión.【F:apps/api/src/importRoutes.ts†L13-L76】
- **apps/worker**: Pipeline ML asistido que arma el árbol estructural del Excel, comprime formatos, clasifica columnas, detecta faltantes, sugiere plantillas y recomienda asignaciones de técnicos.【F:apps/worker/src/pipeline.ts†L16-L82】
- **apps/python-worker**: Servicio FastAPI para parsear/normalizar Excels; evita manipular binarios pesados en las funciones serverless.【F:apps/python-worker/README.md†L1-L52】
- **excels/**: Carpeta con ejemplos que puedes usar para probar el parser sin depender del front.【F:apps/python-worker/README.md†L33-L45】

## Levantar el worker de Python (FastAPI)
1. Crea y activa un entorno virtual:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```
2. Instala dependencias específicas del worker:
   ```bash
   pip install -r apps/python-worker/requirements.txt
   ```
3. Arranca el servidor en modo autoreload:
   ```bash
   uvicorn apps.python-worker.main:app --reload
   ```
   El endpoint `/health` debe responder y `/preview` acepta un Excel via `multipart/form-data`. Usa cURL para validar rápidamente:
   ```bash
   curl -F "file=@/ruta/a/archivo.xlsx" http://localhost:8000/preview
   ```
   Los argumentos `sheet` (query string) permiten limitar la hoja a procesar, tanto en `/preview` como en `/normalize`.【F:apps/python-worker/README.md†L8-L18】【F:apps/python-worker/README.md†L20-L45】

## Probar el parser sin servidor
Si no quieres levantar FastAPI, ejecuta el script de utilería que recorre los Excels de ejemplo y muestra un resumen en consola:
```bash
python apps/python-worker/preview_excels.py
```
Puedes pasar rutas adicionales (archivos o carpetas) para procesar tus propios insumos:
```bash
python apps/python-worker/preview_excels.py excels/otra-carpeta /tmp/custom.xlsx
```
【F:apps/python-worker/README.md†L33-L45】

## Flujo de punta a punta (resumen)
1. **POST /api/import/jobs** crea el job y almacena el Excel en el storage externo (la ruta `storageKey` se propaga en el job).【F:apps/api/src/importRoutes.ts†L13-L27】
2. **POST /api/import/jobs/:id/preview** envía el job al worker para parseo, estructura y sugerencias de plantilla/tecnicos; guarda insights y artefactos sin mutar datos productivos.【F:apps/api/src/importRoutes.ts†L29-L37】【F:apps/worker/src/pipeline.ts†L16-L60】
3. El usuario revisa el preview, confirma plantilla y versión; la API registra la decisión para habilitar la corrida.【F:apps/api/src/importRoutes.ts†L39-L47】
4. **POST /api/import/jobs/:id/run** valida reglas duras, genera un Excel de errores si aplica y crea los tickets en batch.【F:apps/api/src/importRoutes.ts†L49-L76】【F:apps/worker/src/pipeline.ts†L63-L82】

## Buenas prácticas del proyecto
- Mantén el parseo pesado en el worker de Python; usa el worker de Node solo para inferencia ML y orquestación.【F:apps/python-worker/README.md†L47-L52】
- No se crean plantillas ni tickets automáticamente sin confirmación explícita; cualquier ambigüedad bloquea la ejecución.【F:README.md†L20-L38】【F:apps/worker/src/pipeline.ts†L63-L82】
- Versiona las plantillas y guarda siempre los artefactos de preview para trazabilidad (IDs de artefacto se asocian al job).【F:apps/worker/src/pipeline.ts†L21-L60】
