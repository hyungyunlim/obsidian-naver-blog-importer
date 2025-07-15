/**
 * AI model definitions and provider configurations
 */

// Default models for each provider
export const AI_PROVIDER_DEFAULTS = {
	openai: 'gpt-4o-mini',
	anthropic: 'claude-3-haiku-20240307',
	google: 'gemini-2.5-flash',
	ollama: 'llama3.2:3b'
} as const;

// OpenAI models
export const OPENAI_MODELS = [
	'gpt-4o',
	'gpt-4o-mini',
	'gpt-4-turbo',
	'gpt-4',
	'gpt-3.5-turbo',
	'gpt-3.5-turbo-16k',
	'o1-preview',
	'o1-mini'
] as const;

// Anthropic models
export const ANTHROPIC_MODELS = [
	'claude-3-5-sonnet-20241022',
	'claude-3-5-haiku-20241022',
	'claude-3-opus-20240229',
	'claude-3-sonnet-20240229',
	'claude-3-haiku-20240307'
] as const;

// Google models
export const GOOGLE_MODELS = [
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
] as const;

// Ollama models
export const OLLAMA_MODELS = [
	'llama3.2:3b',
	'llama3.2:1b',
	'llama3.1:8b',
	'mistral:7b',
	'codellama:7b',
	'phi3:mini',
	'qwen2:7b'
] as const;

// Model prefixes for validation
export const OPENAI_MODEL_PREFIXES = ['gpt-', 'o1-', 'text-', 'davinci-', 'curie-', 'babbage-', 'ada-'] as const;
export const ANTHROPIC_MODEL_PREFIX = 'claude-' as const;
export const GOOGLE_MODEL_PREFIXES = ['gemini-', 'palm-', 'chat-bison', 'text-bison'] as const;

// High-capability models that support larger token limits
export const HIGH_CAPABILITY_MODELS = [
	'gpt-4o',
	'gpt-4-turbo', 
	'gpt-4',
	'claude-3-5-sonnet-20241022',
	'claude-3-opus-20240229',
	'gemini-2.5-pro',
	'gemini-1.5-pro',
	'gemini-1.5-pro-002'
] as const;

// Type definitions
export type AIProvider = keyof typeof AI_PROVIDER_DEFAULTS;
export type OpenAIModel = typeof OPENAI_MODELS[number];
export type AnthropicModel = typeof ANTHROPIC_MODELS[number];
export type GoogleModel = typeof GOOGLE_MODELS[number];
export type OllamaModel = typeof OLLAMA_MODELS[number];
export type HighCapabilityModel = typeof HIGH_CAPABILITY_MODELS[number];