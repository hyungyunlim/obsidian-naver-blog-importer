# 네이버 카페 크롤링 기능 스펙 문서

## 1. 개요

### 1.1 목적
기존 네이버 블로그 가져오기 플러그인에 네이버 카페 게시글 크롤링 기능을 추가하여, 사용자가 카페 게시글도 옵시디언으로 가져올 수 있도록 한다.

### 1.2 참조 코드 분석
- **출처**: https://github.com/dev-jaemin/Naver-Cafe-Crawling
- **기술 스택**: Python + Selenium + Chrome Driver
- **핵심 로직**:
  - 수동 로그인 (CAPTCHA 우회 불가)
  - 게시판별 게시글 ID 수집 → 개별 게시글 크롤링
  - 댓글 수집 및 MBTI 데이터 전처리
  - 배치 처리 (100개 단위 DB 저장)

### 1.3 Obsidian 플러그인 제약사항
| 제약사항 | 설명 | 대안 |
|----------|------|------|
| Selenium 사용 불가 | Obsidian은 Node.js 환경, 브라우저 자동화 불가 | `requestUrl` API 사용 |
| 브라우저 자동화 불가 | 헤드리스 브라우저 실행 불가 | HTTP 요청 기반 크롤링 |
| 로그인 세션 유지 어려움 | 네이버 CAPTCHA 및 보안 정책 | 쿠키 기반 인증 또는 공개 카페만 지원 |

---

## 2. 기능 요구사항

### 2.1 핵심 기능

#### 2.1.1 카페 게시글 가져오기
- **공개 카페**: 로그인 없이 게시글 크롤링
- **비공개/회원 카페**: 쿠키 기반 인증으로 게시글 크롤링
- **단일 게시글**: URL 또는 articleId로 특정 게시글 가져오기
- **게시판별 가져오기**: 특정 게시판의 게시글 목록 가져오기

#### 2.1.2 지원 콘텐츠 타입
- 텍스트 (본문)
- 이미지 (다운로드 및 로컬 저장)
- 댓글 (선택적)
- 첨부 파일 (링크만 보존)
- 임베드 콘텐츠 (플레이스홀더)

#### 2.1.3 메타데이터 보존
- 게시글 제목, 작성일, 작성자
- 카페명, 게시판명
- 조회수, 댓글수, 좋아요수
- 태그 (있는 경우)

### 2.2 설정 옵션

```typescript
interface NaverCafeSettings {
  // 인증
  naverCookie: string;           // NID_AUT, NID_SES 쿠키값

  // 가져오기 옵션
  cafeImportFolder: string;      // 저장 폴더
  includeComments: boolean;      // 댓글 포함 여부
  downloadImages: boolean;       // 이미지 다운로드 여부

  // 필터링
  excludeNotice: boolean;        // 공지 제외
  excludeRecommended: boolean;   // 추천글 제외
  minContentLength: number;      // 최소 콘텐츠 길이

  // 구독
  subscribedCafes: CafeSubscription[];
}

interface CafeSubscription {
  cafeId: string;         // 카페 ID (숫자)
  cafeName: string;       // 카페 이름
  menuIds: number[];      // 구독할 게시판 ID 목록 (빈 배열 = 전체)
  postCount: number;      // 가져올 게시글 수
}
```

---

## 3. 기술 설계

### 3.1 네이버 카페 API 분석

#### 3.1.1 게시글 목록 조회
```
GET https://cafe.naver.com/ArticleList.nhn
Parameters:
  - search.clubid={cafeId}
  - search.menuid={menuId}
  - search.page={page}
  - search.perPage=50
```

#### 3.1.2 게시글 상세 조회
```
GET https://cafe.naver.com/ArticleRead.nhn
Parameters:
  - clubid={cafeId}
  - articleid={articleId}

또는 모바일 API:
GET https://m.cafe.naver.com/ca-fe/web/cafes/{cafeId}/articles/{articleId}
```

#### 3.1.3 필요한 쿠키
```
NID_AUT: 네이버 인증 쿠키
NID_SES: 네이버 세션 쿠키
```

### 3.2 아키텍처

```
src/
├── services/
│   └── cafe-service.ts          # 카페 비즈니스 로직
├── fetchers/
│   └── naver-cafe-fetcher.ts    # 카페 API 클라이언트
├── ui/
│   └── modals/
│       ├── cafe-import-modal.ts      # 카페 가져오기 모달
│       ├── cafe-subscribe-modal.ts   # 카페 구독 모달
│       └── cafe-single-post-modal.ts # 단일 게시글 모달
└── types/
    └── cafe.ts                  # 카페 관련 타입 정의
```

### 3.3 클래스 설계

#### 3.3.1 NaverCafeFetcher
```typescript
class NaverCafeFetcher {
  constructor(cafeId: string, cookie?: string);

  // 게시글 목록 조회
  async getArticleList(menuId?: number, page?: number): Promise<CafeArticle[]>;

  // 단일 게시글 조회
  async getArticle(articleId: string): Promise<CafeArticleDetail>;

  // 게시판 목록 조회
  async getMenuList(): Promise<CafeMenu[]>;

  // 댓글 조회
  async getComments(articleId: string): Promise<CafeComment[]>;
}
```

