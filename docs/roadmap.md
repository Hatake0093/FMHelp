# Plan del proyecto

## Principios

- Los datos entran por **cortes periódicos** (uno cada pocos meses de juego), no partido a partido. Ninguna función debe exigir más archivos que eso.
- La recomendación de la app queda separada de cualquier operación dentro del juego.
- Sin salidas automáticas por edad ni por una sola puntuación: toda propuesta presenta motivos, información pendiente y condiciones que la cambiarían.
- Todos los pesos e índices son referencias propias, no fórmulas oficiales de FM. Mantener esa advertencia en cualquier función nueva.
- Cuando algo se implemente, pásalo a «Entregado» y descríbelo en el README.

## Entregado

**Fase 1 · Seguimiento y desarrollo**
- 1.1 Evolución entre fechas, plan de minutos y talento bloqueado.
- 1.2 Corregir las fechas de un corte o eliminarlo.

**Fase 2 · Construcción de plantilla**
- 2.1 Parejas y complementariedad, dependencia y sucesión.

**Fase 3 · Gestión de la partida**
- 3.1 Los 20 competitivos se dividen en núcleo (10) y rotación (10), con umbrales por etapa.
- 3.2 Guardado en IndexedDB y archivo JSON vinculado, utilizable desde otro navegador (Chrome, Edge, Opera).
- 3.3 Orden por columnas en las tablas de plantilla y análisis.
- 3.4 Exjugadores: archivar vendidos o libres, restaurar y eliminar.
- 3.5 Plantillas Sub-21 y Sub-18: pestañas en Mi plantilla, un CSV por plantilla (el selector de la importación fija a cuál pertenece) y señales de ascenso por edad límite y potencial. Sub-21 hasta 21 años y Sub-18 de 15 a 18, con cupo orientativo de 25. Subir a un jugador a mano o importar su CSV en la plantilla superior lo asciende. Referencias propias, definidas en `src/domain/squads.ts`.
- 3.6 Página **Táctica**: esquema, instrucciones de equipo con y sin posesión, resultados por periodo (puntos por partido, diferencia de goles, porcentaje de goles de balón parado, xG) y diario de cambios. Datos introducidos a mano; se guardan en `tactics` sin subir la versión de la copia.

**Fase 4 · Completar el análisis**
- 4.2 Rendimiento frente a perfil (Análisis deportivo → Rendimiento vs perfil; `src/modules/analysis/performance.ts`). Compara el percentil del mejor rol del grupo de posición con el percentil de calificación en un corte, usando los atributos de ese mismo corte. Marca por encima, por debajo, acorde y «buen perfil sin jugar»; exige 450 min y 4 jugadores por posición. Umbrales propios, sin calibrar (`DEFAULT_PERFORMANCE_CRITERIA`). Los porteros quedan pendientes hasta 4.1. Pendiente: usarlo en la vista Salidas.

## Pendiente

**Fase 4 · Completar el análisis** *(hallazgos de la revisión del 2026-11-01, pendientes de contrastar con la página de referencia que aún no se ha compartido)*
- 4.1 **Porteros sin evaluar.** El CSV no trae `Uno contra uno`, `Salidas` ni `Saques`, y los dos perfiles de portero los marcan como esenciales (`oneOnOnes`, `rushingOut`), así que siempre salen «Pendiente». Solución: añadir esas columnas al exportador y reimportar. Coste bajo, impacto alto.
- 4.3 **Pierna buena y `Posición/rol`.** Se guardan pero no influyen. Útiles para el lado de laterales y extremos, y para centrales con salida.
- 4.4 **Pesos de rol configurables.** Hoy están fijos en `src/modules/analysis/roles.ts`. Permitir ajustarlos desde la interfaz y guardarlos con la partida.
- 4.5 **Táctica frente a resultados.** La página Táctica ya registra el esquema, las instrucciones, los resultados por periodo y un diario de cambios (ver «Entregado», 3.6). Pendiente: registrar las instrucciones sin posesión y completar «Estrategia previa»; cruzar los periodos con los cortes de Seguimiento (calificación y minutos por jugador); y valorar importar un export de estadísticas de equipo en vez de escribirlas a mano. Las hipótesis a contrastar están en `docs/tactica.md`.

**Fase 5 · Ascenso y mercado**
- 5.1 Preparación para la siguiente etapa.
- 5.2 Búsqueda de fichajes por necesidad. `analyzeSlot` ya detecta puestos en riesgo: convertir ese resultado en un perfil objetivo (rol, edad máxima, atributos mínimos) y filtrar con él un CSV de candidatos.
- 5.3 Ajustar los umbrales de las etapas bajas (hoy 55/40 en sexta división, estimados) con números propios o con datos.

