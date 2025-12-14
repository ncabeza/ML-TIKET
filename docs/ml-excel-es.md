# Guía práctica de ML para interpretar Excel sin perder contexto

Esta guía resume un flujo de trabajo de **Procesamiento Inteligente de Documentos (IDP)** centrado en hojas de cálculo. Está diseñada para convertir Excels heterogéneos en datos estructurados listos para modelos ML sin perder jerarquías, estilos ni semántica visual.

## Ciclo de vida del proyecto

1. **Descubrimiento y auditoría de datos**: inventaria las variantes de formato, detecta hojas anómalas y define casos de uso (imputación, clasificación, validación). Documenta supuestos y restricciones de negocio.
2. **Extracción y normalización**: convierte cada hoja en una representación tabular estable, conservando jerarquías y estilos relevantes.
3. **Ingeniería de características**: transforma la representación tabular en tensores numéricos con escalado y codificación consistente.
4. **Selección y entrenamiento del modelo**: elige arquitectura según objetivo (imputar, clasificar, validar estructura) y entrena con splits reproducibles.
5. **Evaluación**: usa métricas alineadas al negocio; valida tanto valores como estructura inferida.
6. **Despliegue**: empaqueta el modelo (o pipeline) en el worker y expone endpoints o colas bien versionadas.
7. **Monitoreo y mantenimiento**: instrumenta métricas de calidad, deriva re-entrenos y controla el data drift.

### Pipeline de referencia (resumen ejecutable)

1. **Ingesta**: leer con `openpyxl` (conserva estilos) y exportar a un formato intermedio (parquet/JSON) que incluya valores, rangos fusionados, estilos y coordenadas.
2. **Normalización**: aplicar el esquema canónico, propagar fusionadas, aplanar jerarquías y añadir metadatos visuales.
3. **Feature store local**: versionar datasets y features con `dvc` o `lakeFS`; almacenar train/val/test congelados.
4. **Entrenamiento**: usar notebooks/pipelines reproducibles (semillas fijas, configuración en YAML) y registrar artefactos en `mlflow`.
5. **Validación**: ejecutar suites de pruebas sintéticas y de estrés antes de promover un modelo.
6. **Entrega**: empaquetar la cadena completa en una imagen OCI o función serverless, con contratos de entrada/salida claros.

## Extracción inteligente (preservar estructura y semántica)

- **Celdas combinadas**: detecta rangos con `openpyxl` y aplica propagación controlada (`ffill` por filas o columnas según el eje de la jerarquía). Valida siempre la dirección de relleno y registra los rangos fusionados para trazabilidad.
- **Jerarquías y subtablas**: aplanar a "una columna por nivel". Cada fila conserva la ruta completa (nivel_1, nivel_2, …, dato_hoja), lo que permite reconstruir la estructura y entrenar modelos que distingan secciones.
- **Esquema canónico**: construye un diccionario global de encabezados recorriendo todos los archivos. Al normalizar, crea todas las columnas del diccionario y rellena ausentes con `NaN`, evitando lógica ad hoc por archivo.
- **Metadatos visuales**: extrae color, negritas, bordes y formatos numéricos. Úsalos como señales para clasificar tipos de fila (título, subtotal, dato) y para detectar secciones de totales.

#### Ejemplo rápido (Python)

```python
from openpyxl import load_workbook
import pandas as pd

wb = load_workbook("ejemplo.xlsx", data_only=True)
ws = wb.active

# Rangos fusionados
merged_ranges = list(ws.merged_cells.ranges)

records = []
for row in ws.iter_rows():
    for cell in row:
        records.append({
            "row": cell.row,
            "col": cell.column,
            "value": cell.value,
            "bold": cell.font.bold,
            "fill": cell.fill.fgColor.rgb,
            "is_merged": any(cell.coordinate in r for r in merged_ranges),
        })

df = pd.DataFrame(records)
# Propagación de fusionadas por columna
df.sort_values(["col", "row"], inplace=True)
df["value_norm"] = df.groupby("col")["value"].ffill()
```

El dataframe resultante preserva coordenadas, estilos y valores imputados para celdas combinadas, listo para aplicar el esquema canónico y derivar features.

## Imputación de datos faltantes

- **Métodos base**: media/mediana para prototipos rápidos; k-NN o Random Forest para capturar relaciones no lineales con costos moderados.
- **Autoencoders (AE/DAE/VAE)**: entrenan la reconstrucción de la tabla normalizada. Los Denoising AE mejoran la robustez ante ruido; los VAE permiten estimar incertidumbre en la imputación. Mantén una máscara de valores originales para evaluar solo donde había faltantes.
- **Evaluación de imputación**: separa un conjunto con valores ocultos artificialmente y mide MAE/RMSE sobre esas posiciones; monitoriza deriva de imputación en producción con muestras etiquetadas.

