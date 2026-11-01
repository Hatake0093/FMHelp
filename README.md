# Chippenham Dynasty Manager

Aplicación local en español para el plan maestro deportivo de Chippenham Town. React 19 + TypeScript + Vite. Se creó en la carpeta FM26 tras comprobar que estaba vacía; no se inicializó Git ni se publicó un sitio.

## Iniciar

Requiere Node.js 22.18 o superior (Node 24 recomendado) y npm. Desde esta carpeta:

```powershell
npm install
npm run dev
```

Abre la dirección que muestre Vite, normalmente http://127.0.0.1:5173. Mantén esa terminal abierta. Para detenerla, Ctrl+C.

```powershell
npm test         # Pruebas del modelo, copias y CSV
npm run build    # Comprueba TypeScript y genera dist/
npm run preview  # Sirve la compilación, normalmente en el puerto 4173
```

## Funciones

### Seguimiento y desarrollo · fase 1

En **Seguimiento**: evolución por jugador entre fechas de la partida, curva de CA y cambios de atributos; objetivos individuales de minutos por temporada/competición/periodo; detección explicada de talento bloqueado con criterios ajustables. Los cortes se registran desde la importación CSV, conservando solo los datos observados en ese archivo. Añade la columna **Minutos** para medir objetivos; no se estima a partir de partidos.

El guardado y las copias pasan a versión 2. Los registros de versión 1 se migran conservando la plantilla, sin inventar fechas ni históricos. Detalles, criterios y recorrido de uso en [docs/tracking.md](docs/tracking.md).

### Análisis individual

Disponible en **Análisis deportivo → Por jugador** y en la ficha de cada futbolista. Incluye 16 perfiles propios por rol, exploración de reconversión entre grupos de posición, comparación entre compañeros de la misma partida, fortalezas y valores a revisar, y un inventario de 54 atributos para incorporarlos gradualmente al CSV. El ranking anterior permanece en **Ranking de atributos**.

Los datos ausentes o inválidos se muestran como pendientes. Solo se calcula un índice si está disponible al menos el 80% del peso del perfil y todos sus atributos clave. La comparación emplea los mismos atributos válidos en ambos jugadores. Los pesos son referencias propias y se pueden consultar en la interfaz; no son fórmulas oficiales de FM ni predicciones de adaptación.

Las nuevas columnas se incorporan mediante las actualizaciones por ID FM y partida ya existentes. Las columnas omitidas conservan sus valores anteriores en la ficha; una columna presente con un valor vacío sustituye el dato anterior y queda pendiente. El histórico de Seguimiento registra únicamente lo observado en cada CSV. Requisitos y alcance de los roles en [docs/analysis.md](docs/analysis.md).

Verificación: pruebas del dominio y de importación progresiva, compilación de producción y revisión de navegador con el fixture ficticio `tests/fixtures/analysis-preview.json`. Ese archivo es exclusivamente para pruebas en un origen vacío; restaurarlo sustituye la plantilla del origen usado.

### Gestión de plantilla y datos

- Alta, consulta, edición y eliminación confirmada de jugadores; edad, posición, CA, PA y notas.
- Nueve etapas con la tabla CA original. Umbrales de núcleo: 55, 65, 75, 90, 105, 120, 130, 140 y 150 (referencia: equipos de Champions con ~10 jugadores por encima de 150). Rotación: 15 puntos menos (40 … 135). LAT: dos puntos menos. Los valores son referencias de planificación propias, no datos oficiales del juego.
- Primer equipo propuesto de 20 competitivos y 10 de desarrollo. Los demás registros permanecen en revisión.
- Búsqueda por nombre y filtros por posición y grupo.
- Persistencia en IndexedDB y archivo JSON vinculado opcional, copia/restauración JSON validada y exportación CSV.
- Importación CSV de FM26 con selección de columnas, traducción de posiciones, vista previa y actualización por partida + Unique ID.
- Ficha FM con todas las columnas originales, atributos agrupados y datos de rendimiento y contratos.
- Análisis deportivo inicial: comparación por atributo, filtros por posición/nombre y acceso a fichas.
- Plantilla inicial vacía; se pueden cargar seis jugadores **ficticios** de ejemplo desde la vista vacía.
- Diseño adaptable, formularios etiquetados, diálogos con navegación de teclado y avisos accesibles.

