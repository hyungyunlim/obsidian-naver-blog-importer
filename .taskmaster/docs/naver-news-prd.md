# PRD: 네이버 뉴스 크롤링 기능

## 1. 개요

### 1.1 목적
네이버 뉴스 기사를 옵시디언으로 가져오는 기능 추가. 기존 네이버 블로그/카페 크롤링 아키텍처를 확장하여 뉴스 콘텐츠도 지원한다.

### 1.2 배경
- 네이버 뉴스는 로그인 없이 공개 접근 가능
- 기존 플러그인의 fetcher 패턴을 재활용 가능
- 사용자들이 뉴스 기사도 옵시디언에서 관리하고자 하는 수요 존재

### 1.3 범위
- 단일 네이버 뉴스 기사 가져오기
- 이미지 다운로드 지원
- 댓글 기능은 기본 OFF (옵션으로 제공)

---

## 2. 기능 요구사항

### 2.1 URL 지원 형식
```
https://n.news.naver.com/article/{oid}/{aid}
https://news.naver.com/main/read.naver?mode=LSD&mid=sec&oid={oid}&aid={aid}
```

### 2.2 추출할 데이터

| 필드 | 필수 | 설명 |
|------|------|------|
| title | O | 기사 제목 |
| content | O | 본문 (HTML → Markdown 변환) |
| press | O | 언론사명 |
| pressId | O | 언론사 ID (oid) |
| articleId | O | 기사 ID (aid) |
| journalists | O | 기자명 (복수 가능) |
| publishedAt | O | 입력 일시 |
| modifiedAt | X | 수정 일시 |
| category | X | 기사 카테고리/섹션 |
| summary | X | 기사 요약문 |
| originalUrl | X | 기사 원문 링크 |
| images | X | 본문 내 이미지 |
| imageCaptions | X | 이미지 캡션 |
| commentCount | X | 댓글 수 |
| comments | X | 댓글 목록 (기본 OFF) |

### 2.3 HTML 파싱 셀렉터

```typescript
const NAVER_NEWS_SELECTORS = {
  // 메타데이터
  title: '#title_area span, h2.media_end_head_headline span',
  press: '.media_end_head_top_logo_img',  // alt 속성
  journalists: '.media_end_head_journalist_name',
  publishedAt: '._ARTICLE_DATE_TIME',  // data-date-time 속성
  modifiedAt: '._ARTICLE_MODIFY_DATE_TIME',  // data-modify-date-time 속성
  originalUrl: '.media_end_head_origin_link',  // href 속성
  category: '.media_end_categorize_item',

  // 본문
  content: 'article#dic_area',
  summary: 'strong.media_end_summary',

  // 이미지
  images: '.end_photo_org img, .nbd_im_w img',
  imageCaptions: 'em.img_desc',

  // 댓글
  commentCount: '#comment_count',
};
```

### 2.4 콘텐츠 파싱 요구사항

#### 2.4.1 이미지-텍스트 순서 보존 (중요)

**기사 원문의 이미지와 텍스트 순서를 정확히 유지해야 한다.**

```html
<!-- 원본 HTML 구조 예시 -->
<article id="dic_area">
  <p>첫 번째 단락 텍스트...</p>
  <span class="end_photo_org">
    <img src="https://imgnews.pstatic.net/image/..." />
    <em class="img_desc">이미지 캡션</em>
  </span>
  <p>두 번째 단락 텍스트...</p>
  <span class="end_photo_org">
    <img src="https://imgnews.pstatic.net/image/..." />
  </span>
  <p>세 번째 단락 텍스트...</p>
</article>
```

```markdown
<!-- 변환된 마크다운 (순서 유지) -->
첫 번째 단락 텍스트...

![이미지 캡션](attachments/news_006_0000133189/img_001.jpg)
*이미지 캡션*

두 번째 단락 텍스트...

![](attachments/news_006_0000133189/img_002.jpg)

세 번째 단락 텍스트...
```