#### 3.3.2 CafeService
```typescript
class CafeService {
  constructor(
    app: App,
    settings: NaverCafeSettings,
    createMarkdownFile: (post: ProcessedCafePost) => Promise<void>
  );

  // 카페 게시글 가져오기
  async fetchCafeArticles(cafeId: string, menuId?: number): Promise<ProcessedCafePost[]>;

  // 구독 카페 동기화
  async syncSubscribedCafes(): Promise<void>;

  // 단일 게시글 가져오기
  async importSingleArticle(cafeId: string, articleId: string): Promise<void>;
}
```

### 3.4 데이터 타입

```typescript
interface CafeArticle {
  articleId: string;
  title: string;
  writerNickname: string;
  writerId: string;
  writeDate: string;
  viewCount: number;
  commentCount: number;
  likeCount: number;
  menuId: number;
  menuName: string;
  isNotice: boolean;
  isRecommended: boolean;
}

interface CafeArticleDetail extends CafeArticle {
  content: string;           // HTML 또는 마크다운
  images: string[];          // 이미지 URL 목록
  attachments: Attachment[]; // 첨부 파일
  comments?: CafeComment[];  // 댓글 (옵션)
  tags: string[];            // 태그
}

interface CafeComment {
  commentId: string;
  content: string;
  writerNickname: string;
  writeDate: string;
  isReply: boolean;          // 대댓글 여부
  parentCommentId?: string;  // 부모 댓글 ID
}

interface ProcessedCafePost {
  title: string;
  content: string;           // 마크다운 변환된 콘텐츠
  date: string;
  articleId: string;
  cafeId: string;
  cafeName: string;
  menuName: string;
  author: string;
  url: string;
  tags: string[];
  excerpt?: string;
}
```

---

## 4. 구현 계획

### 4.1 Phase 1: 기본 크롤링 (MVP)

#### 4.1.1 공개 카페 지원
- requestUrl을 통한 HTML 파싱
- 게시글 목록 및 상세 내용 추출
- 마크다운 변환 (기존 블로그 로직 재사용)

#### 4.1.2 UI 구현
- 카페 URL 입력 모달
- 단일 게시글 가져오기 모달
- 설정 탭 확장

### 4.2 Phase 2: 인증 및 고급 기능

#### 4.2.1 쿠키 기반 인증
- 사용자가 브라우저에서 쿠키 복사
- 설정에서 쿠키 입력 및 저장
- 비공개 카페 접근

#### 4.2.2 게시판별 가져오기
- 게시판 목록 조회
- 특정 게시판 선택하여 가져오기

### 4.3 Phase 3: 구독 및 동기화

#### 4.3.1 카페 구독
- 여러 카페/게시판 구독
- 주기적 동기화

#### 4.3.2 댓글 지원
- 댓글 크롤링
- 마크다운으로 댓글 포함

---

## 5. 리스크 및 고려사항

### 5.1 기술적 리스크

| 리스크 | 영향도 | 대응 방안 |
|--------|--------|-----------|
| 네이버 API 변경 | 높음 | 버전 관리, 에러 핸들링 강화 |
| 비공개 카페 접근 제한 | 중간 | 쿠키 인증 방식 구현 |
| 레이트 리밋 | 중간 | 요청 간 딜레이, 배치 처리 |
| HTML 구조 변경 | 높음 | 여러 파서 패턴 준비 |

### 5.2 법적/윤리적 고려사항

- **이용약관**: 네이버 카페 이용약관 준수
- **개인정보**: 작성자 정보 처리 주의
- **저작권**: 콘텐츠 저작권 보호 안내
- **봇 정책**: robots.txt 및 크롤링 정책 확인

### 5.3 사용자 경험 고려사항

- 쿠키 입력 방법 상세 안내 필요
- 공개/비공개 카페 구분 명확히
- 에러 메시지 친절하게

---

## 6. 블로그 vs 카페 비교

| 항목 | 네이버 블로그 | 네이버 카페 |
|------|--------------|-------------|
| 접근성 | 대부분 공개 | 공개/회원/비공개 혼재 |
| 인증 필요 | 거의 불필요 | 회원 카페는 필요 |
| URL 구조 | blog.naver.com/{blogId}/{logNo} | cafe.naver.com/{cafeName}/{articleId} |
| 콘텐츠 구조 | se-component 기반 | 유사하나 다른 클래스명 |
| 게시판 개념 | 카테고리 | 메뉴 (menuId) |
| 댓글 | 기본 지원 | 대댓글 구조 |

---

## 7. 예상 파일 구조

