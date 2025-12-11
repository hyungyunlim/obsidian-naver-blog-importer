import { NaverBlogSettings } from '../types';

export class AIProviderUtils {
	
	/**
	 * Gets the API key for the current AI provider
	 * @param settings Plugin settings containing API keys
	 * @returns The appropriate API key or empty string for providers that don't need keys
	 */
	static getApiKey(settings: NaverBlogSettings): string {
		switch (settings.aiProvider) {
			case 'openai': return settings.openaiApiKey;
			case 'anthropic': return settings.anthropicApiKey;
			case 'google': return settings.googleApiKey;
			case 'ollama': return ''; // Ollama doesn't need API key
			default: return '';
		}
	}

	/**
	 * Gets the default model for a specific AI provider
	 * @param provider The AI provider name
	 * @returns Default model name for the provider
	 */
	static getDefaultModelForProvider(provider: 'openai' | 'anthropic' | 'google' | 'ollama'): string {
		// Default models per provider
		switch (provider) {
			case 'openai': return 'gpt-4o-mini';
			case 'anthropic': return 'claude-3-haiku-20240307';
			case 'google': return 'gemini-2.5-flash';
			case 'ollama': return 'llama3.2:3b';
			default: return 'gpt-4o-mini';
		}
	}

	/**
	 * Gets the current model name from settings or fallback to default
	 * @param settings Plugin settings
	 * @returns Current model name
	 */
	static getModelName(settings: NaverBlogSettings): string {
		if (settings.aiModel) {
			return settings.aiModel;
		}
		
		return AIProviderUtils.getDefaultModelForProvider(settings.aiProvider);
	}

	/**
	 * Gets static list of available models for a provider
	 * @param provider The AI provider name
	 * @returns Array of model names
	 */
	static getStaticModels(provider: 'openai' | 'anthropic' | 'google' | 'ollama'): string[] {
		switch (provider) {
			case 'openai':
				return [
					'gpt-4o',
					'gpt-4o-mini',
					'gpt-4-turbo',
					'gpt-4',
					'gpt-3.5-turbo',
					'gpt-3.5-turbo-16k',
					'o1-preview',
					'o1-mini'
				];
			case 'anthropic':
				return [
					'claude-3-5-sonnet-20241022',
					'claude-3-5-haiku-20241022',
					'claude-3-opus-20240229',
					'claude-3-sonnet-20240229',
					'claude-3-haiku-20240307'
				];
			case 'google':
				return [
					'gemini-2.5-pro',
					'gemini-2.5-flash',
					'gemini-2.5-flash-lite-preview-06-17',
					'gemini-2.0-flash',
					'gemini-2.0-flash-lite',
					'gemini-1.5-pro',
					'gemini-1.5-pro-002',
					'gemini-1.5-flash',
					'gemini-1.5-flash-002',
					'gemini-1.5-flash-8b',
					'gemini-1.0-pro',
					'gemini-1.0-pro-001',
					'gemini-pro'
				];
			case 'ollama':
				return [
					'llama3.2:3b',
					'llama3.2:1b',
					'llama3.1:8b',
					'mistral:7b',
					'codellama:7b',
					'phi3:mini',
					'qwen2:7b'
				];
			default:
				return ['gpt-4o-mini'];
		}
	}

	/**
	 * Gets available models from cache and static fallback
	 * @param cache Cached models from API calls
	 * @param provider Current AI provider
	 * @returns Combined list of available models
	 */
	static getAvailableModels(
		cache: { openai_models: string[]; anthropic_models: string[]; google_models: string[] },
		provider: 'openai' | 'anthropic' | 'google' | 'ollama'
	): string[] {
		switch (provider) {
			case 'openai':
				return cache.openai_models.length > 0 ? cache.openai_models : AIProviderUtils.getStaticModels('openai');
			case 'anthropic':
				return cache.anthropic_models.length > 0 ? cache.anthropic_models : AIProviderUtils.getStaticModels('anthropic');
			case 'google':
				return cache.google_models.length > 0 ? cache.google_models : AIProviderUtils.getStaticModels('google');
			case 'ollama':
				return AIProviderUtils.getStaticModels('ollama');
			default:
				return AIProviderUtils.getStaticModels('openai');
		}
	}

	/**
	 * Validates if an AI provider is supported
	 * @param provider The provider to validate
	 * @returns True if the provider is supported
	 */
	static isSupportedProvider(provider: string): provider is 'openai' | 'anthropic' | 'google' | 'ollama' {
		return ['openai', 'anthropic', 'google', 'ollama'].includes(provider);
	}

	/**
	 * Gets the base URL for a provider's API
	 * @param provider The AI provider
	 * @param ollamaEndpoint Custom Ollama endpoint (if applicable)
	 * @returns API base URL
	 */
	static getProviderBaseUrl(provider: 'openai' | 'anthropic' | 'google' | 'ollama', ollamaEndpoint?: string): string {
		switch (provider) {
			case 'openai':
				return 'https://api.openai.com/v1';
			case 'anthropic':
				return 'https://api.anthropic.com/v1';
			case 'google':
				return 'https://generativelanguage.googleapis.com/v1beta';
			case 'ollama':
				return ollamaEndpoint || 'http://localhost:11434';
			default: {
				const unsupportedProvider: string = provider;
				throw new Error(`Unsupported AI provider: ${unsupportedProvider}`);
			}
		}
	}
}