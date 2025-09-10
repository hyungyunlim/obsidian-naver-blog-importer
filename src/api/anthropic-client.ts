import { requestUrl } from 'obsidian';
import { 
	ANTHROPIC_MODELS_ENDPOINT, 
	ANTHROPIC_MESSAGES_ENDPOINT,
	CONTENT_TYPES,
	API_VERSIONS
} from '../constants';

export class AnthropicClient {
	constructor(private apiKey: string) {}

	async fetchModels(): Promise<string[]> {
		if (!this.apiKey) {
			return [];
		}

		try {
			const response = await requestUrl({
				url: ANTHROPIC_MODELS_ENDPOINT,
				method: 'GET',
				headers: {
					'x-api-key': this.apiKey,
					'Content-Type': CONTENT_TYPES.json,
					'anthropic-version': API_VERSIONS.anthropic
				}
			});

			if (response.status === 200) {
				const models = response.json.data
					.map((model: any) => model.id)
					.filter((id: string) => id.startsWith('claude-'))
					.sort();
				
				return models;
			}
		} catch (error) {
			console.error('Anthropic models fetch error:', error);
		}
		
		return [];
	}

	async chat(
		messages: Array<{role: string, content: string}>, 
		maxTokens: number, 
		model: string
	): Promise<string> {
		// Convert messages format for Claude
		const systemMessage = messages.find(m => m.role === 'system')?.content || '';
		const userMessages = messages.filter(m => m.role !== 'system');
		
		const response = await requestUrl({
			url: ANTHROPIC_MESSAGES_ENDPOINT,
			method: 'POST',
			headers: {
				'x-api-key': this.apiKey,
				'Content-Type': CONTENT_TYPES.json,
				'anthropic-version': API_VERSIONS.anthropic
			},
			body: JSON.stringify({
				model: model,
				max_tokens: maxTokens,
				system: systemMessage,
				messages: userMessages
			})
		});

		if (response.status === 200) {
			return response.json.content[0].text.trim();
		} else {
			throw new Error(`Anthropic API error: ${response.status}`);
		}
	}
}