```
src/
├── types/
│   ├── index.ts                 # 기존 + 카페 타입 재수출
│   └── cafe.ts                  # 카페 전용 타입 ⭐ 신규
├── constants/
│   ├── index.ts                 # 기존 + 카페 상수 재수출
│   └── cafe-endpoints.ts        # 카페 API 엔드포인트 ⭐ 신규
├── services/
│   ├── blog-service.ts          # 기존
│   ├── cafe-service.ts          # 카페 서비스 ⭐ 신규
│   ├── ai-service.ts            # 기존 (공유)
│   └── image-service.ts         # 기존 (공유)
├── fetchers/
│   └── naver-cafe-fetcher.ts    # 카페 API 클라이언트 ⭐ 신규
├── ui/
│   ├── modals/
│   │   ├── import-modal.ts           # 기존
│   │   ├── cafe-import-modal.ts      # 카페 가져오기 ⭐ 신규
│   │   ├── cafe-subscribe-modal.ts   # 카페 구독 ⭐ 신규
│   │   └── cafe-single-post-modal.ts # 단일 게시글 ⭐ 신규
│   └── settings-tab.ts          # 기존 (확장)
└── utils/
    ├── content-utils.ts         # 기존 (확장)
    └── cafe-parser-utils.ts     # 카페 HTML 파서 ⭐ 신규
```

---

## 8. 예상 UI 흐름

### 8.1 단일 게시글 가져오기
```
1. 커맨드 팔레트 → "Import Naver Cafe Article"
2. 카페 URL 또는 articleId 입력
   예: https://cafe.naver.com/mycafe/12345
       또는 cafeId:12345, articleId:67890
3. 게시글 미리보기 (선택)
4. 가져오기 실행
5. 마크다운 파일 생성 → 자동 열기
```

### 8.2 카페 구독
```
1. 설정 → 네이버 카페 섹션
2. "카페 추가" 버튼
3. 카페 URL 입력 → 게시판 목록 조회
4. 구독할 게시판 선택
5. 가져올 게시글 수 설정
6. 저장
```

### 8.3 구독 동기화
```
1. 커맨드 팔레트 → "Sync Subscribed Cafes"
2. 각 카페별 진행률 표시
3. 새 게시글만 가져오기 (중복 체크)
4. 완료 알림
```

---

## 9. 마크다운 출력 예시

```markdown
---
title: "게시글 제목"
date: 2025-01-15
author: "닉네임"
cafeId: "12345678"
articleId: "987654321"
cafeName: "카페 이름"
menuName: "자유게시판"
url: "https://cafe.naver.com/mycafe/987654321"
tags:
  - 태그1
  - 태그2
viewCount: 1234
commentCount: 56
---

# 게시글 제목

본문 내용...

![이미지](./images/cafe-12345678-987654321-1.jpg)

본문 계속...

---

## 댓글

> **작성자1** (2025-01-15 10:30)
> 댓글 내용입니다.
>
> > **작성자2** (2025-01-15 11:00)
> > 대댓글 내용입니다.
```

---

## 10. 구현 우선순위

### 10.1 필수 (MVP)
1. `NaverCafeFetcher` 기본 구현 (공개 카페)
2. `CafeService` 기본 구현
3. 단일 게시글 가져오기 모달
4. 기본 마크다운 변환
5. 설정 탭 확장

### 10.2 권장
1. 쿠키 기반 인증
2. 게시판별 가져오기
3. 이미지 다운로드 (기존 ImageService 재사용)
4. 카페 구독 기능

### 10.3 선택
1. 댓글 크롤링
2. AI 기반 태그/요약 생성 (기존 AIService 재사용)
3. 첨부 파일 다운로드
4. 레이아웃 수정

---

## 11. 예상 개발 일정

| 단계 | 내용 | 예상 복잡도 |
|------|------|-------------|
| Phase 1.1 | NaverCafeFetcher 기본 구현 | 중 |
| Phase 1.2 | 단일 게시글 모달 | 낮음 |
| Phase 1.3 | 마크다운 변환 | 중 (재사용) |
| Phase 2.1 | 쿠키 인증 | 중 |
| Phase 2.2 | 게시판 목록/선택 | 중 |
| Phase 3.1 | 카페 구독 | 중 |
| Phase 3.2 | 댓글 지원 | 높음 |

---

## 12. 결론

### 12.1 실현 가능성
- **가능**: 공개 카페 크롤링, 기본 콘텐츠 추출
- **가능 (추가 작업 필요)**: 쿠키 기반 인증, 비공개 카페
- **제한적**: 완전 자동 로그인 (CAPTCHA 때문)

### 12.2 권장 접근 방식
1. **공개 카페 우선**: MVP는 공개 카페만 지원
2. **점진적 확장**: 쿠키 인증 → 구독 → 댓글 순으로 확장
3. **코드 재사용**: 기존 블로그 로직 최대한 활용
4. **사용자 가이드**: 쿠키 추출 방법 상세 문서화

### 12.3 다음 단계
1. 네이버 카페 API 실제 테스트 (공개 카페)
2. HTML 구조 분석 및 파서 프로토타입
3. MVP 구현 시작
