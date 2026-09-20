export interface AiServerStatus {
  available: boolean;
  provider: 'lmstudio' | 'ollama' | 'none';
  endpoint: string;
  modelName?: string;
  error?: string;
}

export class LocalAiClient {
  private defaultLmStudioUrl = 'http://127.0.0.1:1234/v1';
  private defaultOllamaUrl = 'http://127.0.0.1:11434';

  private normalizeUrl(url: string): string {
    let clean = url.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    return clean.replace(/\/+$/, '');
  }

  async checkStatus(customUrl?: string): Promise<AiServerStatus> {
    const rawUrl = customUrl ? this.normalizeUrl(customUrl) : this.defaultLmStudioUrl;

    // Generate candidate endpoints to test for LM Studio / OpenAI compatibility
    const candidates: string[] = [];
    if (rawUrl.endsWith('/v1')) {
      candidates.push(rawUrl);
      candidates.push(rawUrl.slice(0, -3));
    } else {
      candidates.push(`${rawUrl}/v1`);
      candidates.push(rawUrl);
    }

    // 1. Try LM Studio / OpenAI-compatible candidates
    for (const endpoint of candidates) {
      try {
        const response = await fetch(`${endpoint}/models`, {
          signal: AbortSignal.timeout(2500),
        });

        if (response.ok) {
          const data: any = await response.json();
          // Verify that data is OpenAI models structure: { data: [ { id: "..." } ] }
          if (Array.isArray(data?.data) && data.data.length > 0) {
            const modelName = data.data[0]?.id || 'Local LLM';
            return {
              available: true,
              provider: 'lmstudio',
              endpoint, // Save verified endpoint (e.g. http://127.0.0.1:1234/v1)
              modelName,
            };
          }
        }
      } catch {
        // Try next candidate
      }
    }

    // 2. Try Ollama fallback
    const ollamaCandidates = [rawUrl, this.defaultOllamaUrl];
    for (const endpoint of ollamaCandidates) {
      try {
        const response = await fetch(`${endpoint}/api/tags`, {
          signal: AbortSignal.timeout(2000),
        });

        if (response.ok) {
          const data: any = await response.json();
          if (Array.isArray(data?.models) && data.models.length > 0) {
            const modelName = data.models[0]?.name || 'Ollama Model';
            return {
              available: true,
              provider: 'ollama',
              endpoint,
              modelName,
            };
          }
        }
      } catch {
        // Try next
      }
    }

    return {
      available: false,
      provider: 'none',
      endpoint: rawUrl,
      error: 'No local AI server detected. Start LM Studio Local Server (port 1234) and load a model.',
    };
  }

  async generateSql(prompt: string, systemPrompt: string, customUrl?: string): Promise<string> {
    const status = await this.checkStatus(customUrl);
    if (!status.available) {
      throw new Error(status.error || 'Local AI server is not reachable.');
    }

    if (status.provider === 'lmstudio') {
      const response = await fetch(`${status.endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: status.modelName || 'local-model',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 400,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`LM Studio HTTP error (${response.status}): ${errText || response.statusText}`);
      }

      const data: any = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } else {
      // Ollama
      const response = await fetch(`${status.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: status.modelName,
          prompt: `${systemPrompt}\n\nUser Question: ${prompt}\n\nSQL:`,
          stream: false,
          options: { temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Ollama HTTP error (${response.status}): ${errText || response.statusText}`);
      }

      const data: any = await response.json();
      return data.response || '';
    }
  }
}
