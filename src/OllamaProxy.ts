// Public Ollama proxy. Requests from Azure DevOps / Marketplace origins need no token;
// they are rate-limited (~20 requests/minute per client, HTTP 429 above that).
// Never put the proxy's server token in extension code: the .vsix is public.
export const OLLAMA_PROXY_URL = "https://ollama-proxy.omen.dankoresoft.com/v1/chat/completions";

const REQUEST_TIMEOUT_MS = 90000;

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

function errorForStatus(status: number): Error {
    if (status === 429) {
        return new Error("AI is busy, try again in a minute.");
    }
    if (status === 401 || status === 403) {
        return new Error("The AI service refused this request. Update the extension, then try again.");
    }
    if (status === 502 || status === 503 || status === 504) {
        return new Error("The AI server is starting up or overloaded. Try again in a minute.");
    }
    return new Error(`AI service error (${status}). Try again later.`);
}

/** Calls the proxy's OpenAI-compatible chat endpoint once (no retries) and returns the reply text. */
export async function postChatCompletion(model: string, messages: ChatMessage[], temperature: number = 0.7): Promise<string> {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
    const timeoutId = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : undefined;

    try {
        let response: Response;
        try {
            // Use a "simple" CORS request (avoid preflight) by not using application/json.
            response = await fetch(OLLAMA_PROXY_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "text/plain"
                } as HeadersInit,
                body: JSON.stringify({ model, messages, temperature }),
                signal: controller?.signal
            });
        } catch (e) {
            if (e instanceof Error && e.name === "AbortError") {
                throw e;
            }
            // The proxy's 429/401 responses carry no CORS headers, so the browser reports them as network errors.
            throw new Error("Could not reach the AI service. It may be busy or offline; try again in a minute.");
        }

        if (!response.ok) {
            throw errorForStatus(response.status);
        }

        const json = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
        };

        const content = json.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error("No content returned from Ollama proxy.");
        }
        return content.trim();
    } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
            throw new Error("The AI service took too long to respond. Try again in a minute.");
        }
        throw e;
    } finally {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
    }
}
