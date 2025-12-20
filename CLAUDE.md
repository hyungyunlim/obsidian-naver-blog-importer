# Naver Blog Plugin - Development Guide

## 프로젝트 개요
네이버 블로그, 카페, 뉴스 및 카카오 브런치 포스트를 옵시디언으로 가져오는 플러그인입니다. AI 기반 태그 생성, 요약 생성, 이미지 다운로드, 레이아웃 수정 기능을 제공합니다.

## 현재 아키텍처 구조

### 📁 디렉터리 구조
```
obsidian-naver-blog-plugin/
├── main.ts                          # 메인 플러그인 클래스
├── naver-blog-fetcher.ts            # 네이버 블로그 API 클라이언트
├── brunch-fetcher.ts                # 카카오 브런치 HTML 파서 (~400라인)
├── manifest.json                    # 플러그인 메타데이터
├── styles.css                       # 스타일시트
├── lang/                            # 다국어 지원
│   ├── en.json                     # 영어 번역
│   └── ko.json                     # 한국어 번역
└── src/                            # 모듈러 아키텍처
    ├── types/                      # 타입 정의
    │   ├── index.ts                # 타입 재수출
    │   ├── translations.ts         # 번역 인터페이스
    │   ├── settings.ts             # 설정 타입 및 기본값
    │   ├── blog.ts                 # 블로그 포스트 타입
    │   └── brunch.ts               # 브런치 포스트 타입 (~100라인)
    ├── constants/                  # 상수 정의
    │   ├── index.ts                # 상수 재수출
    │   ├── api-endpoints.ts        # API 엔드포인트 URL
    │   ├── brunch-endpoints.ts     # 브런치 상수 및 패턴 (~80라인)
    │   ├── ai-models.ts            # AI 모델 정의
    │   ├── default-values.ts       # 기본값 및 제한값
    │   ├── timeouts.ts             # 타임아웃 및 지연 설정
    │   ├── http-headers.ts         # HTTP 헤더 및 User-Agent
    │   ├── messages.ts             # 정적 메시지 및 AI 프롬프트
    │   └── regex-patterns.ts       # 정규표현식 패턴
    ├── services/                   # 비즈니스 로직 서비스
    │   ├── ai-service.ts           # AI 관련 로직 (500+ 라인)
    │   ├── blog-service.ts         # 블로그 데이터 처리 (150+ 라인)
    │   ├── brunch-service.ts       # 브런치 데이터 처리 (~180라인)
    │   └── image-service.ts        # 이미지 처리 (320+ 라인)
    ├── ui/                         # UI 컴포넌트
    │   ├── modals/                 # 모달 컴포넌트
    │   │   ├── import-modal.ts     # 통합 가져오기 모달 (블로그/카페/뉴스/브런치)
    │   │   ├── subscribe-modal.ts  # 블로그 구독 모달
    │   │   ├── single-post-modal.ts # 단일 포스트 모달
    │   │   └── folder-suggest-modal.ts # 폴더 선택 모달
    │   └── settings-tab.ts         # 설정 탭 (627라인)
    └── utils/                      # 유틸리티 함수
        ├── i18n.ts                 # 국제화 클래스 (300+ 라인)
        ├── locale-utils.ts         # 로케일 감지 및 언어 변경
        ├── content-utils.ts        # 콘텐츠 처리 및 변환
        ├── ai-provider-utils.ts    # AI 제공업체 관리
        └── settings-utils.ts       # 설정 유효성 검증
```

## 리팩터링 진행 상황

### ✅ 완료된 작업

#### 1단계: 타입 정의 분리 (2024년 작업)
- 모든 TypeScript 인터페이스를 `src/types/`로 분리
- 타입 안전성 향상 및 코드 중복 제거

#### 2단계: I18n 클래스 분리 (2024년 작업)  
- 국제화 로직을 `src/utils/i18n.ts`로 분리 (300+ 라인)
- 한국어/영어 번역 지원

#### 3단계: AI 서비스 분리 (2025년 1월)
- **분리된 기능들**:
  - `callAI()` - 모든 AI 제공업체 통합 호출
  - `getApiKey()`, `getModelName()` - API 키 및 모델 관리
  - `fetchModelsFromAPI()` - 동적 모델 목록 조회
  - `callAIForLayoutFix()` - 레이아웃 수정용 AI 호출
  - OpenAI, Anthropic, Google, Ollama 제공업체별 구현
- **절약**: ~500라인
- **이점**: AI 로직 독립화, 새 제공업체 추가 용이

#### 4단계: 블로그 서비스 분리 (2025년 1월)
- **분리된 기능들**:
  - `fetchNaverBlogPosts()` - 블로그 포스트 가져오기
  - `getExistingLogNos()` - 중복 체크용 로그 번호 수집  
  - `syncSubscribedBlogs()` - 구독 블로그 동기화
  - `importSinglePost()` - 단일 포스트 가져오기
