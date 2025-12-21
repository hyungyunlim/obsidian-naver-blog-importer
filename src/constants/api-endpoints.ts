/**
 * API endpoints and URLs used throughout the application
 */

// OpenAI API endpoints
export const OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const OPENAI_MODELS_ENDPOINT = `${OPENAI_BASE_URL}/models`;
export const OPENAI_CHAT_ENDPOINT = `${OPENAI_BASE_URL}/chat/completions`;

// Anthropic API endpoints
export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
export const ANTHROPIC_MODELS_ENDPOINT = `${ANTHROPIC_BASE_URL}/models`;
export const ANTHROPIC_MESSAGES_ENDPOINT = `${ANTHROPIC_BASE_URL}/messages`;

// Google AI API endpoints
export const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const GOOGLE_MODELS_ENDPOINT = `${GOOGLE_BASE_URL}/models`;
export const GOOGLE_GENERATE_CONTENT_ENDPOINT = (model: string) => 
	`${GOOGLE_BASE_URL}/models/${model}:generateContent`;

// Ollama API endpoints
export const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';
export const OLLAMA_CHAT_PATH = '/api/chat';
export const getOllamaEndpoint = (baseUrl: string = DEFAULT_OLLAMA_ENDPOINT) => 
	`${baseUrl}${OLLAMA_CHAT_PATH}`;

// Naver Blog API endpoints
export const NAVER_BLOG_BASE_URL = 'https://blog.naver.com';
export const NAVER_BLOG_POST_LIST_URL = `${NAVER_BLOG_BASE_URL}/PostList.naver`;
export const NAVER_BLOG_POST_URL_TEMPLATE = (blogId: string, logNo: string) => 
	`${NAVER_BLOG_BASE_URL}/${blogId}/${logNo}`;

// Naver CDN endpoints
export const NAVER_CDN_POSTFILES = 'postfiles';
export const NAVER_CDN_BLOGFILES = 'blogfiles';
export const NAVER_PROFILE_IMAGE_PATH = 'ssl.pstatic.net/static/blog/profile/';

// Naver Video API endpoints
export const NAVER_VIDEO_API_BASE = 'https://apis.naver.com/rmcnmv/rmcnmv/vod/play/v2.0';
export const NAVER_VIDEO_API_ENDPOINT = (vid: string, inkey: string, sid = 5) =>
	`${NAVER_VIDEO_API_BASE}/${vid}?key=${inkey}&sid=${sid}`;

// Naver Cafe Article API endpoints
export const NAVER_CAFE_ARTICLE_API_BASE = 'https://article.cafe.naver.com/gw/v4/cafes';
export const NAVER_CAFE_ARTICLE_ENDPOINT = (cafeId: string, articleId: string) =>
	`${NAVER_CAFE_ARTICLE_API_BASE}/${cafeId}/articles/${articleId}`;

// Naver Blog Tag API endpoint
export const NAVER_BLOG_TAG_API_ENDPOINT = (blogId: string, logNoList: string) =>
	`${NAVER_BLOG_BASE_URL}/BlogTagListInfo.naver?blogId=${blogId}&logNoList=${logNoList}&logType=mylog`;