#### 2.4.2 구현 방법

```typescript
// article#dic_area 내부를 순회하면서 순서대로 처리
function parseArticleContent(articleElement: Element): string {
  let markdown = '';

  // 자식 노드들을 순서대로 순회
  for (const node of articleElement.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      // 텍스트 노드 처리
      markdown += node.textContent?.trim() + '\n\n';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;

      if (element.matches('.end_photo_org, .nbd_im_w')) {
        // 이미지 블록 처리
        const img = element.querySelector('img');
        const caption = element.querySelector('em.img_desc');
        if (img) {
          const src = img.getAttribute('src') || img.getAttribute('data-src');
          const alt = caption?.textContent || '';
          markdown += `![${alt}](${src})\n`;
          if (caption) {
            markdown += `*${caption.textContent}*\n`;
          }
          markdown += '\n';
        }
      } else if (element.tagName === 'P' || element.tagName === 'DIV') {
        // 단락 처리
        markdown += element.textContent?.trim() + '\n\n';
      }
      // ... 기타 요소 처리
    }
  }

  return markdown;
}
```

#### 2.4.3 이미지 캡션 처리

- 이미지 바로 아래 `em.img_desc` 요소에서 캡션 추출
- 캡션이 있으면 이미지 아래 이탤릭(*캡션*)으로 표시
- 캡션이 없으면 이미지만 표시

### 2.5 저장 구조

```
{설정된 뉴스 폴더}/
├── {언론사명}/
│   └── {YYYY-MM-DD}_{기사제목}.md
└── attachments/
    └── news_{oid}_{aid}/
        ├── img_001.jpg
        └── img_002.jpg
```

### 2.6 프론트매터 형식

```yaml
---
title: "기사 제목"
source: naver-news
press: 미디어오늘
press_id: "006"
article_id: "0000133189"
url: https://n.news.naver.com/article/006/0000133189
original_url: https://www.mediatoday.co.kr/...
journalists:
  - 박서연 기자
  - 금준경 기자
category: IT
published: 2025-12-10T09:43:11+09:00
modified: 2025-12-10T10:00:09+09:00
comments: 9
imported: 2025-12-10T11:39:00+09:00
tags: []
---
```

---

## 3. 설정 요구사항

### 3.1 새로운 설정 항목

```typescript
interface NaverNewsSettings {
  // 저장 위치
  newsFolder: string;  // 기본값: "NaverNews"

  // 폴더 구조 옵션
  organizeByPress: boolean;  // 언론사별 폴더 분류 (기본: true)

  // 이미지 설정
  downloadNewsImages: boolean;  // 이미지 다운로드 (기본: true)
  newsImageFolder: string;  // 이미지 저장 폴더 (기본: "attachments")

  // 댓글 설정
  includeNewsComments: boolean;  // 댓글 포함 (기본: false)

  // 콘텐츠 옵션
  includeSummary: boolean;  // 요약문 포함 (기본: true)
  includeOriginalUrl: boolean;  // 원문 링크 포함 (기본: true)
}
```

### 3.2 기본값

```typescript
const DEFAULT_NEWS_SETTINGS: NaverNewsSettings = {
  newsFolder: 'NaverNews',
  organizeByPress: true,
  downloadNewsImages: true,
  newsImageFolder: 'attachments',
  includeNewsComments: false,  // 기본 OFF
  includeSummary: true,
  includeOriginalUrl: true,
};
```

---

## 4. UI 요구사항

### 4.1 가져오기 방식

#### 옵션 A: 기존 단일 포스트 모달 확장
- URL 입력 시 자동으로 뉴스/블로그/카페 구분
- 장점: UI 단순화, 사용자 학습 비용 낮음

#### 옵션 B: 별도 뉴스 모달 생성 (권장)
- 뉴스 전용 모달로 명확한 구분
- 장점: 뉴스 특화 옵션 제공 용이

