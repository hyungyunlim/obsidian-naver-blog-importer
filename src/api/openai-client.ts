import { requestUrl } from 'obsidian';
import { 
	OPENAI_MODELS_ENDPOINT, 
	OPENAI_CHAT_ENDPOINT,
	CONTENT_TYPES,
	OPENAI_MODEL_PREFIXES
} from '../constants';

export class OpenAIClient {
	constructor(private apiKey: string) {}

	async fetchModels(): Promise<string[]> {
		if (!this.apiKey) {
			return [];
		}

		try {
			const response = await requestUrl({
				url: OPENAI_MODELS_ENDPOINT,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${this.apiKey}`,
					'Content-Type': CONTENT_TYPES.json
				}
			});

			if (response.status === 200) {
				interface ModelData {
					id: string;
				}
				interface ModelsResponse {
					data: ModelData[];
				}
				const body = response.json as ModelsResponse;
				const models = body.data
					.map((model: ModelData) => model.id)
					.filter((id: string) =>
						OPENAI_MODEL_PREFIXES.some(prefix => id.startsWith(prefix))
					)
					.sort();

				return models;
			}
		} catch {
			// Return empty array if model fetch fails
		}
		
		return [];
	}

	async chat(
		messages: Array<{role: string, content: string}>, 
		maxTokens: number, 
		model: string
	): Promise<string> {
		const response = await requestUrl({
			url: OPENAI_CHAT_ENDPOINT,
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.apiKey}`,
				'Content-Type': CONTENT_TYPES.json
			},
			body: JSON.stringify({
				model: model,
				messages: messages,
				max_tokens: maxTokens,
				temperature: 0.3
			})
		});

		if (response.status === 200) {
			interface ChatResponse {
				choices: Array<{ message: { content: string } }>;
			}
			const body = response.json as ChatResponse;
			return body.choices[0].message.content.trim();
		} else {
			throw new Error(`OpenAI API error: ${response.status}`);
		}
	}
}