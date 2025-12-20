# Brunch Platform Specification

> Kakao Brunch 블로그 플랫폼 스크래핑 및 구독 기능 구현을 위한 기술 스펙

## 1. 플랫폼 개요

| 항목 | 값 |
|------|-----|
| **플랫폼명** | Brunch (브런치) |
| **운영사** | Kakao |
| **URL** | https://brunch.co.kr |
| **특징** | 글쓰기 중심 블로그, 연재물/브런치북 지원 |

---

## 2. URL 패턴

### 2.1 기본 URL 구조

| 유형 | 패턴 | 예시 |
|------|------|------|
| **작가 페이지** | `/@{username}` | `https://brunch.co.kr/@eveningdriver` |
| **개별 글** | `/@{username}/{postId}` | `https://brunch.co.kr/@eveningdriver/78` |
| **RSS 피드** | `/rss/@@{userId}` | `https://brunch.co.kr/rss/@@eHom` |
| **연재(Book)** | `/brunchbook/{bookId}` | `https://brunch.co.kr/brunchbook/eveningdriver2` |
| **키워드** | `/keyword/{keyword}` | `https://brunch.co.kr/keyword/안정` |

### 2.2 ID 체계

- **userId (내부)**: `@@eHom` 형식 - RSS URL에 사용
- **username (공개)**: `@eveningdriver` 형식 - 글/프로필 URL에 사용
- **postId**: 숫자 (1, 2, 3, ..., 78 등)

> **주의**: `@@userId`와 `@username`은 다른 값이며, 리다이렉트로 연결됨

---

## 3. RSS 피드 스펙

### 3.1 RSS URL

```
https://brunch.co.kr/rss/@@{userId}
```

### 3.2 RSS 형식

- **버전**: RSS 2.0 표준
- **인코딩**: UTF-8
- **글 개수**: 약 20개 (최신순)

### 3.3 Channel 필드

```xml
<channel>
  <title>EveningDriver</title>
  <link>https://brunch.co.kr/@@eHom</link>
  <description>직장인 × 배달라이더 × 관찰자...</description>
  <language>ko</language>
  <pubDate>Fri, 19 Dec 2025 05:17:53 GMT</pubDate>
  <generator>Kakao Brunch</generator>
  <image>
    <title>작가 소개</title>
    <url>//img1.daumcdn.net/thumb/C100x100.fjpg/?fname=...</url>
    <link>https://brunch.co.kr/@@eHom</link>
    <width>100</width>
    <height>100</height>
  </image>
</channel>
```

### 3.4 Item 필드

```xml
<item>
  <title>하루가 나를 지나갈 때 - 분명해진 흐름</title>
  <link>https://brunch.co.kr/@@eHom/78</link>
  <description>본문 요약... <img src="..." width="500" /></description>
  <pubDate>Wed, 17 Dec 2025 12:30:02 GMT</pubDate>
  <author>EveningDriver</author>
  <guid>https://brunch.co.kr/@@eHom/78</guid>
</item>
```

### 3.5 RSS에서 userId 추출

```typescript
// 작가 페이지 HTML에서 RSS 링크 추출
const rssLink = document.querySelector('link[type="application/rss+xml"]');
const rssUrl = rssLink?.getAttribute('href');
// 예: "https://brunch.co.kr/rss/@@eHom"

// userId 추출
const userId = rssUrl?.match(/@@(\w+)/)?.[1]; // "eHom"
```

---

## 4. 개별 글 페이지 스펙

### 4.1 메타데이터 (Open Graph)

```html
<meta property="og:title" content="23화 하루가 나를 지나갈 때">
<meta property="og:description" content="분명해진 흐름 | 언제부터인가...">
<meta property="og:image" content="//img1.daumcdn.net/thumb/R1280x0.fwebp/?fname=...">
<meta property="og:article:author" content="EveningDriver">
<meta property="og:regDate" content="2025-12-17T12:30+09:00">
<meta property="og:type" content="article">
<meta property="og:site_name" content="브런치">
```

### 4.2 본문 HTML 구조

```html
<div class="wrap_body">
  <!-- 텍스트 블록 -->
  <div class="wrap_item item_type_text">
    <span>텍스트 내용...</span>
    <br>
    <span>다음 줄...</span>
  </div>

  <!-- 빈 줄 (단락 구분) -->
  <div class="wrap_item item_type_text"></div>

  <!-- 이미지 블록 -->
  <div class="wrap_item item_type_img">
    <div class="wrap_content mobile_align_full">
      <div class="wrap_img_float">
        <img src="//img1.daumcdn.net/thumb/R1280x0.fwebp/?fname=...">
        <span class="text_caption">이미지 캡션</span>
      </div>
    </div>
  </div>
</div>
```

### 4.3 콘텐츠 타입

| 클래스 | 설명 | 마크다운 변환 |
|--------|------|---------------|
| `item_type_text` | 텍스트 단락 | 일반 텍스트 |
| `item_type_img` | 이미지 | `![caption](url)` |
| `item_type_quotation` | 인용구 | `> quote` |
| `item_type_division` | 구분선 | `---` |
| `item_type_embed` | 임베드 (유튜브 등) | iframe URL |

