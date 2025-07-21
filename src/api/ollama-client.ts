import { requestUrl } from 'obsidian';
import { CONTENT_TYPES } from '../constants';

export class OllamaClient {
	constructor(private endpoint: string) {}

	async chat(
		messages: Array<{role: string, content: string}>, 
		maxTokens: number, 
		model: string
	): Promise<string> {
		const response = await requestUrl({
			url: `${this.endpoint}/api/chat`,
			method: 'POST',
			headers: {
				'Content-Type': CONTENT_TYPES.json
			},
			body: JSON.stringify({
				model: model,
				messages: messages,
				stream: false,
				options: {
					num_predict: maxTokens,
					temperature: 0.3
				}
			})
		});

		if (response.status === 200) {
			return response.json.message.content.trim();
		} else {
			throw new Error(`Ollama API error: ${response.status}`);
		}
	}
}