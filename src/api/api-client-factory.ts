import { NaverBlogSettings } from '../types';
import { OpenAIClient } from './openai-client';
import { AnthropicClient } from './anthropic-client';
import { GoogleClient } from './google-client';
import { OllamaClient } from './ollama-client';
import { AIProviderUtils } from '../utils/ai-provider-utils';

export interface APIClient {
	chat(messages: Array<{role: string, content: string}>, maxTokens: number, model: string): Promise<string>;
	fetchModels?(): Promise<string[]>;
}

export class APIClientFactory {
	static createClient(settings: NaverBlogSettings): APIClient {
		const provider = settings.aiProvider;
		
		switch (provider) {
			case 'openai':
				return new OpenAIClient(settings.openaiApiKey);
			case 'anthropic':
				return new AnthropicClient(settings.anthropicApiKey);
			case 'google':
				return new GoogleClient(settings.googleApiKey);
			case 'ollama':
				return new OllamaClient(settings.ollamaEndpoint);
			default:
				throw new Error(`Unsupported AI provider: ${String(provider)}`)
		}
	}

	static async fetchModels(settings: NaverBlogSettings, provider?: 'openai' | 'anthropic' | 'google'): Promise<string[]> {
		const targetProvider = provider || settings.aiProvider;
		
		// Ollama doesn't support model fetching
		if (targetProvider === 'ollama') {
			return [];
		}

		const client = this.createClient({
			...settings,
			aiProvider: targetProvider
		});

		if (!client.fetchModels) {
			return [];
		}

		return await client.fetchModels();
	}

	static getApiKey(settings: NaverBlogSettings): string {
		return AIProviderUtils.getApiKey(settings);
	}

	static getModelName(settings: NaverBlogSettings): string {
		return AIProviderUtils.getModelName(settings);
	}
}