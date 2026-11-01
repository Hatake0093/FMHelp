# Análisis deportivo por jugador

## Datos progresivos

El catálogo reconoce 54 atributos numéricos de 1 a 20 en español o inglés. Cada ficha muestra el inventario completo con valores disponibles y pendientes; al seleccionar un rol, prioriza las columnas necesarias para completarlo. Las columnas originales siguen conservándose aunque no pertenezcan al catálogo.

Usa **Unique ID** y la misma partida al volver a importar para actualizar fichas existentes. Mantén también las columnas obligatorias de nombre, edad, posición, CA y CP/PA. Añade el resto gradualmente. Una columna omitida conserva el valor anterior; una columna incluida vacía o inválida sustituye su valor y no participa en el cálculo. El modelo usa los últimos valores conservados de cada atributo, que pueden proceder de distintas exportaciones; la ficha de roles combina los últimos valores conservados. El histórico separado de Seguimiento sí conserva observaciones fechadas de cada CSV.

## Índices y comparación

- Dieciséis perfiles: dos de portería, dos de centrales, tres de laterales, tres de mediocampo, tres de mediapuntas/extremos y tres de delanteros.
- Cada perfil tiene pesos de 1 a 3 y atributos clave obligatorios. Consulta su lista exacta en **Atributos y pesos de este rol**.
- Índice individual: suma de valor × peso dividida por el peso conocido, multiplicada por 5. Escala de 5 a 100.
- Cobertura: peso conocido dividido por el peso total. Se exige cobertura ≥80% y todos los atributos clave para publicar el índice; hasta entonces aparece **Pendiente**.
- Comparación: mismo rol y únicamente atributos válidos presentes en ambos jugadores. Se aplica el umbral sobre esa intersección; ambos índices pueden diferir de sus índices individuales.
- No se comparan partidas distintas, un jugador consigo mismo ni porteros con jugadores de campo. Se muestran por defecto compañeros del mismo grupo de posición, con opción de incluir otros puestos de campo.
- Las prioridades muestran valores relativos más bajos entre los datos del rol, excluyendo empates con su valor máximo. No prescriben un aumento garantizado ni una duración de entrenamiento.

## Límites del modelo

Son referencias propias de planificación, no pesos oficiales de Football Manager. CA, PA, edad, personalidad y polivalencia dan contexto y no se suman al índice. La afinidad con otro perfil no demuestra dominio de una posición ni asegura el éxito de una reconversión. Es necesario revisar familiaridad, lado, pierna y táctica en la partida.

Los perfiles pendientes se ordenan por cobertura. Los evaluables se ordenan por su índice; como los pesos y datos disponibles pueden variar, hay que revisar el detalle antes de interpretar ese orden como una preferencia deportiva. La cobertura no expresa probabilidad de éxito.

Rendimiento, salarios y contrato se muestran como texto exportado para aportar contexto. La evolución se consulta en Seguimiento. Todavía no se calculan métricas por 90 minutos, coste/utilidad ni proyecciones temporales.

## Catálogo preparado

| Grupo | Atributos |
|---|---|
| Físicos | Aceleración, velocidad, agilidad, equilibrio, fuerza, resistencia, alcance de salto, recuperación física |
| Técnicos | Entradas, marcaje, remate, técnica, pases, cabeceo, regate, primer toque, centros, tiros lejanos, córners, lanzamiento de faltas, penaltis, saques largos |
| Mentales | Anticipación, decisiones, colocación, desmarques, serenidad, visión, sacrificio, talento, liderazgo, trabajo de equipo, concentración, determinación, agresividad, valentía |
| Portería | Reflejos, blocaje, uno contra uno, alcance aéreo, mando en el área, comunicación, saques de puerta, saques con la mano, salidas, puños, excentricidad |
| Personalidad y ocultos | Profesionalidad, ambición, consistencia, partidos importantes, polivalencia, presión, propensión a lesiones |

No todos estos atributos intervienen en los perfiles actuales. Agresividad, excentricidad y tendencias no se interpretan como mejores por ser más altas. Los nuevos análisis pueden consumir el catálogo sin migrar el guardado.