### 4.4 상호작용 데이터

페이지에서 추출 가능한 데이터:

```typescript
interface BrunchEngagement {
  likes: number;      // "라이킷 315" 버튼에서 추출
  comments: number;   // "댓글 6" 버튼에서 추출
  subscribers: number; // "구독자 1,744"에서 추출
}
```

### 4.5 추가 메타데이터

```typescript
interface BrunchMetadata {
  keywords: string[];     // 키워드 태그 (예: ["안정", "마음", "고요"])
  series?: {              // 연재물인 경우
    title: string;        // "두 개의 삶: 밤을 달린다 2"
    url: string;          // brunchbook URL
    episode: number;      // 23
  };
  author: {
    name: string;         // "EveningDriver"
    username: string;     // "@eveningdriver"
    profileUrl: string;
    avatar?: string;
    job?: string;         // "회사원"
    bio?: string;
  };
}
```

---

## 5. 마크다운 변환 로직

### 5.1 변환 함수

```typescript
function brunchToMarkdown(wrapBody: Element): string {
  const lines: string[] = [];
  let paragraph: string[] = [];

  wrapBody.querySelectorAll('.wrap_item').forEach(item => {
    if (item.classList.contains('item_type_text')) {
      const text = (item as HTMLElement).innerText.trim();
      if (text === '') {
        // 단락 구분
        if (paragraph.length > 0) {
          lines.push(paragraph.join('\n'));
          lines.push('');
          paragraph = [];
        }
      } else {
        paragraph.push(text);
      }
    } else if (item.classList.contains('item_type_img')) {
      // 이전 단락 마무리
      if (paragraph.length > 0) {
        lines.push(paragraph.join('\n'));
        lines.push('');
        paragraph = [];
      }

      const img = item.querySelector('img');
      const caption = item.querySelector('.text_caption');
      if (img) {
        const src = (img as HTMLImageElement).dataset.src ||
                    (img as HTMLImageElement).src;
        const captionText = caption?.textContent?.trim() || '';
        lines.push(`![${captionText}](${src})`);
        if (captionText) {
          lines.push(`*${captionText}*`);
        }
        lines.push('');
      }
    } else if (item.classList.contains('item_type_quotation')) {
      if (paragraph.length > 0) {
        lines.push(paragraph.join('\n'));
        lines.push('');
        paragraph = [];
      }
      const quote = (item as HTMLElement).innerText.trim();
      lines.push(`> ${quote.replace(/\n/g, '\n> ')}`);
      lines.push('');
    } else if (item.classList.contains('item_type_division')) {
      if (paragraph.length > 0) {
        lines.push(paragraph.join('\n'));
        lines.push('');
        paragraph = [];
      }
      lines.push('---');
      lines.push('');
    }
  });

  // 마지막 단락 처리
  if (paragraph.length > 0) {
    lines.push(paragraph.join('\n'));
  }

  return lines.join('\n');
}
```

### 5.2 변환 결과 예시

**입력 (HTML):**
```html
<div class="wrap_item item_type_text">첫 번째 문장</div>
<div class="wrap_item item_type_text">두 번째 문장</div>
<div class="wrap_item item_type_text"></div>
<div class="wrap_item item_type_img">
  <img src="https://example.com/image.jpg">
  <span class="text_caption">사진 설명</span>
</div>
<div class="wrap_item item_type_text">세 번째 문장</div>
```

**출력 (Markdown):**
```markdown
첫 번째 문장
두 번째 문장

![사진 설명](https://example.com/image.jpg)
*사진 설명*

세 번째 문장
```

---

## 6. 이미지 URL 처리

### 6.1 이미지 URL 패턴

```
https://img1.daumcdn.net/thumb/{size}.{format}/?fname={originalUrl}
```

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `size` | 크기 | `R1280x0`, `C720x360`, `C100x100` |
| `format` | 포맷 | `fwebp`, `fjpg`, `fpng` |
| `fname` | 원본 URL | `http://t1.daumcdn.net/brunch/...` |

### 6.2 원본 이미지 추출

```typescript
function getOriginalImageUrl(thumbUrl: string): string {
  const match = thumbUrl.match(/fname=(.+)$/);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  return thumbUrl;
}

// 또는 고해상도 썸네일 사용
function getHighResImageUrl(thumbUrl: string): string {
  return thumbUrl.replace(/thumb\/[^/]+/, 'thumb/R1280x0.fwebp');
}
```

---

## 7. 구독 기능 구현

### 7.1 아키텍처

```
[사용자가 작가 URL 입력]
    ↓
[작가 페이지에서 RSS URL 추출]
    ↓
[RSS URL + 마지막 확인 시간 저장]
    ↓
[주기적 폴링] (1시간 간격 권장)
    ↓
[RSS 파싱 → guid/pubDate 비교]
    ↓
[신규 글 발견 시 개별 페이지 스크래핑]
    ↓
[마크다운 변환 → Obsidian 노트 생성]
```

### 7.2 구독 데이터 구조