## Reglas de clasificación

1. CA igual o superior al umbral de **rotación** de la posición → candidato competitivo, sin límite de edad. Tiene prioridad sobre desarrollo incluso para jóvenes.
2. CA inferior al umbral de rotación, edad ≤23 y PA igual o superior al CA de núcleo de la próxima etapa → candidato de desarrollo.
3. En la etapa 9 se utiliza la propia etapa 9 como objetivo de PA (150; LAT 148).
   Dentro de los 20 competitivos, los 10 primeros con CA de núcleo son **núcleo**; el resto (hasta 20) es **rotación**, aunque su CA esté por debajo del umbral de núcleo.
4. Los competitivos se ordenan por margen de CA sobre el umbral posicional y PA. Desarrollo: margen de PA sobre el objetivo posicional, CA y menor edad. Empates finales: identificador estable.
5. Se asignan hasta 20 y 10 plazas respectivamente. Excedentes y no elegibles quedan en revisión con motivo. No se trasladan excedentes competitivos a desarrollo ni se eliminan jugadores.

Esto es una **propuesta orientativa**, no una selección táctica ni una obligación de vender a los 24 años. CA/PA son enteros de 1 a 200, PA ≥ CA; la edad registrada es manual (14–60 años) y no avanza automáticamente. No se aplica una regla de edad de fichaje externo: esta base gestiona la plantilla ya registrada.

## Guardado y copias

Los datos se guardan en **IndexedDB** (base `chippenham-dynasty`, almacén `kv`, clave `state`) al modificar la partida. La dirección y el puerto forman parte del origen: `localhost`, `127.0.0.1` y otros puertos tienen guardados independientes. No hay cuenta ni servidor. Borrar datos del navegador elimina ese guardado.

**Archivo vinculado (Chrome, Edge, Opera).** Desde el Centro de datos puedes crear o abrir un archivo JSON que pasa a ser la fuente de verdad: se reescribe tras cada cambio (con una pausa de 0,7 s) y se lee al arrancar. Colócalo en una carpeta sincronizada (OneDrive, Google Drive) para abrir la misma partida desde otro navegador o equipo. El navegador recuerda el archivo en IndexedDB, pero pide confirmar el acceso en cada sesión. Si el archivo cambió fuera y hay cambios sin guardar aquí, la app avisa y pregunta cuál conservar; un archivo inválido nunca sustituye la partida. En Firefox y Safari no está disponible: usa las copias JSON.

Las copias contienen `{ version: 2, stageId, players, fmSaveId?, tracking }`. Cada jugador puede incluir `fm` con su `uniqueId` como texto, nombre de partida, archivo de origen, fecha de importación y todas las columnas originales. La ampliación es opcional y compatible con las copias antiguas sin datos FM. Al restaurar se validan versión, etapa, jugadores, metadata FM, unicidad de IDs locales y de partida + ID de FM. Se muestra un resumen antes de sustituir el guardado. Límite de copia JSON: 50 MB (el límite del CSV sigue siendo 5 MB). Una lectura local inválida bloquea modificaciones para no sobrescribir el guardado; permite importar una copia o empezar de nuevo. Si falla la escritura, los cambios se mantienen en memoria y se avisa para exportarlos.

El CSV exportado es para consulta, no una copia restaurable de toda la partida. Incluye campos deportivos, Unique ID, partida y columnas originales con prefijo `FM ·`. Para conservar exactamente notas, etapa y metadata utiliza JSON. Se neutralizan prefijos de fórmula al exportar textos. La app no conecta ni modifica Football Manager. La tipografía intenta cargar Google Fonts; sin conexión utiliza fuentes del sistema.

## Importar CSV desde FM26

