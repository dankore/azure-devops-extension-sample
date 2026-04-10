# Company Rules Reminders (AI + Wiki)

This dashboard widget generates weekday reminders (Monday-Friday) from your Contractor Handbook wiki page and shows one reminder per day.
It is now **zero-configuration**: no widget setup is required.

## How it works

- Fetches handbook text from Azure DevOps Wiki using `WikiRestClient.getPageText` (with `includeContent`), and falls back to scanning wiki pages if the path does not match.
- Sends that source text to your Ollama proxy (`/v1/chat/completions`) to generate five reminders for the work week.
- Caches the generated set for the current week (Monday start) in `localStorage`. On a normal load, if that cache is still valid, the widget **does not** call the wiki API or Ollama again (same idea as Daily Security Tips).
- Reminder text is rendered with Markdown (`marked`) so `**bold**` shows as bold when the model still emits it; prompts also ask for plain text without markdown.
- The refresh button still loads the handbook (needed for AI context) and regenerates **only today’s** reminder.

## Fixed source (hardcoded)

- Project: `Dankore Software`
- Wiki: `Dankore-Software.wiki`
- Page path: `/Contractor-Handbook`
- Model: `llama3.2:latest`

## Manifest and packaging

- Standalone extension manifest:
  - `azure-devops-extension-company-rules-reminders.json`
- Contribution files:
  - `src/Samples/company-rules-reminders/company-rules-reminders.json`

Build and package:

```bash
npm run compile:dev
npm run package-company-rules-reminders
```

Direct `tfx` alternative:

```bash
npx tfx extension create \
  --manifest-globs azure-devops-extension-company-rules-reminders.json \
  src/Samples/company-rules-reminders/*.json
```
