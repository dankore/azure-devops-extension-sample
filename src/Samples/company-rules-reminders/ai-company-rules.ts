const OLLAMA_PROXY_URL = "https://ollama-proxy.omen.dankoresoft.com/v1/chat/completions";
const DEFAULT_MODEL = "llama3.2:latest";

interface CachedWeekdays {
    weekStartIso: string;
    reminders: string[];
}

function getCacheKey(widgetId: string | undefined, sourceKey: string): string {
    const idPart = widgetId || "default-widget";
    return `company-rules-reminders-cache:${idPart}:${sourceKey}`;
}

function getMondayStart(d: Date): Date {
    const current = new Date(d);
    const day = current.getDay(); // 0 = Sunday
    const diff = day === 0 ? -6 : 1 - day;
    current.setDate(current.getDate() + diff);
    current.setHours(0, 0, 0, 0);
    return current;
}

function toIsoDateOnly(d: Date): string {
    return d.toISOString().split("T")[0];
}

function getWeekdayIndexForReminder(today: Date): number {
    // Monday=0 ... Friday=4. Weekends map to Friday.
    const day = today.getDay();
    if (day === 0 || day === 6) {
        return 4;
    }
    return day - 1;
}

function parseList(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^(\d+\s*[\.\)]\s*|-|\*)\s*/, "").trim())
        .filter(Boolean);
}

function loadCache(widgetId: string | undefined, sourceKey: string): CachedWeekdays | null {
    try {
        if (typeof window === "undefined" || !window.localStorage) {
            return null;
        }
        const raw = window.localStorage.getItem(getCacheKey(widgetId, sourceKey));
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as CachedWeekdays;
        if (!parsed || !Array.isArray(parsed.reminders)) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function saveCache(widgetId: string | undefined, sourceKey: string, value: CachedWeekdays): void {
    try {
        if (typeof window === "undefined" || !window.localStorage) {
            return;
        }
        window.localStorage.setItem(getCacheKey(widgetId, sourceKey), JSON.stringify(value));
    } catch {
        // ignore storage failures
    }
}

async function callChat(model: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const body = {
        model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        temperature: 0.7
    };

    const response = await fetch(OLLAMA_PROXY_URL, {
        method: "POST",
        headers: {
            "Content-Type": "text/plain"
        } as HeadersInit,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error(`Ollama proxy error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
    };

    const content = json.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error("No content returned from Ollama proxy.");
    }
    return content.trim();
}

async function generateWeekdayReminders(handbookText: string, model: string): Promise<string[]> {
    const systemPrompt =
        "You create concise company policy reminders from source material. " +
        "Use only information present in the provided handbook content. " +
        "Each reminder must be actionable and 1-2 sentences. " +
        "Use plain text only: do not use markdown, asterisks, bold markers, or bullet syntax.";

    const userPrompt =
        "Using the Contractor Handbook content below, generate five distinct reminders for Monday through Friday. " +
        "Return only a numbered list from 1 to 5. Keep each item 1-2 sentences.\n\n" +
        `HANDBOOK CONTENT:\n${handbookText.slice(0, 12000)}`;

    const text = await callChat(model, systemPrompt, userPrompt);
    const parsed = parseList(text).slice(0, 5);
    if (!parsed.length) {
        throw new Error("Could not parse weekday reminders from AI response.");
    }

    if (parsed.length < 5) {
        const padded: string[] = [];
        while (padded.length < 5) {
            padded.push(parsed[padded.length % parsed.length]);
        }
        return padded;
    }

    return parsed;
}

async function generateSingleReminder(handbookText: string, model: string): Promise<string> {
    const systemPrompt =
        "You create concise company policy reminders from source material. " +
        "Use only information present in the provided handbook content. " +
        "Each reminder must be actionable and 1-2 sentences. " +
        "Use plain text only: do not use markdown, asterisks, bold markers, or bullet syntax.";

    const userPrompt =
        "Using the Contractor Handbook content below, generate exactly one reminder suitable for a weekday team reminder. " +
        "Return only the reminder text with no numbering.\n\n" +
        `HANDBOOK CONTENT:\n${handbookText.slice(0, 12000)}`;

    const text = await callChat(model, systemPrompt, userPrompt);
    if (!text) {
        throw new Error("Could not parse single reminder from AI response.");
    }
    return text.replace(/^(\d+\s*[\.\)]\s*|-|\*)\s*/, "").trim();
}

/** When the weekly cache is valid, returns today’s reminder without calling the wiki or AI. */
export function getCachedReminderIfValid(
    widgetId: string | undefined,
    sourceKey: string
): { reminder: string; reminders: string[] } | null {
    const monday = getMondayStart(new Date());
    const mondayIso = toIsoDateOnly(monday);
    const cached = loadCache(widgetId, sourceKey);
    if (cached && cached.weekStartIso === mondayIso && cached.reminders.length >= 5) {
        const idx = getWeekdayIndexForReminder(new Date());
        return { reminder: cached.reminders[idx] || cached.reminders[4], reminders: cached.reminders };
    }
    return null;
}

export async function getReminderForToday(
    widgetId: string | undefined,
    sourceKey: string,
    handbookText: string,
    model: string = DEFAULT_MODEL
): Promise<{ reminder: string; reminders: string[] }> {
    const monday = getMondayStart(new Date());
    const mondayIso = toIsoDateOnly(monday);
    const cached = loadCache(widgetId, sourceKey);

    if (cached && cached.weekStartIso === mondayIso && cached.reminders.length >= 5) {
        const idx = getWeekdayIndexForReminder(new Date());
        return { reminder: cached.reminders[idx] || cached.reminders[4], reminders: cached.reminders };
    }

    const reminders = await generateWeekdayReminders(handbookText, model);
    saveCache(widgetId, sourceKey, {
        weekStartIso: mondayIso,
        reminders
    });

    const idx = getWeekdayIndexForReminder(new Date());
    return { reminder: reminders[idx] || reminders[4], reminders };
}

export async function refreshTodayReminder(
    widgetId: string | undefined,
    sourceKey: string,
    handbookText: string,
    model: string = DEFAULT_MODEL
): Promise<{ reminder: string; reminders: string[] }> {
    const monday = getMondayStart(new Date());
    const mondayIso = toIsoDateOnly(monday);
    const cached = loadCache(widgetId, sourceKey);

    let reminders = cached && cached.weekStartIso === mondayIso && cached.reminders.length >= 5
        ? [...cached.reminders]
        : await generateWeekdayReminders(handbookText, model);

    const idx = getWeekdayIndexForReminder(new Date());
    const newReminder = await generateSingleReminder(handbookText, model);
    reminders[idx] = newReminder;

    saveCache(widgetId, sourceKey, {
        weekStartIso: mondayIso,
        reminders
    });

    return { reminder: newReminder, reminders };
}
