export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AIProvider = 'chatgpt' | 'gemini' | 'claude' | 'deepseek';

export async function sendAIMessage(
  provider: AIProvider,
  apiKey: string,
  messages: ChatMessage[],
  systemPrompt: string
): Promise<string> {
  if (!apiKey) throw new Error('No API key set. Please add your API key in Settings → AI Assistant.');

  switch (provider) {
    case 'chatgpt':
    case 'deepseek': {
      const url =
        provider === 'chatgpt'
          ? 'https://api.openai.com/v1/chat/completions'
          : 'https://api.deepseek.com/chat/completions';
      const model = provider === 'chatgpt' ? 'gpt-4o-mini' : 'deepseek-chat';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `Error ${res.status}`);
      return data.choices[0].message.content;
    }

    case 'gemini': {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `Error ${res.status}`);
      return data.candidates[0].content.parts[0].text;
    }

    case 'claude': {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `Error ${res.status}`);
      return data.content[0].text;
    }

    default:
      throw new Error('Unknown provider');
  }
}
