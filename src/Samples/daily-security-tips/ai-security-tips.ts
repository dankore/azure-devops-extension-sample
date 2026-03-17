const OLLAMA_PROXY_URL = "https://ollama-proxy.omen.dankoresoft.com/v1/chat/completions";

// Must match a model exposed by the proxy (/v1/models or /api/tags).
const DEFAULT_MODEL = "llama3.2:latest";

interface CachedWeek {
    weekStartIso: string;
    tips: string[];
}

function getWidgetCacheKey(widgetId: string | undefined): string {
    const baseKey = "daily-security-tips-weekly-cache";
    return widgetId ? `${baseKey}:${widgetId}` : baseKey;
}

function getCurrentWeekStart(): Date {
    const now = new Date();
    const day = now.getDay(); // 0 (Sunday) - 6 (Saturday)
    const diffToSunday = day; // number of days to subtract to get to Sunday
    const sunday = new Date(now);
    sunday.setHours(0, 0, 0, 0);
    sunday.setDate(sunday.getDate() - diffToSunday);
    return sunday;
}

function toIsoDateOnly(d: Date): string {
    return d.toISOString().split("T")[0];
}

function loadCachedWeek(widgetId: string | undefined): CachedWeek | null {
    try {
        if (typeof window === "undefined" || !window.localStorage) {
            return null;
        }
        const raw = window.localStorage.getItem(getWidgetCacheKey(widgetId));
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as CachedWeek;
        if (!parsed || !Array.isArray(parsed.tips)) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function saveCachedWeek(widgetId: string | undefined, week: CachedWeek): void {
    try {
        if (typeof window === "undefined" || !window.localStorage) {
            return;
        }
        window.localStorage.setItem(getWidgetCacheKey(widgetId), JSON.stringify(week));
    } catch {
        // ignore storage errors
    }
}

export function clearCachedWeek(widgetId: string | undefined): void {
    try {
        if (typeof window === "undefined" || !window.localStorage) {
            return;
        }
        window.localStorage.removeItem(getWidgetCacheKey(widgetId));
    } catch {
        // ignore storage errors
    }
}

function parseTipsFromResponseText(text: string): string[] {
    // Expect a numbered or bulleted list. Split into lines and keep non-empty ones.
    const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => !!l);

    const tips = lines
        .map((line) => {
            // Strip leading numbering/bullets like "1. ", "1) ", "- ", "* "
            const cleaned = line.replace(/^(\d+\s*[\.\)]\s*|-|\*)\s*/, "");
            return cleaned.trim();
        })
        .filter((line) => line.length > 0);

    // Use at most 7 tips; if fewer, return what we have.
    return tips.slice(0, 7);
}

async function fetchWeeklyTipsFromOllama(model: string = DEFAULT_MODEL): Promise<string[]> {
    const systemPrompt =
        "You are generating concise, practical security tips for a remote, globally distributed software team. " +
        "Tips should focus on everyday behavior: account security, phishing, secure communication, handling customer data, " +
        "device hygiene, and working securely from home or co-working spaces. Each tip should be 1–2 sentences.";

    const userPrompt =
        "Generate 7 distinct daily security tips for the upcoming week for a remote software team that works across continents. " +
        "Each tip should be 1–2 sentences, concrete and actionable. Respond as a numbered list from 1 to 7, with no extra commentary.";

    const body = {
        model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        temperature: 0.7
    };

    // Use a "simple" CORS request (avoid preflight) by not using application/json.
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

    const tips = parseTipsFromResponseText(content);
    if (!tips.length) {
        throw new Error("Unable to parse any tips from Ollama response.");
    }

    // Ensure we always return exactly 7 by truncating or repeating as needed.
    if (tips.length < 7) {
        const extended: string[] = [];
        while (extended.length < 7) {
            extended.push(tips[extended.length % tips.length]);
        }
        return extended;
    }

    return tips.slice(0, 7);
}

async function fetchSingleTipFromOllama(model: string = DEFAULT_MODEL): Promise<string> {
    const systemPrompt =
        "You are generating concise, practical security tips for a remote, globally distributed software team. " +
        "Tips should focus on everyday behavior: account security, phishing, secure communication, handling customer data, " +
        "device hygiene, and working securely from home or co-working spaces. Each tip should be 1–2 sentences.";

    const userPrompt =
        "Generate one daily security tip for a remote software team that works across continents. " +
        "The tip should be 1–2 sentences, concrete and actionable. Respond with the tip only, no numbering or extra commentary.";

    const body = {
        model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        temperature: 0.7
    };

    // Use a "simple" CORS request (avoid preflight) by not using application/json.
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

    const tip = content.trim();
    if (!tip) {
        throw new Error("Unable to parse tip from Ollama response.");
    }

    return tip;
}

export async function getTipForTodayFromOllama(
    widgetId: string | undefined,
    model: string = DEFAULT_MODEL,
    options?: { bypassCache?: boolean }
): Promise<{ tip: string; tipsForWeek: string[] }> {
    const weekStart = getCurrentWeekStart();
    const weekStartIso = toIsoDateOnly(weekStart);

    const useCache = !options?.bypassCache;

    const cached = useCache ? loadCachedWeek(widgetId) : null;
    if (cached && cached.weekStartIso === weekStartIso && Array.isArray(cached.tips) && cached.tips.length >= 7) {
        const today = new Date();
        const weekdayIndex = today.getDay(); // 0–6, Sunday-based
        const tip = cached.tips[weekdayIndex] || cached.tips[0];
        return { tip, tipsForWeek: cached.tips };
    }

    const tips = await fetchWeeklyTipsFromOllama(model);

    saveCachedWeek(widgetId, {
        weekStartIso,
        tips
    });

    const today = new Date();
    const weekdayIndex = today.getDay();
    const tip = tips[weekdayIndex] || tips[0];

    return { tip, tipsForWeek: tips };
}

export async function refreshTodayTipPreserveWeek(
    widgetId: string | undefined,
    model: string = DEFAULT_MODEL
): Promise<{ tip: string; tipsForWeek: string[] }> {
    const weekStart = getCurrentWeekStart();
    const weekStartIso = toIsoDateOnly(weekStart);

    const cached = loadCachedWeek(widgetId);
    let tips: string[];

    if (cached && cached.weekStartIso === weekStartIso && Array.isArray(cached.tips) && cached.tips.length >= 7) {
        tips = [...cached.tips];
    } else {
        tips = await fetchWeeklyTipsFromOllama(model);
    }

    const today = new Date();
    const weekdayIndex = today.getDay(); // 0–6, Sunday-based

    const newTip = await fetchSingleTipFromOllama(model);
    tips[weekdayIndex] = newTip;

    saveCachedWeek(widgetId, {
        weekStartIso,
        tips
    });

    return { tip: newTip, tipsForWeek: tips };
}


