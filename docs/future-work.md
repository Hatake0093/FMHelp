# Trabajo futuro

Ideas y mejoras pendientes, sin compromiso de fecha. Las fases grandes están en [roadmap.md](roadmap.md); aquí van los hallazgos concretos de cada revisión. Cuando algo se implemente, bórralo de la lista o muévelo al README.

## Revisión del 2026-11-01

Origen: revisión del código y del CSV `data/moneyball_export_20261101_021304.csv`. Pendiente de contrastar con la página que el usuario quería usar como referencia (aún no compartida).

### Por orden de prioridad

1. **Porteros sin evaluar.** El CSV no trae `Uno contra uno`, `Salidas` ni `Saques`. Los dos perfiles de portero los marcan como esenciales (`oneOnOnes`, `rushingOut`), así que siempre salen "Pendiente". Solución: añadir esas columnas al exportador y reimportar. Coste bajo, impacto alto.
2. **Fase 3 · perfil frente a rendimiento.** `Calificación`, `Disputados` y `Minutos` ya se importan, pero solo se muestran como texto. Cruzar el índice de rol con la calificación para detectar quién rinde por encima o por debajo de su perfil, y quién tiene buenos atributos y no juega.
3. **Fase 5 · valor deportivo por sueldo.** `Sueldo`, `Valor de traspaso` y `Final` son texto (`6.5m € p/m`, `14M € - 16M €`). Un parser de importes permitiría calcular puntos de rol por millón y apoyar la propuesta de vender, conservar o ceder. Hay que conservar el texto original, como hoy.
4. **Fase 4 · fichajes por necesidad.** `analyzeSlot` ya detecta puestos en riesgo. Convertir ese resultado en un perfil objetivo (rol, edad máxima, atributos mínimos) y filtrar con él un CSV de candidatos.
5. **Pierna buena y `Posición/rol`.** Se guardan pero no influyen. Útiles para el lado de laterales y extremos, y para centrales con salida.
6. **Pesos de rol configurables.** Hoy están fijos en `src/modules/analysis/roles.ts`. Permitir ajustarlos desde la interfaz y guardarlos con la partida.

### Notas

- Trabajo sin commitear al hacer la revisión: `DepartureDialog.tsx` y `src/modules/archive/` (parece el flujo de salidas). No se revisó.
- Todos los pesos e índices son referencias propias, no fórmulas oficiales de FM; mantener esa advertencia en cualquier función nueva.
