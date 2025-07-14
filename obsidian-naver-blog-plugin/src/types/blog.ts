import { NaverBlogPost } from '../../naver-blog-fetcher';

export interface ProcessedBlogPost extends NaverBlogPost {
	tags: string[];
	excerpt: string;
}

// Re-export for convenience
export { NaverBlogPost } from '../../naver-blog-fetcher';