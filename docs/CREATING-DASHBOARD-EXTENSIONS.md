# Creating New Azure DevOps Dashboard Extensions

This guide documents how to add a **new dashboard widget extension** to this repo (e.g. Project Navigator, Project Creator, Global Wiki Page Creator). Follow these steps so each new extension is consistent and packageable.

---

## 1. Create the widget sample (source code)

### 1.1 Folder and files

Create a new folder under `src/Samples/` with a **kebab-case** name, e.g. `my-widget-name`. Add these files:

| File | Purpose |
|------|--------|
| `{name}.tsx` | React widget: SDK init, register widget, implement `Dashboard.IConfigurableWidget` (preload, load, reload), call `showRootComponent(<YourWidget />)` |
| `{name}.html` | Host page: `<div id="root"></div>` and `<script src="{name}.js">` |
| `{name}.scss` | Styles; import `azure-devops-ui/Core/_platformCommon.scss` and use `$fontSize`, `$fontSizeL` etc. for consistency |
| `{name}.json` | **Contribution manifest**: widget contribution + scopes (see below) |

**Naming rule:** Folder name = entry name. Webpack auto-discovers all folders under `src/Samples/` and builds `dist/{name}/{name}.js` and copies `*.html` to `dist/{name}/`.

### 1.2 Widget contribution JSON (`src/Samples/{name}/{name}.json`)

```json
{
  "contributions": [
    {
      "id": "{name}-widget",
      "type": "ms.vss-dashboards-web.widget",
      "targets": ["ms.vss-dashboards-web.widget-catalog"],
      "properties": {
        "name": "Human Readable Name",
        "description": "Short description for the catalog.",
        "catalogIconUrl": "static/{logo-filename}.png",
        "uri": "dist/{name}/{name}.html",
        "isNameConfigurable": true,
        "supportedSizes": [
          { "rowSpan": 2, "columnSpan": 2 },
          { "rowSpan": 2, "columnSpan": 3 }
        ],
        "supportedScopes": ["project_team"]
      }
    }
  ],
  "scopes": ["vso.project", "vso.xxx"]
}
```

- Set `scopes` to the OAuth scopes the widget needs (e.g. `vso.project`, `vso.wiki_write`, `vso.work`, `vso.project_manage`).
- Use a dedicated logo file in `static/` (see step 3) and set `catalogIconUrl` to `static/{logo-filename}.png`.

### 1.3 TSX checklist

- `SDK.init()` then `SDK.register("{contribution-id}", this)`.
- Implement `preload`, `load`, `reload` returning `Dashboard.WidgetStatusHelper.Success()` (or Failure).
- Use `getClient(...)` from `azure-devops-extension-api` for REST clients; use `SDK.getWebContext()` and `SDK.getAccessToken()` when calling REST via `fetch`.
- For `<select>`, add `aria-label` or associate with `<label htmlFor="...">` for accessibility.

---

## 2. Create the extension manifest (for a standalone VSIX)

If this widget is shipped as its **own** extension (its own VSIX), add a **root-level extension manifest**:

- **Filename:** `azure-devops-extension-{short-id}.json` (e.g. `azure-devops-extension-project-navigator.json`).
- **Content pattern:**

```json
{
  "manifestVersion": 1,
  "id": "{extension-id}",
  "publisher": "dankore-software",
  "version": "1.0.0",
  "name": "Extension Display Name",
  "description": "One-line description.",
  "categories": ["Azure Boards"],
  "public": false,
  "targets": [{ "id": "Microsoft.VisualStudio.Services" }],
  "icons": { "default": "static/{logo-filename}.png" },
  "content": { "details": { "path": "overview.md" } },
  "files": [
    { "path": "static", "addressable": true },
    { "path": "dist", "addressable": true }
  ]
}
```

- Use a **unique** `id` (e.g. `project-navigator-dashboard`) so it doesn’t clash with existing Marketplace extensions.
- Point `icons.default` and the widget’s `catalogIconUrl` at the same logo in `static/` (see step 3).

---

## 3. Logo (ImageMagick)

Use a **dedicated logo** per extension so the catalog and extension list show the right icon.

1. **Create the image** (128×128 PNG, required for Marketplace):

   ```bash
   cd static
   magick -size 128x128 xc:'#0078d4' \
     -fill white -draw "..." \
     {extension-logo-name}.png
   ```

   Use Azure blue `#0078d4` and white shapes (e.g. arrow for “navigate”, plus for “create”, document for “wiki”). Prefer `magick` (ImageMagick 7); if only `convert` is available, use that.

2. **Wire the logo:**
   - Extension manifest: `"icons": { "default": "static/{extension-logo-name}.png" }`
   - Widget contribution: `"catalogIconUrl": "static/{extension-logo-name}.png"`

---

## 4. Build and package

### 4.1 Build

Webpack picks up every folder under `src/Samples/` automatically. No config change needed.

```bash
npm run compile:dev
```

Or full build with tests:

```bash
npm run build:dev
```

### 4.2 Package a **standalone** extension (one VSIX per extension)

Use the **extension manifest** and **only that widget’s contribution** JSON:

```bash
npx tfx extension create \
  --manifest-globs azure-devops-extension-{short-id}.json \
  src/Samples/{folder-name}/{folder-name}.json
```

Example (Project Navigator):

```bash
npx tfx extension create \
  --manifest-globs azure-devops-extension-project-navigator.json \
  src/Samples/project-navigator/project-navigator.json
```

Output: `dankore-software.{extension-id}-{version}.vsix` in the repo root.

### 4.3 Version bump before packaging

When you change the extension (e.g. add logo, fix bug), bump the **version** in the extension manifest (`azure-devops-extension-{short-id}.json`), then run the `tfx extension create` command again. Do **not** use `--rev-version` if you already set the version manually.

---

## 5. Quick reference: existing extensions in this repo

| Extension | Manifest | Widget folder | Logo |
|-----------|----------|---------------|------|
| Global Work Item Creator | (main) `azure-devops-extension.json` | `global-work-item-creator` | `static/logo.png` |
| Project Creator | `azure-devops-extension-project-creator.json` | `project-creator` | `static/project-creator-logo.png` |
| Project Navigator | `azure-devops-extension-project-navigator.json` | `project-navigator` | `static/project-navigator-logo.png` |
| Global Wiki Page Creator | `azure-devops-extension-global-wiki-page-creator.json` | `global-wiki-page-creator` | `static/global-wiki-page-creator-logo.png` |
| Global Work Item Search | `azure-devops-extension-global-work-item-search.json` | `global-work-item-search` + `work-item-preview-dialog` | `static/global-work-item-search-logo.png` |

---

## 6. Checklist for “create a new dashboard extension”

- [ ] Add `src/Samples/{name}/` with `{name}.tsx`, `{name}.html`, `{name}.scss`, `{name}.json` (contribution).
- [ ] Implement widget (SDK init, register, preload/load/reload, UI).
- [ ] Create `azure-devops-extension-{short-id}.json` at repo root with unique `id`, version, name, description, icons, files.
- [ ] Create logo in `static/{logo}.png` (128×128) with ImageMagick; set `icons.default` and `catalogIconUrl` to that file.
- [ ] Run `npm run compile:dev` (or `npm run build:dev`).
- [ ] Package: `npx tfx extension create --manifest-globs azure-devops-extension-{short-id}.json src/Samples/{name}/{name}.json`.
- [ ] Upload the generated `.vsix` to Azure DevOps (Manage extensions / Marketplace).

Refer to this doc when adding or modifying dashboard extensions so the process stays consistent.
