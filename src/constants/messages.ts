/**
 * Static messages and prompts used throughout the application
 */

// AI prompts and instructions
export const AI_PROMPTS = {
	layoutFix: `⚠️ **중요**: 원문의 내용은 100% 그대로 유지하고, 오직 마크다운 형식과 레이아웃만 수정해주세요.

다음 네이버 블로그 글을 Obsidian용 마크다운으로 개선해주세요:

1. **제목 정리**: 적절한 헤딩 레벨(#, ##, ###)로 구조화
2. **문단 정리**: 긴 문단을 읽기 쉽게 분할하고 적절한 줄바꿈 추가
3. **목록 정리**: 목록은 깔끔한 - 또는 1. 형식으로 변환
4. **강조 정리**: 중요한 부분에 **굵게** 또는 *기울임* 적용
5. **링크 정리**: 마크다운 링크 형식 [텍스트](URL)로 변환
6. **이미지 정리**: 이미지 마크다운 형식 정리 및 캡션 추가
7. **코드 정리**: 코드 블록이 있다면 적절한 언어 태그와 함께 \`\`\` 형식으로
8. **불필요한 요소 제거**: 광고성 텍스트, 중복 줄바꿈, 이상한 기호 제거

**절대 원문 내용을 바꾸거나 삭제하지 마세요. 오직 형식과 레이아웃만 개선해주세요.**

내용:`,

	tagGeneration: `다음 블로그 글 내용을 바탕으로 적절한 태그를 3-7개 정도 생성해주세요. 
태그는 글의 주제, 기술, 키워드 등을 포함해야 하며, 한국어로 작성해주세요.
응답은 쉼표로 구분된 태그 목록만 제공해주세요. (예: 개발, 프로그래밍, 자바스크립트)

내용:`,

	excerptGeneration: `다음 블로그 글의 핵심 내용을 1-2문장으로 요약해주세요.
응답은 요약문만 제공해주세요.

내용:`
} as const;

// Placeholder texts
export const PLACEHOLDERS = {
	blogId: 'Blog ID (e.g., yonofbooks)',
	postUrl: 'Enter Naver Blog post URL...',
	apiKey: {
		openai: 'sk-...',
		anthropic: 'sk-ant-...',
		google: 'AIza...',
		ollama: 'http://localhost:11434'
	},
	folder: {
		default: 'Naver Blog Posts',
		image: 'Naver Blog Posts/attachments'
	},
	postLimit: '0'
} as const;

// Root folder display text
export const ROOT_FOLDER_DISPLAY = '(Root)';

// Type definitions
export type AIPromptKey = keyof typeof AI_PROMPTS;
export type PlaceholderKey = keyof typeof PLACEHOLDERS;