- **절약**: ~125라인
- **이점**: 블로그 로직 집중화, 다른 플랫폼 확장 가능

#### 5단계: 이미지 처리 서비스 분리 (2025년 1월)
- **분리된 기능들**:
  - `downloadAndProcessImages()` - 이미지 다운로드 및 처리 (225라인)
  - `shouldDownloadImage()` - 이미지 필터링 로직 (100라인)
  - `convertToDirectImageUrl()` - 네이버 CDN URL 변환 (32라인)
  - `sanitizeFilename()` - 파일명 정리 (6라인)
- **절약**: ~363라인
- **이점**: 이미지 로직 독립화, 다른 CDN 지원 확장 가능

#### 6단계: UI 모달 컴포넌트 분리 (2025년 1월)
- **분리된 기능들**:
  - `NaverBlogImportModal` - 블로그 가져오기 모달 (155라인)
  - `NaverBlogSubscribeModal` - 블로그 구독 모달 (83라인)
  - `NaverBlogSinglePostModal` - 단일 포스트 가져오기 모달 (138라인)
  - `FolderSuggestModal` - 폴더 선택 모달 (73라인)
  - `NaverBlogSettingTab` - 설정 탭 (627라인)
- **절약**: ~1,076라인
- **이점**: UI 로직 독립화, 모달 재사용성 향상, 유지보수성 개선

#### 7단계: 유틸리티 함수 분리 (2025년 1월)
- **분리된 기능들**:
  - `LocaleUtils` - 로케일 감지 및 언어 변경 리스너 (2개 함수)
  - `ContentUtils` - 콘텐츠 처리 및 프론트매터 관리 (5개 함수)
  - `AIProviderUtils` - AI 제공업체 관리 및 모델 처리 (7개 함수)
  - `SettingsUtils` - 설정 유효성 검증 및 정규화 (7개 함수)
- **절약**: ~159라인
- **이점**: 순수 함수 독립화, 테스트 용이성, 재사용성 향상

#### 8단계: 상수 및 설정 분리 (2025년 1월) ✅
- **분리된 기능들**:
  - `api-endpoints.ts` - 모든 API URL 및 엔드포인트 (36라인)
  - `ai-models.ts` - AI 모델 정의 및 제공업체 설정 (85라인)
  - `default-values.ts` - 기본값, 제한값, UI 기본 설정 (32라인)
  - `timeouts.ts` - 타임아웃, 지연, 재시도 설정 (35라인)
  - `http-headers.ts` - HTTP 헤더, User-Agent 설정 (25라인)
  - `messages.ts` - 정적 메시지, AI 프롬프트, 플레이스홀더 (75라인)
  - `regex-patterns.ts` - 정규표현식 패턴 및 필터링 규칙 (65라인)
  - `index.ts` - 모든 상수의 중앙 집중식 재수출 (10라인)
- **절약**: ~50+ 하드코딩된 값들을 상수로 대체
- **이점**: 유지보수성 향상, 일관성 보장, 중복 제거, 설정 중앙화

### 📊 리팩터링 성과

| 구분 | 이전 | 현재 | 절약 |
|------|------|------|------|
| main.ts | 2,969라인 | **801라인** | **~2,168라인** |
| 분리된 서비스 | 0개 | **6개** | - |
| 분리된 UI 컴포넌트 | 0개 | **5개** | - |
| 분리된 유틸리티 | 0개 | **4개** | - |
| 분리된 상수 | 0개 | **8개** | - |
| 총 모듈 수 | 1개 | **26개** | - |

**총 절약 라인 수**: ~2,168라인 (73% 감소)

### 🎉 주요 성과

#### 📏 코드 크기 최적화
- **main.ts 크기**: 2,969라인 → **801라인** (73% 감소)
- **모듈화**: 단일 파일 → **26개 전문 모듈**
- **평균 모듈 크기**: ~100라인 (유지보수 최적화)

#### 🏗️ 아키텍처 개선
- **관심사 분리**: 비즈니스 로직, UI, 유틸리티, 상수 완전 분리
- **의존성 역전**: 서비스 간 느슨한 결합
- **단일 책임**: 각 모듈이 하나의 명확한 역할
- **재사용성**: 유틸리티 함수 및 상수 독립화
- **설정 중앙화**: 하드코딩된 값들의 중앙 집중식 관리

#### 🔧 개발 경험 향상
- **타입 안전성**: 정적 타입 검증 강화
- **테스트 용이성**: 모듈별 독립 테스트 가능
- **확장성**: 새 기능 추가 시 최소 영향
- **유지보수성**: 버그 수정 범위 최소화

