# Fase 1: seguimiento y desarrollo

Disponible en **Seguimiento**, con tres vistas: Evolución, Plan de minutos y Talento bloqueado. No modifica Football Manager ni genera mediciones para las que falten datos.

## Registrar cortes

1. Abre **Centro de datos** e importa un CSV. Usa el mismo nombre de partida y Unique ID para actualizar al mismo futbolista. Las fichas sin ID conservan el comportamiento conservador del importador; vincula su ID cuando corresponda.
2. Mantén activada **Registrar un corte en el histórico**.
3. Indica la **fecha de la partida**, temporada, competición o alcance de las estadísticas y las fechas inicial y final del acumulado. Por ejemplo: partida 01/10/2026, temporada 2026/27, Liga, acumulado 01/07/2026–01/10/2026.
4. Comprueba las filas y aplica la importación. Se crea un corte y se actualizan las fichas en una sola operación.

El corte conserva CA, PA, edad, posición, atributos numéricos presentes, minutos y calificación disponibles en las filas aceptadas. No copia al histórico atributos omitidos que sí puedan seguir guardados en la ficha actual. No crea observaciones de futbolistas ausentes del CSV. Un dato vacío o inválido queda ausente, nunca como cero. **Minutos = 0** sí es una observación válida.

Los cortes duplicados de la misma partida, fecha, temporada, alcance y periodo se rechazan antes de modificar la plantilla. No se registran cortes anteriores al último de la misma partida, para evitar retroceder las fichas actuales; una rama distinta de la partida debe tener otro nombre de origen. La opción de importar sin histórico permanece disponible y actualiza las fichas de forma ordinaria.

## Evolución

Selecciona partida y jugador, y compara dos fechas distintas. Se muestran una curva de CA, cambios de CA/PA y deltas de atributos observados en ambos cortes. Los atributos nuevos o ausentes se señalan como sin par comparable.

Los minutos adicionales se calculan restando acumulados exclusivamente con la misma temporada, competición e inicio del periodo, y una fecha estadística final posterior. Una caída del acumulado se señala para revisión. Los cortes no se suman. Los futbolistas eliminados de la plantilla pueden seguir consultándose como archivados en el histórico.

## Plan de minutos

Crea un objetivo con jugador, temporada, alcance, fecha inicial, fecha final, minutos objetivo, papel previsto y notas. Se puede editar. Los planes del mismo jugador y contexto no pueden solaparse.

Para medir el plan, importa minutos acumulados **desde su fecha inicial**, con el mismo nombre de partida, temporada y alcance. Se selecciona el corte más avanzado dentro del periodo y se usa su acumulado, sin sumar cortes. Un corte posterior con el jugador presente pero sin minutos deja su medición pendiente, en lugar de arrastrar el valor antiguo. Se muestra siempre la fecha estadística de la medición usada.

El ritmo orientativo distribuye el objetivo linealmente por días entre inicio y final, sin usar la fecha del ordenador ni asumir un calendario de partidos. Una participación inferior al 80% del ritmo esperado se marca por debajo del ritmo. Al final del periodo se distingue objetivo alcanzado y cerrado por debajo. Un corte posterior al final no se utiliza para atribuir minutos a un periodo ya cerrado.

## Talento bloqueado

Selecciona un corte y revisa los candidatos actuales presentes en él. Los criterios iniciales, ajustables en la interfaz, son:

- Edad máxima: 23 años según el corte.
- Margen mínimo PA − CA: 15 puntos.
- Participación baja sin un plan aplicable: menos de 450 minutos en el periodo.
- Periodo mínimo: 30 días observados.
- Competencia suficiente para señalar posible bloqueo: al menos dos compañeros del mismo grupo de posición y con CA superior en ese mismo corte.

Con un plan aplicable se usa su cumplimiento en lugar del umbral absoluto de minutos. Si ese plan no puede medirse con el corte seleccionado, el análisis queda pendiente. Un periodo corto o los minutos ausentes también quedan pendientes. La participación baja con menos competidores se clasifica para revisión; con competencia suficiente se señala posible bloqueo. Se muestran motivos, competidores y vínculos al plan individual y al análisis por rol.

Son criterios de planificación propios, no reglas oficiales del juego ni predicciones de desarrollo o éxito de una cesión. Un corte parcial puede omitir competidores. El PA es un techo y el CA no determina por sí solo el orden táctico.

## Guardado y compatibilidad

El esquema pasa a **versión 2**, con `tracking.snapshots` y `tracking.minutePlans`. La clave local existente se conserva. Las copias y guardados de versión 1 se migran en memoria, preservando jugadores, notas, etapa e identidad FM y creando un seguimiento vacío. No se asignan fechas históricas a los datos anteriores. La versión 2 se guarda con la siguiente modificación autorizada dentro de la aplicación.

La copia JSON incluye histórico y planes; el CSV de consulta de plantilla sigue mostrando las fichas actuales. Las restauraciones aceptan copias de hasta 50 MB, con validación del esquema, fechas, identidad, atributos y planes. Límites: 2.000 cortes y 10.000 planes. Si se agota localStorage, la aplicación mantiene el estado en memoria y solicita exportar JSON; no recorta el histórico automáticamente.

## Verificación y fixtures

Las pruebas cubren migración, periodos, fechas inválidas, datos parciales, deduplicación, identidad, minutos acumulados, solapes de planes, alertas, copias y jugadores archivados. Dos regresiones que dependían de CSV antiguos ausentes del directorio de datos usan ahora un fixture legado estable y un subconjunto de la exportación real conservada; no se recrearon archivos personales retirados.

Para una prueba manual aislada, `tests/fixtures/tracking-preview.json` contiene cuatro jugadores ficticios y dos cortes de agosto y septiembre de 2026. `tracking-cut-3.csv` permite registrar un tercer corte el 01/10/2026 con temporada 2026/27, Liga y acumulado desde 01/07/2026. Restaura el fixture únicamente en un origen de prueba: la restauración sustituye el registro de ese origen.