1. Entra en **Centro de datos → Importación desde Football Manager → Elegir CSV de FM26**.
2. Elige el archivo exportado por el complemento. El último ejemplo verificado es `data/moneyball_export_20261101_013742.csv`: 54 jugadores, 54 IDs distintos, 37 columnas y 22 atributos reconocidos. También se admiten los ejemplos anteriores con y sin ID.
3. Escribe la **partida de origen** (por defecto, Chippenham). Mantén el mismo nombre en futuras cargas para actualizar esa partida; los espacios y mayúsculas no cambian la identidad. No se infiere la partida desde el nombre del CSV.
4. Revisa las columnas propuestas: `Unique ID` → identificador, `Jugador` → nombre, `Edad` → edad, `Mejor pos.` → grupo de posición, `CA` → CA y `CP` → PA. Puedes cambiarlas. El ID es opcional; si lo seleccionas, todas las filas deben tener un entero positivo sin notación científica. Se guarda como texto.
5. Las fichas con la misma partida + ID se proponen como **Actualizar**, aunque cambie el nombre. Los IDs distintos pueden compartir nombre. Los IDs repetidos dentro del CSV se bloquean en todas sus filas.
6. Para registros antiguos sin ID, activa **Vincular fichas antiguas sin ID** si el nombre identifica al mismo jugador. Solo se permite cuando el nombre coincide de forma única en el CSV y el guardado. Revisa las vinculaciones antes de aplicar; los casos ambiguos se bloquean. Sin esa elección no se duplican fichas por una coincidencia de nombre.
7. Revisa los grupos posicionales y las filas inválidas, marca la casilla final y pulsa **Aplicar importación (N)**. Se aplican las filas válidas: altas, actualizaciones y vinculaciones. No se eliminan los jugadores ausentes del archivo. Se conserva la etapa y se recalculan los cupos 20 + 10.

Se admiten CSV UTF-8 de hasta 5 MB y 10.000 filas, con hasta 300 columnas, separados por punto y coma, coma o tabulador, con comillas escapadas y campos multilínea. La vista previa distingue nuevos, actualizaciones, vinculaciones, omitidos y errores. Sin ID, se mantiene el comportamiento anterior: las coincidencias de nombre ya registradas se omiten y los nombres repetidos en el CSV se bloquean. La comparación por nombre normaliza Unicode, mayúsculas y espacios repetidos, conservando acentos.

Se prioriza `Mejor pos.` sobre la lista de posiciones. En español: `DF (C)` → DFC; `DF (D/I)` y `CR (D/I)` → LAT; `MC` y `ME (C)` → MC/MCD; `MP (...)` y `ME (D/I)` → MP/EXT; `DL (C)` → DC; `POR` → POR. Las posiciones múltiples no se adivinan. Según la definición del usuario de su exportador, `Posición/rol` corresponde a la posición/rol en entrenamiento actual. Se conserva como texto separado y se muestra en la ficha y el contexto de reconversión; no acredita dominio de la posición ni se utiliza para cambiar automáticamente el grupo del jugador.

En una actualización se conservan el ID local y las notas manuales. Se actualizan nombre, edad, grupo posicional, CA/PA y los datos FM de las columnas presentes. Las columnas omitidas se conservan; una celda exportada vacía o `-` representa un dato no disponible. Los alias conocidos (por ejemplo, Velocidad/Pace) sustituyen al valor anterior de la misma magnitud para no mostrar datos obsoletos. No hay borrado automático de jugadores ni historial de snapshots.

Todas las columnas originales se guardan, incluso las que todavía no tienen un análisis específico. Los atributos reconocidos se interpretan como enteros de 1 a 20; los ausentes o inválidos se muestran como `—`, nunca como cero. Un valor inválido genera un aviso pero conserva su texto original. La calificación con coma decimal, partidos como `10 (1)`, sueldos como `350m € p/m`, fin de contrato y rangos de valor se conservan literalmente. No se calculan importes económicos a partir de abreviaturas ni métricas por 90 sin un módulo específico.

Los CSV de `data/` se conservan intactos y no se incorporan al bundle ni se cargan automáticamente al abrir la web. El usuario elige el archivo local desde la interfaz; no se envía a un servidor. Los valores no se guardan hasta aplicar la vista previa. HTML/Excel y sincronización directa con el juego siguen pendientes.