```typescript
interface BrunchSubscription {
  id: string;
  platform: 'brunch';
  authorUsername: string;    // "@eveningdriver"
  authorUserId: string;      // "@@eHom"
  rssUrl: string;            // "https://brunch.co.kr/rss/@@eHom"
  lastCheckedAt: Date;
  lastPostGuid?: string;     // 마지막으로 확인한 글의 guid
  createdAt: Date;
}
```

### 7.3 신규 글 감지

```typescript
async function checkNewPosts(subscription: BrunchSubscription): Promise<string[]> {
  const response = await fetch(subscription.rssUrl);
  const xml = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const items = doc.querySelectorAll('item');
  const newPostUrls: string[] = [];

  for (const item of items) {
    const guid = item.querySelector('guid')?.textContent;
    const pubDate = item.querySelector('pubDate')?.textContent;

    if (guid === subscription.lastPostGuid) {
      break; // 이미 확인한 글 이후는 skip
    }

    const link = item.querySelector('link')?.textContent;
    if (link) {
      newPostUrls.push(link);
    }
  }

  return newPostUrls;
}
```

---

## 8. 데이터 모델

### 8.1 BrunchPost 인터페이스

```typescript
interface BrunchPost {
  platform: 'brunch';
  id: string;                    // postId (예: "78")
  url: string;                   // full URL

  author: {
    name: string;                // "EveningDriver"
    username: string;            // "@eveningdriver"
    userId: string;              // "@@eHom"
    profileUrl: string;
    avatar?: string;
    subscribers?: number;
    job?: string;
  };

  content: {
    title: string;               // "하루가 나를 지나갈 때"
    subtitle?: string;           // "분명해진 흐름"
    text: string;                // 본문 전체 (plain text)
    markdown: string;            // 마크다운 변환된 본문
    html?: string;               // 원본 HTML
  };

  media: {
    thumbnail: string;           // og:image
    images: Array<{
      url: string;
      caption?: string;
    }>;
  };

  metadata: {
    publishedAt: Date;           // og:regDate
    likes: number;
    comments: number;
    keywords: string[];
    series?: {
      title: string;
      url: string;
      episode: number;
    };
  };
}
```

### 8.2 YAML Frontmatter

```yaml
---
platform: brunch
url: https://brunch.co.kr/@eveningdriver/78
title: 하루가 나를 지나갈 때
subtitle: 분명해진 흐름
author: EveningDriver
author_url: https://brunch.co.kr/@eveningdriver
published: 2025-12-17T12:30:00+09:00
archived: 2025-12-19T14:30:00+09:00
likes: 315
comments: 6
keywords:
  - 안정
  - 마음
  - 고요
series: 두 개의 삶: 밤을 달린다 2
episode: 23
---
```

---

## 9. 구현 시 주의사항

### 9.1 Rate Limiting

- Brunch는 공개 플랫폼이지만 과도한 요청 시 차단될 수 있음
- **권장**: RSS 폴링 1시간 간격, 개별 페이지 요청 간 1초 딜레이

### 9.2 이미지 다운로드

- `daumcdn.net` 이미지는 직접 다운로드 가능
- Referer 헤더 설정 권장: `https://brunch.co.kr`

### 9.3 인코딩

- 모든 콘텐츠 UTF-8
- HTML 엔티티 디코딩 필요 (`&times;` → `×` 등)

### 9.4 동적 콘텐츠

- 기본 콘텐츠는 SSR로 제공되어 정적 스크래핑 가능
- 댓글은 동적 로딩 (별도 API 호출 필요)

---

## 10. API 엔드포인트 (추정)

> 공식 API는 없으나, 네트워크 분석으로 추정된 내부 API

```
# 댓글 조회 (추정)
GET /api/v1/article/{userId}/{postId}/comments

# 좋아요 수 (추정)
GET /api/v1/article/{userId}/{postId}/like/count
```

---

## 11. BrightData 없이 구현 가능 여부

### 결론: ✅ 가능

| 기능 | 구현 방법 | 난이도 |
|------|-----------|--------|
| 신규 글 감지 | RSS 폴링 | 쉬움 |
| 본문 추출 | HTML 파싱 (.wrap_body) | 쉬움 |
| 이미지 추출 | .item_type_img 파싱 | 쉬움 |
| 마크다운 변환 | DOM 순회 + 변환 | 중간 |
| 메타데이터 | OG 태그 + 페이지 파싱 | 쉬움 |
| 구독 기능 | RSS URL 저장 + 주기적 폴링 | 중간 |

### Cloudflare Workers로 구현 시

```typescript
// RSS 폴링 (Cron Trigger)
export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    const subscriptions = await env.KV.list({ prefix: 'brunch:' });

    for (const key of subscriptions.keys) {
      const sub = await env.KV.get(key.name, 'json');
      const newPosts = await checkNewPosts(sub);

      for (const postUrl of newPosts) {
        await env.QUEUE.send({ type: 'scrape', url: postUrl });
      }
    }
  }
};
```

---

## 12. 참고 자료

- Brunch 메인: https://brunch.co.kr
- RSS 예시: https://brunch.co.kr/rss/@@eHom
- Kakao Developers: https://developers.kakao.com (Brunch API 없음)

---

*Last Updated: 2025-12-19*