**Fase 6 · Economía e informe de decisión** *(cierre del proyecto)*
- 6.1 Valor deportivo por sueldo. `Sueldo`, `Valor de traspaso` y `Final` son texto (`6.5m € p/m`, `14M € - 16M €`). Un parser de importes permitiría calcular puntos de rol por millón. Hay que conservar el texto original, como hoy.
- 6.2 Propuesta individual de **vender, conservar o ceder**. Se apoya en encaje por rol, cobertura y sucesión, minutos y evolución, margen de desarrollo, contrato y coste.
  - **Primera versión hecha: vista «Salidas»** (`src/modules/analysis/departure.ts`, `DeparturePanel.tsx`). Recomienda a quién sacar con tres señales: excedente de cupo, techo bajo (PA) y falta de puesto en el plan. Solo los jugadores en «revisión» pueden salir como recomendados, y nunca si ocupan un puesto del plan.
  - Pendiente de ampliar: **valor alto y contrato corto** (necesita el parser de importes de 6.1); **ceder** como tercera opción junto a vender y libre (el archivo solo conoce `sold` y `free`); **talento bloqueado** (cruzar con `blockedTalent` para sugerir cesión en lugar de venta a jóvenes sin minutos); **rendimiento** (usar calificación y minutos de 4.2 para no recomendar a quien rinde por encima de su perfil).
  - El umbral de «muy joven» (`YOUNG_PA_AGE = 20`) es una referencia propia, sin calibrar.

**Fase 7 · Laboratorio de análisis con Python** *(condicionada a tener varias temporadas de cortes)*

Ejecutar scripts de Python desde la propia app y ver su salida en la página. Se pospone porque hoy hay una sola fecha de datos y, al entrar los cortes despacio, tardará en haber material suficiente para calibrar umbrales o ajustar curvas.

- 7.1 **Enfoque elegido:** botón «Ejecutar» apoyado en el servidor de desarrollo.
  - `npm run dev` ya escucha solo en `127.0.0.1`; se le añade un endpoint (plugin de Vite) que lanza `python analysis/<script>.py`.
  - La página envía la partida actual por entrada estándar, sin rutas ni archivos. El script responde por salida estándar con un JSON: título, texto, tablas y gráficos.
  - Nueva sección «Laboratorio» que lista los scripts de `analysis/`, los ejecuta y muestra tablas y gráficos con el estilo de la app.
  - Seguridad: el endpoint solo existe en desarrollo, ejecuta únicamente scripts de esa carpeta (lista cerrada, nunca nombres arbitrarios) y con tiempo máximo.
  - Requisitos: entorno virtual con `pandas` y `matplotlib` dentro del proyecto. Primer script de ejemplo: distribución de CA por edad y posición de la plantilla.
  - Alternativas descartadas por ahora: Pyodide (Python en el navegador; funciona en cualquier sitio pero descarga ~10 MB o más) y scripts que escriben archivos que la página lee (más simple, pero hay que ejecutarlos a mano). Los scripts serían los mismos si se cambia de opción.
- 7.2 **Usos previstos:** percentiles de CA por etapa para calibrar los umbrales de núcleo y rotación; curvas de desarrollo por edad y PA a partir de los cortes; validar los pesos de roles con rendimiento real; buscar jugadores con CA/PA alto frente a su valor o sueldo.

## Ampliaciones sin fecha

- Simulador de plantilla.
- Importación desde HTML o Excel.
- Sincronización directa con el juego.

## Ideas pequeñas (sin comprometer)

- Juveniles: ampliar a las vistas de Salidas y Construcción (hoy solo cuentan el primer equipo y, en Análisis, todos los jugadores), con umbrales y cupos de Sub-21 y Sub-18 editables.

- Tras importar un CSV completo, sugerir quitar a quienes ya no aparecen.
- Evitar que un exjugador reaparezca como «nuevo» si un CSV antiguo lo incluye.
- Reducir la duplicación de datos entre la ficha y los cortes para que el JSON pese menos.
- Aviso si llevas días sin copia de seguridad, o copia automática.
- Editar los umbrales de etapa desde la interfaz, en vez de en el código.

## Descartado

- **Rendimiento y disponibilidad partido a partido** (antigua fase 3): exigiría subir un archivo por partido, y el flujo previsto es un corte cada pocos meses de juego. La parte viable, cruzar perfil y calificación por corte, pasó a 4.2.