### 4.2 명령어 추가

```
- "Naver News: Import Article" - 뉴스 기사 가져오기
```

### 4.3 설정 탭 UI

Settings Tab에 "Naver News" 섹션 추가:
- News folder path
- Organize by press (toggle)
- Download images (toggle)
- Include comments (toggle) - 기본 OFF
- Include summary (toggle)

---

## 5. 기술 구현 사항

### 5.1 새로운 파일

| 파일 | 설명 |
|------|------|
| `src/fetchers/naver-news-fetcher.ts` | 뉴스 크롤링 로직 |
| `src/types/news.ts` | 뉴스 관련 타입 정의 |
| `src/constants/news-selectors.ts` | 뉴스 HTML 셀렉터 상수 |
| `src/ui/modals/news-import-modal.ts` | 뉴스 가져오기 모달 |

### 5.2 수정할 파일

| 파일 | 수정 내용 |
|------|-----------|
| `src/types/settings.ts` | NaverNewsSettings 타입 추가 |
| `src/constants/default-values.ts` | 뉴스 기본값 추가 |
| `src/ui/settings-tab.ts` | 뉴스 설정 섹션 추가 |
| `src/services/image-service.ts` | 뉴스 이미지 도메인 지원 추가 |
| `main.ts` | 뉴스 명령어 등록 |
| `lang/en.json`, `lang/ko.json` | 번역 추가 |

### 5.2.1 ImageService 수정 상세

기존 ImageService에 네이버 뉴스 이미지 도메인 지원 추가:

```typescript
// shouldDownloadImage() 메서드의 validDomains에 추가
const validDomains = [
  // 기존 도메인들...
  'blogfiles.pstatic.net',
  'postfiles.pstatic.net',
  // ... 기존 도메인들 ...

  // 뉴스 이미지 도메인 추가
  'imgnews.pstatic.net',
];

// convertToDirectImageUrl() 메서드에 뉴스 이미지 처리 추가
if (directUrl.includes('imgnews.pstatic.net')) {
  // 뉴스 이미지는 고해상도로 변환 (w860 → w2000)
  if (directUrl.includes('type=')) {
    directUrl = directUrl.replace(/type=w\d+/gi, 'type=w2000');
  } else {
    directUrl += (directUrl.includes('?') ? '&' : '?') + 'type=w2000';
  }
  return directUrl;
}
```

### 5.3 NaverNewsFetcher 클래스 구조

```typescript
class NaverNewsFetcher {
  constructor(app: App, settings: NaverBlogSettings);

  // URL 파싱
  parseNewsUrl(url: string): { oid: string; aid: string } | null;

  // 기사 가져오기
  async fetchArticle(oid: string, aid: string): Promise<NewsArticle>;

  // HTML 파싱
  parseArticleHtml(html: string): NewsArticle;

  // 마크다운 변환
  convertToMarkdown(article: NewsArticle): string;

  // 이미지 다운로드
  async downloadImages(article: NewsArticle): Promise<string>;

  // 댓글 가져오기 (옵션)
  async fetchComments(oid: string, aid: string): Promise<NewsComment[]>;

  // 저장
  async saveArticle(article: NewsArticle): Promise<void>;
}
```

### 5.4 타입 정의

```typescript
interface NewsArticle {
  title: string;
  content: string;
  press: string;
  pressId: string;
  articleId: string;
  journalists: string[];
  publishedAt: string;
  modifiedAt?: string;
  category?: string;
  summary?: string;
  originalUrl?: string;
  url: string;
  images: NewsImage[];
  commentCount?: number;
  comments?: NewsComment[];
}

interface NewsImage {
  src: string;
  alt?: string;
  caption?: string;
  localPath?: string;
}

interface NewsComment {
  author: string;
  content: string;
  date: string;
  likes: number;
  dislikes: number;
}
```

---

## 6. 에러 처리