### 🏗️ 서비스 아키텍처

#### AIService
```typescript
class AIService {
  async callAI(messages, maxTokens): Promise<string>
  getApiKey(): string
  getModelName(): string
  async fetchModelsFromAPI(provider): Promise<string[]>
  async callAIForLayoutFix(content): Promise<string>
  // 제공업체별 구현: OpenAI, Anthropic, Google, Ollama
}
```

#### BlogService  
```typescript
class BlogService {
  async fetchNaverBlogPosts(blogId, maxPosts): Promise<ProcessedBlogPost[]>
  async getExistingLogNos(): Promise<Set<string>>
  async syncSubscribedBlogs(): Promise<void>
  async importSinglePost(blogId, logNo): Promise<void>
}
```

#### ImageService
```typescript
class ImageService {
  async downloadAndProcessImages(content, logNo): Promise<string>
  shouldDownloadImage(imageUrl, altText): boolean
  convertToDirectImageUrl(url): string
  sanitizeFilename(filename): string
}
```

### 🔧 상수 아키텍처

#### Constants Structure
```typescript
// src/constants/api-endpoints.ts
export const OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const ANTHROPIC_MESSAGES_ENDPOINT = `${ANTHROPIC_BASE_URL}/messages`;
export const GOOGLE_GENERATE_CONTENT_ENDPOINT = (model: string) => 
  `${GOOGLE_BASE_URL}/models/${model}:generateContent`;

// src/constants/ai-models.ts
export const AI_PROVIDER_DEFAULTS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku-20240307',
  google: 'gemini-2.5-flash',
  ollama: 'llama3.2:3b'
} as const;

// src/constants/default-values.ts
export const DEFAULT_BLOG_POST_COUNT = 10;
export const MAX_POST_IMPORT_LIMIT = 1000;
export const AI_TOKEN_LIMITS = {
  default: 4000,
  pro: 10000
} as const;

// src/constants/timeouts.ts
export const NOTICE_TIMEOUTS = {
  short: 2000,
  medium: 5000,
  long: 10000
} as const;

// src/constants/messages.ts
export const AI_PROMPTS = {
  layoutFix: `⚠️ **중요**: 원문의 내용은 100% 그대로 유지하고...`,
  tagGeneration: `다음 블로그 글 내용을 바탕으로 적절한 태그를...`,
  excerptGeneration: `다음 블로그 글의 핵심 내용을 1-2문장으로...`
} as const;

// src/constants/regex-patterns.ts
export const IMAGE_PATTERNS = {
  markdown: /!\[([^\]]*)\]\(([^)]+)\)/g,
  invalidChars: /[<>:"/\\|?*]/g
} as const;

export const SKIP_IMAGE_PATTERNS = [
  /se-sticker/i, /se-emoticon/i, /\.gif$/i, /loading/i
] as const;
```

### 🔧 유틸리티 아키텍처

#### LocaleUtils
```typescript
class LocaleUtils {
  static detectLocale(): string
  static setupLanguageChangeListener(app, i18n, registerCleanup): void
}
```

#### ContentUtils
```typescript
class ContentUtils {
  static createFrontmatter(post, sanitizeFilename): string
  static cleanContentForAI(content): string
  static extractFrontmatter(content): { frontmatter: string; body: string }
  static reconstructMarkdown(frontmatter, body): string
  static isContentValidForAI(content, minLength?): boolean
}
```

#### AIProviderUtils
```typescript
class AIProviderUtils {
  static getApiKey(settings): string
  static getDefaultModelForProvider(provider): string
  static getModelName(settings): string
  static getStaticModels(provider): string[]
  static getAvailableModels(cache, provider): string[]
  static isSupportedProvider(provider): boolean
  static getProviderBaseUrl(provider, ollamaEndpoint?): string
}
```

#### SettingsUtils
```typescript
class SettingsUtils {
  static validateAndNormalizeSettings(settings): NaverBlogSettings
  static isValidFolderPath(folderPath): boolean
  static validatePostImportLimit(limit): number
  static isSupportedAIProvider(provider): boolean
  static isValidApiKeyFormat(provider, apiKey): boolean
  static sanitizeBlogId(blogId): string
  static isValidBlogId(blogId): boolean
}
```

### 🎯 UI 컴포넌트 아키텍처

#### Modal Components
- **NaverBlogImportModal** - 블로그 전체 가져오기, 진행률 표시, 취소 기능
- **NaverBlogSubscribeModal** - 블로그 구독 추가, 입력 유효성 검증
- **NaverBlogSinglePostModal** - 단일 포스트 가져오기, URL/LogNo 파싱
- **FolderSuggestModal** - 폴더 선택, 필터링, 자동완성

