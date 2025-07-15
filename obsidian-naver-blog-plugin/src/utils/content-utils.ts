import { ProcessedBlogPost } from '../types';
import { MIN_CONTENT_LENGTH_FOR_AI } from '../constants';

export class ContentUtils {
	
	/**
	 * Creates YAML frontmatter for a blog post
	 * @param post The processed blog post data
	 * @param sanitizeFilename Function to sanitize filename (from ImageService)
	 * @returns Formatted YAML frontmatter string
	 */
	static createFrontmatter(post: ProcessedBlogPost, sanitizeFilename: (filename: string) => string): string {
		const tags = post.tags.length > 0 ? post.tags.map(tag => `"${tag}"`).join(', ') : '';
		const excerpt = post.excerpt ? `"${post.excerpt.replace(/"/g, '\\"')}"` : '""';
		
		return `---
title: "${post.title}"
filename: "${post.date}-${sanitizeFilename(post.title)}"
date: ${post.date}
share: true
categories: [IT, 개발, 생활]
tags: [${tags}]
excerpt: ${excerpt}
source: "네이버 블로그"
url: "${post.url}"
logNo: "${post.logNo}"
---`;
	}

	/**
	 * Cleans markdown content for AI processing
	 * Removes markdown syntax and replaces images with placeholders
	 * @param content The raw markdown content
	 * @returns Cleaned content suitable for AI processing
	 */
	static cleanContentForAI(content: string): string {
		return content
			.replace(/!\[([^\]]*)\]\([^)]*\)/g, '[이미지: $1]') // Replace images with placeholders
			.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Remove links but keep text
			.replace(/[#*`]/g, '') // Remove markdown formatting
			.trim();
	}

	/**
	 * Extracts frontmatter and body from markdown content
	 * @param content The full markdown content with potential frontmatter
	 * @returns Object with separated frontmatter and body content
	 */
	static extractFrontmatter(content: string): { frontmatter: string; body: string } {
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
		
		if (frontmatterMatch) {
			return {
				frontmatter: frontmatterMatch[1],
				body: frontmatterMatch[2]
			};
		}
		
		return {
			frontmatter: '',
			body: content
		};
	}

	/**
	 * Reconstructs markdown content with frontmatter and body
	 * @param frontmatter The YAML frontmatter content
	 * @param body The markdown body content
	 * @returns Complete markdown content with frontmatter
	 */
	static reconstructMarkdown(frontmatter: string, body: string): string {
		if (frontmatter.trim()) {
			return `---\n${frontmatter}\n---\n${body}`;
		}
		return body;
	}

	/**
	 * Validates content length for AI processing
	 * @param content The content to validate
	 * @param minLength Minimum required length (default: 50)
	 * @returns True if content is long enough for processing
	 */
	static isContentValidForAI(content: string, minLength: number = MIN_CONTENT_LENGTH_FOR_AI): boolean {
		return content && content.trim().length >= minLength;
	}
}