### 6.1 예상 에러 케이스

| 에러 | 처리 방식 |
|------|-----------|
| 잘못된 URL 형식 | 에러 메시지 표시, 올바른 형식 안내 |
| 기사 없음 (404) | "기사를 찾을 수 없습니다" 메시지 |
| 네트워크 오류 | 재시도 안내 |
| 파싱 실패 | 원본 HTML 일부 저장, 에러 로그 |
| 이미지 다운로드 실패 | 원본 URL 유지, 경고 메시지 |

### 6.2 에러 메시지 (i18n)

```json
{
  "news_invalid_url": "올바른 네이버 뉴스 URL을 입력해주세요.",
  "news_not_found": "기사를 찾을 수 없습니다.",
  "news_fetch_error": "기사를 가져오는 중 오류가 발생했습니다.",
  "news_import_success": "뉴스 기사를 성공적으로 가져왔습니다.",
  "news_image_download_failed": "일부 이미지를 다운로드하지 못했습니다."
}
```

---

## 7. 테스트 케이스

### 7.1 URL 파싱 테스트
- `https://n.news.naver.com/article/006/0000133189` → oid: 006, aid: 0000133189
- `https://news.naver.com/main/read.naver?mode=LSD&mid=sec&oid=006&aid=0000133189` → 동일

### 7.2 기사 가져오기 테스트
- 일반 기사 (이미지 포함)
- 이미지 없는 기사
- 복수 기자 기사
- 수정된 기사 (수정일시 존재)

### 7.3 이미지-텍스트 순서 테스트
- 이미지가 글 중간에 있는 기사 → 순서 유지 확인
- 이미지가 연속으로 있는 기사 → 순서 유지 확인
- 캡션이 있는 이미지 → 캡션 위치 확인
- `imgnews.pstatic.net` 이미지 다운로드 → 성공 확인

### 7.4 설정 테스트
- 언론사별 폴더 분류 ON/OFF
- 이미지 다운로드 ON/OFF
- 댓글 포함 ON/OFF

---

## 8. 마일스톤

### Phase 1: 기본 기능
1. NaverNewsFetcher 클래스 구현
2. 뉴스 타입 정의
3. HTML 파싱 로직
4. 마크다운 변환

### Phase 2: UI 및 설정
5. 뉴스 가져오기 모달
6. 설정 탭 확장
7. 명령어 등록
8. i18n 번역

### Phase 3: 부가 기능
9. ImageService 수정 (imgnews.pstatic.net 도메인 추가)
10. 이미지 다운로드 및 순서 보존 검증
11. 댓글 가져오기 (옵션)
12. 에러 처리 강화

### Phase 4: 테스트 및 마무리
13. 테스트 케이스 검증
14. 버전 업데이트 (1.7.0)
15. 문서 업데이트

---

## 9. 향후 확장 고려사항

- 언론사 구독 기능 (RSS 피드 활용)
- 키워드 기반 뉴스 검색
- 언론사별 맞춤 파싱 (구조가 다른 경우)
- 뉴스 아카이브 기능

---

## 10. 참고 자료

### 10.1 네이버 뉴스 HTML 구조
- 제목: `#title_area span`
- 본문: `article#dic_area`
- 언론사: `.media_end_head_top_logo_img` (alt)
- 기자: `.media_end_head_journalist_name`
- 날짜: `._ARTICLE_DATE_TIME` (data-date-time)
- 이미지: `.end_photo_org img`, `.nbd_im_w img`
- 캡션: `em.img_desc`

### 10.2 이미지 URL 패턴
```
https://imgnews.pstatic.net/image/{oid}/{date}/{aid}_{seq}_{timestamp}.jpg?type=w860
```

### 10.3 댓글 API
```
https://apis.naver.com/commentBox/cbox5/web_naver_list_jsonp.json
?ticket=news
&objectId=news{oid},{aid}
&pageSize=20
&page=1
```
