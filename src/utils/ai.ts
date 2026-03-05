export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AIProvider = 'chatgpt' | 'gemini' | 'claude' | 'deepseek';

// Tool calling support
export type OnToolCall = (name: string, args: Record<string, any>) => Promise<string>;

export async function sendAIMessageWithTools(
  provider: AIProvider,
  apiKey: string,
  messages: ChatMessage[],
  systemPrompt: string,
  toolDefs: any[],
  onToolCall: OnToolCall
): Promise<string> {
  if (!apiKey) throw new Error('No API key set. Please add your API key in Settings → AI Assistant.');

  switch (provider) {
    case 'chatgpt':
    case 'deepseek': {
      const url = provider === 'chatgpt'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://api.deepseek.com/chat/completions';
      const model = provider === 'chatgpt' ? 'gpt-4o-mini' : 'deepseek-chat';

      const tools = toolDefs.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));

      const apiMessages: any[] = [
        { role: 'system', content: systemPrompt },
        ...messages,
      ];

      let finalText = '';
      while (true) {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages: apiMessages, tools, tool_choice: 'auto' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || `Error ${res.status}`);

        const choice = data.choices[0];
        apiMessages.push(choice.message);

        if (choice.finish_reason === 'tool_calls') {
          const toolCalls = choice.message.tool_calls;
          for (const tc of toolCalls) {
            const args = JSON.parse(tc.function.arguments);
            const result = await onToolCall(tc.function.name, args);
            apiMessages.push({ role: 'tool', tool_call_id: tc.id, content: result });
          }
        } else {
          finalText = choice.message.content;
          break;
        }
      }
      return finalText;
    }

    case 'gemini': {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

      const functionDeclarations = toolDefs.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));

      let contents: any[] = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      let finalText = '';
      while (true) {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            tools: [{ functionDeclarations }],
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || `Error ${res.status}`);

        const candidate = data.candidates[0];
        const parts = candidate.content.parts;
        contents.push({ role: 'model', parts });

        const funcCalls = parts.filter((p: any) => p.functionCall);
        if (funcCalls.length > 0) {
          const resultParts: any[] = [];
          for (const p of funcCalls) {
            const result = await onToolCall(p.functionCall.name, p.functionCall.args);
            resultParts.push({
              functionResponse: { name: p.functionCall.name, response: { result } },
            });
          }
          contents.push({ role: 'user', parts: resultParts });
        } else {
          finalText = parts.find((p: any) => p.text)?.text || '';
          break;
        }
      }
      return finalText;
    }

    case 'claude': {
      const tools = toolDefs.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));

      let apiMessages: any[] = messages.map(m => ({ role: m.role, content: m.content }));

      let finalText = '';
      while (true) {
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
            messages: apiMessages,
            tools,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || `Error ${res.status}`);

        apiMessages.push({ role: 'assistant', content: data.content });

        if (data.stop_reason === 'tool_use') {
          const toolUses = data.content.filter((b: any) => b.type === 'tool_use');
          const resultBlocks: any[] = [];
          for (const tu of toolUses) {
            const result = await onToolCall(tu.name, tu.input);
            resultBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
          }
          apiMessages.push({ role: 'user', content: resultBlocks });
        } else {
          finalText = data.content.find((b: any) => b.type === 'text')?.text || '';
          break;
        }
      }
      return finalText;
    }

    default:
      throw new Error('Unknown provider');
  }
}

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
