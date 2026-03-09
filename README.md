# Obsidian Swimlanes

A Kanban-style swimlane board view for [Obsidian Bases](https://obsidian.md/bases). Cards are your notes; columns are the values of a chosen property. Drag to reorder and move cards between columns — changes are written back to each note's frontmatter.

## Requirements

- Obsidian 1.10.0 or later (Bases is a core plugin introduced in that release)

## Setup

### 1. Install the plugin

The easiest way to install is via [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable the **BRAT** community plugin.
2. Open BRAT settings and click **Add Beta plugin**.
3. Enter the repository URL: `https://github.com/wrongnotes/obsidian-swimlanes`
4. Click **Add plugin**, then enable **Obsidian Swimlanes** in Settings → Community plugins.

### 2. Create a Base

1. In the file explorer, create a new file with a `.base` extension (e.g. `Tasks.base`).
2. Open the file — Obsidian will open the Bases editor.
3. Use the **Filter** toolbar to scope the query to the notes you want on the board (e.g. filter by folder or tag).

### 3. Add a Group by property

In the Bases toolbar, click **Group by** and choose the property whose values should become columns (e.g. `status`). Each unique value becomes a swimlane column.

### 4. Switch to the Swimlane view

Click the view switcher in the Bases toolbar and select **Swimlane**. The board will render one column per group.

### 5. Configure the view options

Open the Swimlane view options panel and set:

| Option                | Description                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Swimlane property** | The frontmatter property used for columns (must match the Group by property, e.g. `status`).                          |
| **Swimlane order**    | The order columns appear in. Auto-populated from observed values on first load — reorder or remove entries as needed. |
| **Rank property**     | The frontmatter property used to persist card order within a column (e.g. `rank`). Defaults to `rank`.                |

### 6. Drag cards

- Drag a card within a column to reorder it.
- Drag a card to a different column to change its status and reorder it.

Changes are written back to each note's frontmatter immediately.

## Development

```sh
npm install
npm run dev     # watch mode
npm run build   # production build
npm run lint    # lint
npm test        # run tests
```
