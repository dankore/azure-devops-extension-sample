## Daily Security Tips (AI-powered)

The **Daily Security Tips** dashboard widget shows a short security reminder for your team on Azure DevOps dashboards. This variant uses an AI model, hosted behind your Ollama proxy, to generate tips instead of relying on a hard-coded list.

### How tips are generated

- **Backend**: The widget calls your Ollama proxy at `https://ollama-proxy.omen.dankoresoft.com/v1/chat/completions`.
- **Model**: By default it uses the `llama3.2:latest` model name. You can override this per widget instance (see configuration below).
- **Prompting**: Once per week (by default starting Sunday), it asks the model to generate **7 concrete, 1–2 sentence security tips** for a remote, globally distributed software team.
- **Selection**: Each day of the week picks the corresponding tip from that weekly set (Sunday index 0 through Saturday index 6).

The request is equivalent to this `curl`:

```bash
curl -X POST "https://ollama-proxy.omen.dankoresoft.com/v1/chat/completions" \
  -H "Content-Type: text/plain" \
  -d '{
    "model": "llama3.2:latest",
    "messages": [
      {
        "role": "system",
        "content": "You are generating concise, practical security tips for a remote, globally distributed software team. Tips should focus on everyday behavior: account security, phishing, secure communication, handling customer data, device hygiene, and working securely from home or co-working spaces. Each tip should be 1–2 sentences."
      },
      {
        "role": "user",
        "content": "Generate 7 distinct daily security tips for the upcoming week for a remote software team that works across continents. Each tip should be 1–2 sentences, concrete and actionable. Respond as a numbered list from 1 to 7, with no extra commentary."
      }
    ],
    "temperature": 0.7
  }'
```

If your Ollama proxy expects a different model name, update the `model` field above or set the model in the widget configuration.

### Weekly caching behavior

- The widget computes the start of the **current week** (Sunday at 00:00 local time).
- It stores the 7 generated tips, along with the week start date, in `localStorage` under a key like `daily-security-tips-weekly-cache:<widgetId>`.
- As long as the cache exists and matches the current week, the widget **does not call the AI again** and simply reads today’s tip from the cached array.
- If `localStorage` is unavailable, or the cache is invalid, the widget falls back to calling the AI directly.

### Refreshing / busting the cache

In the widget card there is a **“Refresh tips”** button:

- Clicking this button:
  - Clears the cached weekly tips for that widget instance.
  - Immediately fetches a **new set of 7 tips** from the Ollama proxy.
  - Updates today’s tip using the newly generated set.
- This is useful when the current weekly tips don’t fit your needs and you want a completely fresh set for the week.

### Widget configuration

When configuring the widget on a dashboard:

- **Custom header text (top row)**: Optional Markdown text shown above the daily tip. Use this to brand the widget for your team (e.g. “Security reminder for Remote Platform Team”).
- **AI model name (optional)**: Overrides the default model name sent to the Ollama proxy (e.g. `llama3.1`, `llama3.2`, or a custom model id defined on your server). Leave blank to use the compiled default.

### Building and packaging the Daily Security Tips extension

To build and package just the Daily Security Tips extension as a standalone VSIX:

```bash
cd /Users/dankore/sources/azure-devops-extension-sample

# Install dependencies (first time or after updates)
npm install

# Compile all samples (including daily-security-tips)
npm run compile:dev

# Package only the Daily Security Tips extension
npm run package-daily-security-tips
```

The last command runs `tfx extension create` with the `azure-devops-extension-daily-security-tips.json` manifest and the two widget contribution JSON files:

- `src/Samples/daily-security-tips/daily-security-tips.json`
- `src/Samples/daily-security-tips-config/daily-security-tips-config.json`

The output `.vsix` file will be created in the repository root and can be uploaded to your Azure DevOps organization via **Manage extensions** or the Visual Studio Marketplace publishing flow.

