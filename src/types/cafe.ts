/**
 * Naver Cafe Types
 */

// 카페 게시글 기본 정보 (목록에서 가져오는 정보)
export interface CafeArticle {
	articleId: string;
	title: string;
	writerNickname: string;
	writerId?: string;
	writeDate: string;
	viewCount: number;
	commentCount: number;
	likeCount?: number;
	menuId: number;
	menuName?: string;
	cafeId: string;
	cafeName?: string;
	isNotice?: boolean;
	isRecommended?: boolean;
	thumbnailUrl?: string;
}

// 카페 게시글 상세 정보
export interface CafeArticleDetail extends CafeArticle {
	content: string;           // HTML 또는 마크다운
	images: string[];          // 이미지 URL 목록
	attachments: CafeAttachment[]; // 첨부 파일
	comments?: CafeComment[];  // 댓글 (옵션)
	tags: string[];            // 태그
	url: string;               // 원본 URL
}

// 첨부 파일
export interface CafeAttachment {
	fileName: string;
	fileSize?: string;
	downloadUrl?: string;
}

// 댓글
export interface CafeComment {
	commentId: string;
	content: string;
	writerNickname: string;
	writerId?: string;
	writeDate: string;
	isReply: boolean;          // 대댓글 여부
	parentCommentId?: string;  // 부모 댓글 ID
	likeCount?: number;
}

// 게시판 (메뉴) 정보
export interface CafeMenu {
	menuId: number;
	menuName: string;
	menuType: string;          // 'B' = 게시판, 'F' = 폴더 등
	articleCount?: number;
	badgeCount?: number;       // 새 글 수
}

// 카페 정보
export interface CafeInfo {
	cafeId: string;
	cafeName: string;
	cafeUrl: string;           // 카페 URL 경로 (예: 'mycafe')
	description?: string;
	memberCount?: number;
	thumbnailUrl?: string;
}

// 처리된 카페 게시글 (마크다운 파일 생성용)
export interface ProcessedCafePost {
	title: string;
	content: string;           // 마크다운 변환된 콘텐츠
	date: string;
	articleId: string;
	cafeId: string;
	cafeName: string;
	cafeUrl: string;           // 카페 URL 경로
	menuId: number;
	menuName: string;
	author: string;
	url: string;
	tags: string[];
	excerpt?: string;
	viewCount?: number;
	commentCount?: number;
	comments?: CafeComment[];
}

// 카페 구독 정보
export interface CafeSubscription {
	cafeId: string;            // 카페 ID (숫자)
	cafeName: string;          // 카페 이름
	cafeUrl: string;           // 카페 URL 경로
	menuIds: number[];         // 구독할 게시판 ID 목록 (빈 배열 = 전체)
	postCount: number;         // 가져올 게시글 수
	lastSyncDate?: string;     // 마지막 동기화 날짜
}

// 카페 관련 설정
export interface NaverCafeSettings {
	// 인증
	naverCookie: string;           // NID_AUT, NID_SES 쿠키값

	// 가져오기 옵션
	cafeImportFolder: string;      // 저장 폴더
	includeComments: boolean;      // 댓글 포함 여부
	downloadCafeImages: boolean;   // 이미지 다운로드 여부

	// 필터링
	excludeNotice: boolean;        // 공지 제외
	excludeRecommended: boolean;   // 추천글 제외
	minContentLength: number;      // 최소 콘텐츠 길이

	// 구독
	subscribedCafes: CafeSubscription[];

	// 중복 체크
	enableCafeDuplicateCheck: boolean;
}
