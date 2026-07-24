# GodsPlan Gym

App web personal para controlar tu rutina semanal de gimnasio, series, repeticiones, peso usado, historial de sesiones y mejores marcas.

## Uso

Abre `index.html` o despliega el repositorio en Vercel como proyecto estatico.

Los datos se guardan en el navegador con `localStorage`. Cada navegador/dispositivo tiene sus propios pesos y sesiones, por eso conviene exportar un backup JSON de vez en cuando.

## Funciones

- Rutina semanal cargada con tu plan real de lunes a domingo.
- Rutinas editables con dia, nombre, objetivo, cardio, color, descanso y ejercicios.
- Entrenamiento por rutina con registro de reps, peso y series completadas.
- Temporizador de descanso segun la rutina seleccionada.
- Historial de sesiones con volumen total.
- Mejores marcas por ejercicio.
- Reglas visibles de descansos, RIR, progresion, pasos, proteina y sueno.
- Exportacion e importacion de backup JSON.
- Diseno responsive para movil y escritorio.

## Seguridad y robustez

- Sin login ni base de datos: es una app personal con datos locales del navegador.
- Si alguien abre la web desde otro navegador, no puede modificar tus datos porque no estan en el servidor.
- Exportacion/importacion JSON para hacer copias de seguridad o pasar datos entre dispositivos.

## Datos locales

La app guarda tus rutinas editadas, pesos y sesiones en `localStorage`.

Ventaja: no necesitas contrasena y nadie que visite la web desde otro navegador toca tus datos.

Limitacion: si borras datos del navegador, cambias de movil/PC o usas modo incognito, puedes perderlos. Usa `Datos > Exportar JSON` como copia de seguridad.

## Archivos principales

- `index.html`: app estatica lista para Vercel.
- `assets/styles.css`: estilos visuales y responsive.
- `assets/app.js`: interacciones dinamicas, localStorage, progresion y GIFs de ejercicios.
