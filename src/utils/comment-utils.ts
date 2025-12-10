/**
 * Comment utilities for converting cafe comments to markdown
 */

import type { CafeComment } from '../types';

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
