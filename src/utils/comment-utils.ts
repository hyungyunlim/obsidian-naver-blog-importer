/**
 * Comment utilities for converting comments to markdown
 * Supports multiple platforms: Naver Cafe, Brunch, etc.
 */

import type { CafeComment } from '../types';
import type { BrunchComment } from '../types/brunch';

/**
 * Convert comments array to markdown string
 * Format:
 * ---
 * ## 댓글
 *
 * **닉네임** (글쓴이) · 2025.12.09. 09:50
 * 댓글 내용
 * ![첨부사진](이미지URL)
 *
 *   ↳ **닉네임** · 2025.12.09. 09:52
 *   @멘션대상 대댓글 내용
 */
export function convertCommentsToMarkdown(comments: CafeComment[]): string {
	if (!comments || comments.length === 0) {
		return '';
	}

	const lines: string[] = [];
	lines.push('---');
	lines.push('## 댓글');
	lines.push('');

	for (const comment of comments) {
		const formattedComment = formatSingleComment(comment);
		lines.push(formattedComment);
		lines.push('');
	}

	return lines.join('\n');
}

/**
 * Format a single comment to markdown
 */
function formatSingleComment(comment: CafeComment): string {
	const lines: string[] = [];

	// Build header line: **닉네임** (글쓴이) · 시간
	let header = '';
	const indent = comment.isReply ? '  ' : '';

	if (comment.isReply) {
		header += `${indent}↳ `;
	}

	header += `**${comment.writerNickname}**`;

	// Add writer badge if applicable
	if (comment.isWriter) {
		header += ' (글쓴이)';
	}

	// Add timestamp
	if (comment.writeDate) {
		header += ` · ${comment.writeDate}`;
	}

	lines.push(header);

	// Build content
	let content = '';

	// Add mentioned nickname for replies
	if (comment.isReply && comment.mentionedNickname) {
		content = `@${comment.mentionedNickname} `;
	}

	content += comment.content || '';

	// Add indentation for replies
	if (comment.isReply) {
		content = indent + content.split('\n').join(`\n${indent}`);
	}

	lines.push(content);

	// Add attachment image if present
	if (comment.attachmentImageUrl) {
		const imageMarkdown = comment.isReply
			? `${indent}![첨부사진](${comment.attachmentImageUrl})`
			: `![첨부사진](${comment.attachmentImageUrl})`;
		lines.push(imageMarkdown);
	}

	return lines.join('\n');
}

/**
 * Get comment count summary
 */
export function getCommentSummary(comments: CafeComment[]): string {
	if (!comments || comments.length === 0) {
		return '';
	}

	const totalCount = comments.length;
	const replyCount = comments.filter(c => c.isReply).length;
	const topLevelCount = totalCount - replyCount;

	if (replyCount > 0) {
		return `${topLevelCount}개의 댓글, ${replyCount}개의 답글`;
	}
	return `${totalCount}개의 댓글`;
}

/**
 * ===========================================
 * Brunch Comment Functions
 * ===========================================
 */

/**
 * Convert Brunch comments array to markdown string
 * Format:
 * ---
 * ## 댓글
 *
 * **작성자** 🌟 · 2025년 12월 17일 오후 3:45
 * 댓글 내용
 *
 *   ↳ **작성자** · 2025년 12월 17일 오후 4:00
 *   답글 내용
 */
export function convertBrunchCommentsToMarkdown(comments: BrunchComment[]): string {
	if (!comments || comments.length === 0) {
		return '';
	}

	const lines: string[] = [];
	lines.push('');
	lines.push('---');
	lines.push('');
	lines.push('## 댓글');
	lines.push('');

	for (const comment of comments) {
		const formattedComment = formatBrunchComment(comment, 0);
		lines.push(formattedComment);
	}

	return lines.join('\n');
}

/**
 * Format a single Brunch comment with nested replies
 */
function formatBrunchComment(comment: BrunchComment, depth: number): string {
	const lines: string[] = [];
	const indent = '  '.repeat(depth);
	const replyPrefix = depth > 0 ? '↳ ' : '';

	// Format timestamp
	const date = new Date(comment.timestamp);
	const formattedDate = date.toLocaleDateString('ko-KR', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});

	// Author name with membership indicator
	const authorDisplay = comment.author.isMembership
		? `**${comment.author.name}** 🌟`
		: `**${comment.author.name}**`;

	// Comment header
	lines.push(`${indent}${replyPrefix}${authorDisplay} · ${formattedDate}`);

	// Comment content (preserve line breaks, add indentation)
	const contentLines = comment.content.split('\n');
	for (const contentLine of contentLines) {
		lines.push(`${indent}${depth > 0 ? '  ' : ''}${contentLine}`);
	}

	lines.push('');

	// Nested replies
	if (comment.replies && comment.replies.length > 0) {
		for (const reply of comment.replies) {
			lines.push(formatBrunchComment(reply, depth + 1));
		}
	}

	return lines.join('\n');
}

/**
 * Get Brunch comment count summary
 */
export function getBrunchCommentSummary(comments: BrunchComment[]): string {
	if (!comments || comments.length === 0) {
		return '';
	}

	let totalCount = comments.length;
	let replyCount = 0;

	// Count nested replies
	for (const comment of comments) {
		if (comment.replies) {
			replyCount += countNestedReplies(comment.replies);
		}
	}

	totalCount += replyCount;

	if (replyCount > 0) {
		return `${comments.length}개의 댓글, ${replyCount}개의 답글`;
	}
	return `${totalCount}개의 댓글`;
}

/**
 * Recursively count nested replies
 */
function countNestedReplies(replies: BrunchComment[]): number {
	let count = replies.length;
	for (const reply of replies) {
		if (reply.replies) {
			count += countNestedReplies(reply.replies);
		}
	}
	return count;
}