## Consultar atributos

En **Mi plantilla**, el botón del ojo abre la **Ficha FM**. También puedes acceder desde **Análisis deportivo**: elige un atributo, filtra por grupo o nombre y abre una ficha. La comparación ordena por el valor de ese atributo, con ausentes al final; no genera una nota global, una selección de titulares ni pesos tácticos inventados. Propensión a lesiones se ordena de menor a mayor.

La pestaña **Datos FM** de la ficha agrupa atributos físicos, técnicos, mentales, portería y personalidad/ocultos, y muestra posiciones, datos de rendimiento y contratos. El desplegable **Todas las columnas originales** permite consultar cualquier campo adicional. La comparación por atributo está en **Análisis deportivo → Ranking de atributos**. La vista **Por jugador**, añadida en paralelo, ofrece perfiles orientativos por rol con pesos propios; exige cobertura suficiente y atributos esenciales antes de puntuar. No son fórmulas oficiales del juego. El historial de evolución y la economía calculada siguen pendientes.

## Estructura para ampliar

```text
src/
  domain/                Tipos, etapas, clasificación y catálogo de atributos FM
  services/storage.ts    Repositorio local con esquema versionado
  components/            Formularios, importador, ficha FM y comparación de atributos
  modules/
    import-export/       Copias, CSV, vista previa y actualización por ID
    analysis/            Resumen de plantilla, perfiles por rol y comparativa
    economy/             Contrato tipado para futura economía
  App.tsx                Navegación y vistas en español
  styles.css             Diseño adaptable
tests/                   Casos del modelo, parser e importación real
```

La importación HTML/Excel y el módulo de economía están **planificados**, no implementados. El histórico, los planes de minutos y las alertas de talento bloqueado ya están disponibles en Seguimiento. El análisis por rol y la comparativa ya están disponibles. El lector CSV y su vista previa están en `modules/import-export/fm-csv.ts`; `PlayerImportAdapter` sigue disponible para futuros lectores. El dominio es independiente de React, por lo que puede reutilizarse en una futura API. Antes de cambiar el esquema persistido, añadir migraciones explícitas y subir su versión.

## Verificación de esta base

- `npm test`: 34 pruebas aprobadas en la comprobación conjunta; incluyen los tres CSV reales, actualización por ID, homónimos, vinculación de legado, atributos, actualizaciones parciales, copias compatibles y las pruebas del análisis por roles añadido en paralelo.
- `npm run build`: TypeScript y compilación de producción correctos; salida en `dist/`.
- Navegador de escritorio: alta, persistencia tras recarga, edición, transición de desarrollo a revisión a los 24 años, eliminación confirmada y tabla de nueve etapas. Sin errores de consola durante esa comprobación.
- Importador por ID: 54 vinculaciones de fichas antiguas y segunda importación con 0 nuevos/54 actualizados, verificados en una sesión aislada del puerto principal. Edición de notas, recarga y conservación de identidad/atributos comprobadas. Ficha y comparación de atributos inspeccionadas en el navegador.
- La vista previa en el puerto principal queda pendiente de la confirmación de importación del usuario; no se modifica su registro para hacer pruebas.
- Capturas de la interfaz en `docs/preview.png`, `docs/import-preview.png` y `docs/analysis-preview.png`. Se revisó la vista de importación en el ancho reducido del navegador y se añadieron etiquetas accesibles a los botones de navegación que muestran solo iconos. La captura de análisis corresponde a la sesión de prueba del puerto 4173.

La instalación de dependencias y el servidor local necesitaron ejecutarse fuera del entorno restringido de Codex por sus restricciones de red y sockets. Por petición del usuario, se conserva el servidor que está activo en `http://127.0.0.1:5173/` y se comprobó su respuesta HTTP 200. Si se detiene o reinicias Windows, vuelve a iniciarlo con `npm run dev`. Los archivos `*.local` son registros locales ignorados por Git y no necesariamente pertenecen al proceso activo. La vista previa de pruebas del puerto 4173 es temporal.
