import { OLLAMA_PROXY_URL, postChatCompletion } from '../../OllamaProxy';

const messages = [{ role: 'user' as const, content: 'hi' }];

function mockFetchResponse(status: number, body: unknown = {}) {
    (global as any).fetch = jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body)
    });
}

describe('OllamaProxy', () => {

    afterEach(() => {
        delete (global as any).fetch;
    });

    test('posts to the public proxy without a token and returns the reply', async () => {
        mockFetchResponse(200, { choices: [{ message: { content: '  A tip.  ' } }] });

        await expect(postChatCompletion('llama3.2:latest', messages)).resolves.toEqual('A tip.');

        const [url, init] = (global as any).fetch.mock.calls[0];
        expect(url).toEqual(OLLAMA_PROXY_URL);
        expect(url).toMatch(/^https:\/\/ollama-proxy\.omen\.dankoresoft\.com\//);
        expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
    });

    test('429 asks the user to wait', async () => {
        mockFetchResponse(429);
        await expect(postChatCompletion('m', messages)).rejects.toThrow('AI is busy, try again in a minute.');
    });

    test('401 explains the request was refused', async () => {
        mockFetchResponse(401, { error: 'Ollama proxy: missing or wrong token' });
        await expect(postChatCompletion('m', messages)).rejects.toThrow(/refused this request/);
    });

    test('network failures (including CORS-blocked 429/401) get a friendly message', async () => {
        (global as any).fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        await expect(postChatCompletion('m', messages)).rejects.toThrow(/Could not reach the AI service/);
        expect((global as any).fetch).toHaveBeenCalledTimes(1);
    });

});
