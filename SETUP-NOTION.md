# ☁️ Sync App ↔ Notion — guía de configuración (una sola vez, ~5 min)

La app es el **juego del día a día** (checklists, XP, rachas). Notion es la
**base de datos**: el roadmap de metas (corto/mediano → US$3.000/mes, largo →
US$7.000/mes) y el archivo histórico de cada día.

```
App (teléfono) ──registro diario──▶ GitHub (data/daily/*.json)
                                      │ GitHub Action
                                      ▼
                                   Notion  ──metas──▶ data/roadmap.json ──▶ App (tab Metas)
```

Fitia y Gravl siguen siendo donde registras comida y entrenamiento. En la app
solo marcas el ✓ diario de cada uno (hábitos "Comidas en Fitia" y
"Entrenamiento (Gravl)") — dos segundos, no doble registro.

## Qué ya está creado en Notion

Página **"🎮 Mi Sistema — App ↔ Notion (Sync)"** con dos bases:

| Base | Rol |
|---|---|
| 🎯 Roadmap — Metas | Fuente de verdad de tus metas. Las editas en Notion; la app las muestra con barras de progreso. |
| 📅 Registro Diario | La llena la app: XP, hábitos, racha, Fitia ✓, Gravl ✓, outreach, ingresos del mes. |

⚠️ No renombres las propiedades de esas bases: la sincronización depende de los nombres.

## Paso 1 — Token de GitHub (para que la app suba tu día)

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token.
2. Repository access: **Only select repositories** → `jlyp29/jorge-app`.
3. Permissions → Repository permissions → **Contents: Read and write**. Nada más.
4. Genera, copia el `github_pat_…` y pégalo en la app: **Ajustes → ☁️ Sync Notion → Guardar token**.

El token queda guardado solo en tu teléfono (no viaja en los backups de la app).

## Paso 2 — Integración de Notion (para que GitHub escriba en Notion)

1. Ve a [notion.so/profile/integrations](https://www.notion.so/profile/integrations) → **New integration** (tipo interna, tu workspace).
2. Copia el **Internal Integration Secret** (`ntn_…`).
3. En Notion, abre la página **"🎮 Mi Sistema — App ↔ Notion (Sync)"** → menú `⋯` → **Conexiones / Connections** → agrega tu integración. (Con eso hereda acceso a las dos bases.)

## Paso 3 — Secret en el repo (conecta los dos mundos)

1. GitHub → repo `jorge-app` → Settings → **Secrets and variables → Actions** → New repository secret.
2. Nombre: `NOTION_TOKEN` · Valor: el secret de Notion del paso 2.

## Paso 4 — Probar

1. En la app: Ajustes → ☁️ Sync Notion → **Probar conexión** (debe decir ✅).
2. **Sincronizar ahora** → sube `data/daily/HOY.json` al repo.
3. El workflow **Notion Sync** corre solo (Actions → Notion Sync) y:
   - crea/actualiza la fila de hoy en "📅 Registro Diario",
   - regenera `data/roadmap.json` con tus metas.
4. En la app: Resultados → tab **Metas** → deberías ver tu roadmap con barras de progreso.

## Cuándo sincroniza

- **App → GitHub:** al abrir la app y al mandarla a segundo plano (solo si hay cambios), o con el botón "Sincronizar ahora".
- **GitHub → Notion → roadmap.json:** en cada subida de un registro diario + todos los días a las 05:00 (hora Chile) + manual desde Actions.

## Problemas típicos

| Síntoma | Causa probable |
|---|---|
| "Sync falló: GitHub 401" | Token vencido o mal copiado. Genera otro (paso 1). |
| "Sync falló: GitHub 404" | El token no tiene acceso al repo (revisa Repository access). |
| Workflow falla con "Notion 401" | `NOTION_TOKEN` mal copiado (paso 3). |
| Workflow falla con "object_not_found" | Falta compartir la página con la integración (paso 2.3). |
| El tab Metas no se actualiza | Espera el deploy de GitHub Pages (~1-2 min) y recarga la app. |
