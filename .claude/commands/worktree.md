---
description: Crea un git worktree aislado en .trees/<nombre> y ejecuta ahí el requerimiento
argument-hint: <requerimiento a implementar>
---

Requerimiento: $ARGUMENTS

Sigue estos pasos en orden:

1. Si `$ARGUMENTS` está vacío, pide el requerimiento al usuario y detente.
2. Deduce un `<nombre>` corto en kebab-case, minúsculas, sin tildes ni espacios, que describa el requerimiento (ej. `modo-versus`, `fix-rotacion`). Si `.trees/<nombre>` ya existe, añade un sufijo (`-2`).
3. Crea el worktree desde la raíz del repo: `git worktree add .trees/<nombre>` (crea la rama `<nombre>` a partir del HEAD actual).
4. Ejecuta el requerimiento **únicamente dentro de `.trees/<nombre>`**:
   - Usa rutas absolutas hacia `.trees/<nombre>/...` en Read/Edit/Write y `git -C .trees/<nombre>` o `cd` a esa carpeta en Bash.
   - No toques archivos del árbol principal.
   - Respeta `CLAUDE.md` (el worktree contiene su propia copia).
   - Para probar el juego, abre `index.html` del worktree.
5. **NO hagas `git commit` ni `git add`**: deja los cambios sin commitear en el worktree para que el usuario los revise y decida el commit. Al terminar, reporta: nombre del worktree, ruta, rama, resumen de cambios y cómo verlos (`git -C .trees/<nombre> status` / `git -C .trees/<nombre> diff`). Indica que, tras revisar y commitear, se integra con (`git merge <nombre>`) y se limpia con (`git worktree remove .trees/<nombre>`). No hagas merge ni elimines el worktree sin que el usuario lo pida.