## Ingeniería de características

- **Escalado numérico**: aplica Min-Max cuando necesitas acotar el rango (ej. modelos basados en distancia) y Z-Score para estabilidad frente a outliers.
- **Codificación categórica**:
  - One-Hot para cardinalidad baja y máxima interpretabilidad.
  - Ordinal solo si existe orden inherente; evita aplicarlo a nominales.
  - Binary/Hashing para alta cardinalidad con limitación de memoria.
- **Features estructurales**: posiciones (fila/columna absolutas y relativas), profundidad de jerarquía, banderas de estilos (color, bold, borde), y distancias a filas de subtotales. Estas señales ayudan a clasificar secciones y validar plantillas.

#### Plantilla de vector de features

- `row_idx`, `col_idx`, `row_rel`, `col_rel`
- `header_lvl_1..n` (one-hot/embedding de jerarquía)
- `style_bold`, `style_fill_hash`, `style_border`, `num_format_family`
- `section_type` (label para entrenamiento de clasificadores de filas)
- `dist_to_subtotal`, `dist_to_header`
- `sheet_name_hash`, `file_id`

## Selección y entrenamiento del modelo

- **Objetivos comunes**:
  - *Imputación*: Autoencoder o DAE con pérdida en celdas observadas/mask.
  - *Clasificación de documentos/hojas*: Random Forest o modelos neuronales ligeros usando features estructurales y texto de encabezados.
  - *Validación estructural*: modelos de secuencia (BiLSTM/Transformer pequeño) sobre secuencias de filas codificadas con estilos y encabezados.
- **Buenas prácticas**:
  - Split reproducible 80/20 con semillas fijas; añade un fold de validación cuando hagas tuning.
  - Balancea clases (class weights o oversampling) si hay desbalance.
  - Guarda configuraciones y versiones de datos/modelo para reproducibilidad (ej. `mlflow`, `wandb`).
  - Incluye tests unitarios de feature engineering: comprueba que filas fusionadas se expanden, que los encabezados se aplanan y que las columnas canónicas existen.

### Configuraciones recomendadas (puntos de partida)

- **Imputación (DAE)**: capas densas 512→256→128→256→512, activaciones ReLU, pérdida MSE en celdas observadas (más máscara), dropout 0.1.
- **Clasificación de filas**: RandomForest 200 árboles, max_depth=None, max_features="sqrt", o bien BiLSTM pequeño (2 capas, 128 unidades) sobre secuencias de filas ordenadas.
- **Validación estructural**: Transformer ligero (2–4 capas, 4 cabezas) con embeddings de posición (fila/col) y de estilos.

## Evaluación

- **Regresión/Imputación**: RMSE/MAE sobre posiciones con ground truth; reporta intervalo de confianza con bootstrapping.
- **Clasificación**: matriz de confusión, precisión, recall y F1; monitoriza tasas por clase rara. Añade métricas de estructura (porcentaje de filas correctamente tipificadas: título/subtotal/dato).
- **Robustez**: pruebas de estrés con archivos anómalos (encabezados ausentes, hojas con múltiples tablas, combinaciones profundas).

#### Checklist de validación previa a producción

- Replicar métricas en conjuntos fijos (train/val/test) y en un set sintético de corner cases.
- Validar contratipos: hojas con fechas como texto, números con coma decimal, formatos mixtos de moneda.
- Confirmar estabilidad de inferencia (<latencia objetivo) y tamaño del modelo.
- Revisar manualmente muestras mal clasificadas para alimentar un bucle de etiquetado activo.

## Despliegue y monitoreo

- Versiona el pipeline completo (normalización → features → modelo) y congela dependencias.
- Expón inferencia vía API o cola; retorna también artefactos de trazabilidad (rangos fusionados, esquema aplicado, métricas rápidas de calidad).
- Monitorea drift de encabezados, distribución de estilos y tasas de imputación; dispara re-entrenos cuando se superen umbrales definidos.
- Registra ejemplos fallidos y crea un loop de etiquetado activo para mejorar las clases débiles.

### Monitoreo en producción (mínimo viable)

- **Data drift**: KS-test sobre distribuciones de `style_fill_hash`, encabezados y longitudes de hoja.
- **Calidad online**: porcentaje de filas con sección indeterminada, tasa de imputación por columna, número de rangos fusionados no previstos.
- **Alertas**: umbrales por métrica con notificaciones; captura payloads anómalos para re-etiquetado.
