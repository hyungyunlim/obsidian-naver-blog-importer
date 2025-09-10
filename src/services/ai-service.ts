import { NaverBlogSettings } from '../types';
import { APIClientFactory } from '../api';
import { AIProviderUtils } from '../utils/ai-provider-utils';
import { AI_PROMPTS, AI_TOKEN_LIMITS } from '../constants';

export class AIService {
	constructor(private settings: NaverBlogSettings) {}

	async callAI(messages: Array<{role: string, content: string}>, maxTokens: number = 150): Promise<string> {
		const apiKey = APIClientFactory.getApiKey(this.settings);
		if (!apiKey) {
			throw new Error('No API key configured for selected AI provider');
		}

		const model = APIClientFactory.getModelName(this.settings);
		const client = APIClientFactory.createClient(this.settings);
		
		return await client.chat(messages, maxTokens, model);
	}

	getModelName(): string {
		return APIClientFactory.getModelName(this.settings);
	}

	getAvailableModels(cachedModels?: { openai_models?: string[]; anthropic_models?: string[]; google_models?: string[] }, provider?: 'openai' | 'anthropic' | 'google' | 'ollama'): string[] {
		const cache = {
			openai_models: cachedModels?.openai_models || [],
			anthropic_models: cachedModels?.anthropic_models || [],
			google_models: cachedModels?.google_models || []
		};
		return AIProviderUtils.getAvailableModels(cache, provider || this.settings.aiProvider);
	}
	
	getStaticModels(provider?: 'openai' | 'anthropic' | 'google' | 'ollama'): string[] {
		return AIProviderUtils.getStaticModels(provider || this.settings.aiProvider);
	}

	async fetchModelsFromAPI(provider: 'openai' | 'anthropic' | 'google'): Promise<string[]> {
		try {
			return await APIClientFactory.fetchModels(this.settings, provider);
		} catch (error) {
			return [];
		}
	}





	async callAIForLayoutFix(content: string): Promise<string> {
		try {
			const messages = [
				{
					role: 'user',
					content: `${AI_PROMPTS.layoutFix}

${content}`
				}
			];

			let fixedContent = await this.callAI(messages, AI_TOKEN_LIMITS.default);
			
			// Remove markdown code block wrappers if present
			if (fixedContent.startsWith('```markdown\n') && fixedContent.endsWith('\n```')) {
				fixedContent = fixedContent.substring(12, fixedContent.length - 4).trim();
			} else if (fixedContent.startsWith('```\n') && fixedContent.endsWith('\n```')) {
				fixedContent = fixedContent.substring(4, fixedContent.length - 4).trim();
			}
			
			return fixedContent;
			
		} catch (error) {
			
			// Re-throw with more specific error types
			if (error.message.includes('401') || error.message.includes('Invalid')) {
				throw new Error(`Invalid API key. Please check your ${this.settings.aiProvider.toUpperCase()} API key in settings.`);
			} else if (error.message.includes('quota') || error.message.includes('billing')) {
				throw new Error(`API quota exceeded. Please check your ${this.settings.aiProvider.toUpperCase()} billing.`);
			} else if (error.message.includes('network') || error.message.includes('fetch')) {
				throw new Error('Network error. Please check your internet connection.');
			} else {
				throw error;
			}
		}
	}




}