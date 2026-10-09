# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Tetris en JavaScript vanilla (HTML5 Canvas). Sin dependencias, sin `package.json`, sin build, sin linter, sin tests. El README y la UI están en español.

Ejecutar: abrir `index.html` directamente, o servir de forma estática (`python -m http.server 8000`) y abrir `http://localhost:8000`.

## Arquitectura

Tres archivos: `index.html` (DOM + dos canvas), `style.css` y `game.js` (toda la lógica, ~300 líneas, ámbito global, `'use strict'`).

- `game.js` mantiene todo el estado en variables `let` de nivel superior, reiniciadas por `init()` (que también es el handler del botón de reinicio). `init()` → `spawn()` promueve `next` a `current` y termina el juego si la nueva pieza colisiona.
- El tablero es una matriz `ROWS × COLS` de `0` o un índice de pieza 1–7; el mismo índice selecciona la entrada en `COLORS` y en `PIECES`.
- El game loop usa `requestAnimationFrame` (`loop`) con un acumulador `dropAccum` contra `dropInterval`. Pausa y game over usan `cancelAnimationFrame(animId)`, así que cualquier código nuevo que detenga o reanude el loop debe mantener `animId` consistente.
- Soft/hard drop, limpieza de líneas y subida de nivel actualizan puntaje y `dropInterval` en línea; hay que llamar a `updateHUD()` para reflejar los cambios en el DOM.

## Cuidado

- El tamaño de los canvas está fijo en `index.html` (`board` 300×600, `next-canvas` 120×120). Si cambias `COLS`, `ROWS` o `BLOCK` en `game.js`, actualiza `width`/`height` allí a `COLS×BLOCK` / `ROWS×BLOCK`.
- La vista previa `next` usa su propio tamaño de bloque fijo (30px) y una cuadrícula 4×4 para centrar (`drawNext`).
