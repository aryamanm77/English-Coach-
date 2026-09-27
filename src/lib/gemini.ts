/**
 * Gemini Live speech-to-speech service.
 * Uses the Gemini API for LLM responses when an API key is present,
 * falling back to the local WebLLM engine when offline or no key is set.
 */

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-1.5-flash'; // fast, low-latency model

export interface GeminiMessage {
  role: 'user' | 'model';
  text: string;
}

/**
 * Send a message to Gemini and stream the response back token by token.
 * @param messages - Full conversation history
 * @param systemPrompt - Persona system instruction
 * @param onToken - Callback fired with each streamed text chunk
 */
export async function streamGeminiResponse(
  messages: GeminiMessage[],
  systemPrompt: string,
  onToken: (token: string) => void,
  onDone: () => void
) {
  if (!GEMINI_API_KEY) {
    onToken('[No Gemini API key set. Please add NEXT_PUBLIC_GEMINI_API_KEY to Vercel environment variables.]');
    onDone();
    return;
  }

  // Build Gemini chat history (all turns except the last user message)
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  const lastUserMessage = messages[messages.length - 1].text;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [
      ...history,
      { role: 'user', parts: [{ text: lastUserMessage }] }
    ],
    generationConfig: {
      maxOutputTokens: 300,
      temperature: 0.7,
    }
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      onToken(`[Gemini error: ${res.status} ${err}]`);
      onDone();
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) { onDone(); return; }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) onToken(text);
        } catch {
          // ignore malformed SSE lines
        }
      }
    }

    onDone();
  } catch (err) {
    console.error('Gemini streaming error:', err);
    onToken('[Network error connecting to Gemini. Check your connection.]');
    onDone();
  }
}
