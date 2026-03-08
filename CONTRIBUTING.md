# Contributing

## Prerequisites

- Node.js 18+
- An Obsidian vault (desktop)

## Initial setup

```bash
git clone <repo>
cd obsidian-swimlanes
npm install
```

Copy `.env.example` to `.env` and set your vault path:

```
VAULT=C:\Users\you\Documents\MyVault
```

## Obsidian dev setup

### 1. Install BRAT

In Obsidian: **Settings → Community plugins → Browse** → search for **BRAT** → install and enable it.

### 2. Install Hot Reload via BRAT

In Obsidian: **Settings → BRAT → Add Beta plugin** → enter `pjeby/hot-reload` → enable **Hot Reload** in Community plugins.

### 3. Add the hot reload marker

Run once to mark this plugin for hot reloading:

```bash
npm run install-plugin
touch "$VAULT/.obsidian/plugins/wrongnotes-swimlanes/.hotreload"
```

(On Windows without a `.env`-aware shell, create the file manually at `<vault>\.obsidian\plugins\wrongnotes-swimlanes\.hotreload`.)

## Development workflow

```bash
npm run dev
```

esbuild watches `src/` and writes `main.js` directly into your vault plugin folder. Hot Reload detects the change and reloads the plugin in Obsidian automatically — no manual disable/re-enable needed.

```bash
npm test        # run Jest tests
npm run build   # production build (outputs main.js to project root)
```

> **Note:** `npm run build` always writes to the project root, never to the vault. Use `npm run install-plugin` to copy a production build to the vault.