#### Settings Component
- **NaverBlogSettingTab** - 모든 플러그인 설정 관리, 동적 UI 업데이트

## 다음 리팩터링 계획

### 🎯 9순위: API 통신 함수 분리 (예정)
- **대상**: ~300-400라인
- **분리 파일들**:
  - `src/utils/api-utils.ts` - 공통 API 호출 유틸리티
  - `src/api/openai-client.ts` - OpenAI API 클라이언트
  - `src/api/anthropic-client.ts` - Anthropic API 클라이언트
  - `src/api/google-client.ts` - Google API 클라이언트
  - `src/api/ollama-client.ts` - Ollama API 클라이언트

### 🎯 최종 목표
- **main.ts 크기**: 현재 801라인 → **목표 ~400라인**
- **역할**: 플러그인 초기화 및 서비스 코디네이션만 담당
- **총 모듈 수**: 현재 26개 → 목표 ~35개

## 주요 기능

### 🤖 AI 기능
- **지원 제공업체**: OpenAI, Anthropic, Google, Ollama
- **기능**: 태그 생성, 요약 생성, 레이아웃 수정
- **동적 모델 조회**: API를 통한 실시간 모델 목록 업데이트

### 📝 블로그 가져오기
- **네이버 블로그**: 전체/단일 포스트 가져오기
- **네이버 카페**: 카페 게시글 가져오기 (쿠키 인증 지원)
- **네이버 뉴스**: 뉴스 기사 가져오기
- **카카오 브런치**: 브런치 포스트 가져오기 (HTML 파싱)
- **구독 시스템**: 여러 블로그 자동 동기화
- **중복 체크**: logNo/postId 기반 중복 방지
- **가져오기 제한**: 관리자 설정 가능 (0-1000개)

### 🥐 브런치 가져오기 (신규)
- **단일 포스트**: `https://brunch.co.kr/@username/postId` URL 지원
- **작가 전체**: `https://brunch.co.kr/@username` 작가 페이지 전체 가져오기
- **콘텐츠 파싱**: text, image, hr, quotation, video, opengraph 타입 지원
- **메타데이터**: 시리즈 정보, 좋아요/댓글 수, 키워드 태그 추출
- **이미지 다운로드**: daumcdn.net 이미지 로컬 저장
- **저장 위치**: `Brunch Posts/@username/` 폴더에 저장

### 🖼️ 이미지 처리  
- **자동 다운로드**: 네이버 CDN 이미지 로컬 저장
- **지능형 필터링**: UI 요소, 애니메이션 GIF 자동 제외
- **URL 변환**: 다양한 네이버 CDN 형식 지원
- **상대 경로**: 옵시디언 볼트 구조에 맞는 경로 생성

### 🌐 다국어 지원
- **지원 언어**: 한국어, 영어
- **동적 로딩**: 옵시디언 언어 설정 자동 감지
- **번역 파일**: JSON 기반 번역 시스템

## 개발 가이드

### 빌드 명령어
```bash
npm run build          # TypeScript 컴파일 + esbuild 번들링
npm run dev            # 개발 모드 (watch)
```

### 서비스 추가 방법
1. `src/services/` 에 새 서비스 파일 생성
2. `main.ts`에서 서비스 import 및 초기화
3. `saveSettings()`에서 서비스 설정 업데이트 추가

### 상수 추가 방법
1. `src/constants/` 의 적절한 파일에 상수 추가
2. 필요시 새로운 상수 파일 생성 후 `index.ts`에서 재수출
3. 기존 하드코딩된 값들을 상수로 대체
4. TypeScript 타입 정의 함께 제공 (`as const`, `type` 정의)

### 번역 추가 방법  
1. `lang/en.json`, `lang/ko.json`에 키 추가
2. `src/types/translations.ts`에 인터페이스 업데이트
3. `src/utils/i18n.ts`에 빌트인 번역 추가

## 기술 스택
- **언어**: TypeScript
- **빌드**: esbuild
- **타입 체크**: tsc  
- **플랫폼**: Obsidian Plugin API
- **AI 통합**: OpenAI, Anthropic, Google, Ollama APIs
- **웹 요청**: Obsidian requestUrl API

## 성능 최적화
- **지연 로딩**: 서비스별 독립적 초기화
- **캐싱**: AI 모델 목록 캐싱  
- **배치 처리**: 이미지 다운로드 순차 처리
- **오류 복구**: 네트워크 오류 시 대체 방법 시도

## 보안 고려사항
- **API 키 관리**: 플러그인 설정에 암호화 저장
- **URL 검증**: 이미지 다운로드 시 안전한 도메인만 허용
- **파일명 정리**: 악성 파일명 방지를 위한 sanitization
- **네트워크**: HTTPS만 사용, 적절한 User-Agent 설정