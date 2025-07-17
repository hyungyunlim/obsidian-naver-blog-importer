import { requestUrl, Notice } from 'obsidian';
import { 
	GOOGLE_MODELS_ENDPOINT, 
	GOOGLE_GENERATE_CONTENT_ENDPOINT,
	CONTENT_TYPES,
	RETRY_DELAYS,
	calculateBackoffDelay
} from '../constants';

export class GoogleClient {
	constructor(private apiKey: string) {}

	async fetchModels(): Promise<string[]> {
		if (!this.apiKey) {
			return [];
		}

		try {
			const response = await requestUrl({
				url: `${GOOGLE_MODELS_ENDPOINT}?key=${this.apiKey}`,
				method: 'GET',
				headers: {
					'Content-Type': CONTENT_TYPES.json
				}
			});

			if (response.status === 200) {
				const models = response.json.models
					.filter((model: any) => {
						// Check if model supports generateContent
						const supportedMethods = model.supportedGenerationMethods || [];
						const hasGenerateContent = supportedMethods.includes('generateContent');
						
						// More flexible filtering - include all gemini models that support text generation
						const modelName = model.name.toLowerCase();
						const isGeminiModel = modelName.includes('gemini');
						const isTextModel = !modelName.includes('embedding') && 
							!modelName.includes('vision') && 
							!modelName.includes('code') && 
							!modelName.includes('image');
						
						return hasGenerateContent && isGeminiModel && isTextModel;
					})
					.map((model: any) => {
						// Remove 'models/' prefix and return clean model name
						const cleanName = model.name.replace('models/', '');
						return cleanName;
					})
					.sort();
				
				return models;
			}
		} catch (error) {
			console.error('Google models fetch error:', error);
		}
		
		return [];
	}

	async chat(
		messages: Array<{role: string, content: string}>, 
		maxTokens: number, 
		model: string
	): Promise<string> {
		// Convert messages format for Gemini
		const contents = messages.map(m => ({
			role: m.role === 'assistant' ? 'model' : 'user',
			parts: [{ text: m.content }]
		}));

		// Retry logic for 503 errors
		const maxRetries = 3;
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const response = await requestUrl({
					url: `${GOOGLE_GENERATE_CONTENT_ENDPOINT(model)}?key=${this.apiKey}`,
					method: 'POST',
					headers: {
						'Content-Type': CONTENT_TYPES.json
					},
					body: JSON.stringify({
						contents: contents,
						generationConfig: {
							maxOutputTokens: maxTokens,
							temperature: 0.3
						},
						systemInstruction: {
							parts: [{ text: "You are a helpful assistant. Respond directly and concisely without showing your thinking process or reasoning. Give only the final answer." }]
						}
					})
				});

				if (response.status === 200) {
					const data = response.json;
					
					// Check if response has candidates
					if (!data.candidates || data.candidates.length === 0) {
						console.error('Google API response missing candidates:', data);
						throw new Error('Google API response missing candidates');
					}
					
					const candidate = data.candidates[0];
					
					// Check if candidate has content
					if (!candidate.content) {
						console.error('Google API candidate missing content:', candidate);
						throw new Error('Google API candidate missing content');
					}
					
					// Handle MAX_TOKENS finish reason - response may be incomplete
					if (candidate.finishReason === 'MAX_TOKENS') {
						console.warn('Google API response was truncated due to MAX_TOKENS');
						if (!candidate.content.parts || candidate.content.parts.length === 0) {
							console.error('Google API response completely truncated - no usable content');
							throw new Error('Google API response completely truncated - try increasing maxTokens or reducing input size');
						}
					}
					
					if (!candidate.content.parts || candidate.content.parts.length === 0) {
						console.error('Google API candidate content missing parts:', candidate.content);
						throw new Error('Google API candidate content missing parts');
					}
					
					const text = candidate.content.parts[0].text;
					if (!text) {
						console.error('Google API content missing text:', candidate.content.parts[0]);
						throw new Error('Google API content missing text');
					}
					
					return text.trim();
				} else if (response.status === 503 && attempt < maxRetries) {
					// 503 Service Unavailable - retry with exponential backoff
					const delay = calculateBackoffDelay(attempt); // 2s, 4s, 8s
					console.warn(`Google API 503 error, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
					// Show retry notice
					const retryNotice = new Notice(`API 서버 과부하, ${delay/1000}초 후 재시도... (${attempt}/${RETRY_DELAYS.maxRetries})`, delay);
					await new Promise(resolve => setTimeout(resolve, delay));
					continue;
				} else {
					console.error('Google API error:', response.status, response.text);
					throw new Error(`Google API error: ${response.status} - ${response.text}`);
				}
			} catch (error) {
				if (attempt === maxRetries) {
					throw error;
				}
				console.warn(`Google API request failed (attempt ${attempt}/${maxRetries}):`, error);
				// Wait before retrying
				await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS.base * attempt));
			}
		}
		
		throw new Error('Google API: Maximum retries exceeded');
	}
}