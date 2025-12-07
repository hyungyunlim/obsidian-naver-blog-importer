import { requestUrl, Notice } from 'obsidian';
import * as cheerio from 'cheerio';
import type { CheerioAPI, Cheerio } from 'cheerio';
import type { Element, AnyNode } from 'domhandler';

interface BlogComponent {
	componentType?: string;
	data?: {
		text?: string;
		quote?: string;
		cite?: string;
		src?: string;
		url?: string;
		imageUrl?: string;
		imageInfo?: {
			src?: string;
			url?: string;
			alt?: string;
		};
		caption?: string;
		alt?: string;
		title?: string;
		code?: string;
		link?: string;
		type?: string;
		[key: string]: unknown;
	};
}

export interface NaverBlogPost {
    title: string;
    date: string;
    content: string;
    logNo: string;
    url: string;
    thumbnail?: string;
    blogId: string;
    originalTags: string[];
}

export class NaverBlogFetcher {
    private blogId: string;

    constructor(blogId: string) {
        this.blogId = blogId;
    }

    // Test method for specific post URL
    async fetchSinglePost(logNo: string): Promise<NaverBlogPost> {
        try {
            const parsed = await this.fetchPostContent(logNo);

            return {
                title: parsed.title,
                date: parsed.date,
                logNo: logNo,
                url: `https://blog.naver.com/${this.blogId}/${logNo}`,
                thumbnail: undefined,
                content: parsed.content,
                blogId: this.blogId,
                originalTags: parsed.tags
            };
        } catch (error) {
            throw new Error(`Failed to fetch single post ${logNo}: ${error.message}`);
        }
    }

    async fetchPosts(maxPosts?: number): Promise<NaverBlogPost[]> {
        try {
            // Get blog post list
            let posts = await this.getPostList(maxPosts);
            
            // If no posts found, try with some test logNo values for debugging
            if (posts.length === 0) {
                // Try some common logNo patterns for testing
                const testLogNos = ['220883239733', '223435041536', '223434985552', '223434866456'];
                for (const logNo of testLogNos) {
                    try {
                        const parsed = await this.fetchPostContent(logNo);
                        if (parsed.content && !parsed.content.includes('[Error') && !parsed.content.includes('[No content')) {
                            posts.push({
                                title: parsed.title !== 'Untitled' ? parsed.title : `Test Post ${logNo}`,
                                date: parsed.date,
                                logNo: logNo,
                                url: `https://blog.naver.com/${this.blogId}/${logNo}`,
                                thumbnail: undefined
                            });
                            break; // Found one working post, that's enough for testing
                        }
                    } catch {
                        continue;
                    }
                }
            }
            
            // Limit posts if maxPosts is specified
            if (maxPosts && posts.length > maxPosts) {
                posts = posts.slice(0, maxPosts);
            }

            // Fetch content for each post
            const postsWithContent: NaverBlogPost[] = [];
            const totalPosts = posts.length;
            
            for (let i = 0; i < posts.length; i++) {
                const post = posts[i];
                const progress = `(${i + 1}/${totalPosts})`;
                
                try {
                    const parsed = await this.fetchPostContent(post.logNo);
                    postsWithContent.push({
                        title: parsed.title !== 'Untitled' ? parsed.title : post.title,
                        date: parsed.date,
                        logNo: post.logNo,
                        url: post.url,
                        thumbnail: post.thumbnail,
                        content: parsed.content,
                        blogId: this.blogId,
                        originalTags: parsed.tags
                    });


                    // Add delay to be respectful to the server
                    await this.delay(1000);
                } catch (error) {

                    // Create error post for failed fetch
                    const errorContent = this.createErrorContent(post, error);
                    postsWithContent.push({
                        title: `[오류] ${post.title || post.logNo}`,
                        date: post.date || new Date().toISOString().split('T')[0],
                        logNo: post.logNo,
                        url: post.url,
                        thumbnail: post.thumbnail,
                        content: errorContent,
                        blogId: this.blogId,
                        originalTags: []
                    });
                    
                    
                    // Add delay to be respectful to the server
                    await this.delay(500);
                }
            }
            
            return postsWithContent;
        } catch (error) {
            throw new Error(`Failed to fetch posts from blog: ${this.blogId}`);
        }
    }

    private async getPostList(maxPosts?: number): Promise<Omit<NaverBlogPost, 'content' | 'blogId' | 'originalTags'>[]> {
        const posts: Omit<NaverBlogPost, 'content' | 'blogId' | 'originalTags'>[] = [];

        try {
            
            // Try multiple pages to get more posts
            let currentPage = 1;
            let hasMore = true;
            const maxPages = maxPosts ? Math.min(Math.ceil(maxPosts / 30), 10) : 20; // Limit pages based on maxPosts, default to 20 pages (600 posts max)
            const postLimit = maxPosts || 1000; // Default to 1000 if no limit specified
            
            while (hasMore && currentPage <= maxPages && posts.length < postLimit) {
                
                // Try different URL patterns for pagination
                const urlsToTry = [
                    `https://blog.naver.com/PostList.naver?blogId=${this.blogId}&currentPage=${currentPage}`,
                    `https://blog.naver.com/PostList.naver?blogId=${this.blogId}&viewdate=&currentPage=${currentPage}&categoryNo=0&parentCategoryNo=0&countPerPage=30`,
                    `https://blog.naver.com/${this.blogId}?currentPage=${currentPage}`,
                ];
                
                let foundPostsOnPage = false;
                
                for (const url of urlsToTry) {
                    try {
                        const response = await requestUrl({
                            url: url,
                            method: 'GET',
                            headers: {
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                            }
                        });

                        if (response.text) {
                            const pagePosts = this.parsePostListFromHTML(response.text);
                            if (pagePosts.length > 0) {
                                
                                // Add only new posts (avoid duplicates)
                                for (const post of pagePosts) {
                                    if (!posts.find(p => p.logNo === post.logNo)) {
                                        posts.push(post);
                                    }
                                }
                                
                                foundPostsOnPage = true;
                                break; // Found posts with this URL pattern, no need to try others
                            }
                        }
                    } catch (error) {
                        continue;
                    }
                }
                
                if (!foundPostsOnPage) {
                    hasMore = false;
                } else {
                    currentPage++;
                    // Add delay between page requests
                    await this.delay(500);
                }
            }
            
            // If still no posts, try the main page as fallback
            if (posts.length === 0) {
                const mainPageUrl = `https://blog.naver.com/${this.blogId}`;
                
                const response = await requestUrl({
                    url: mainPageUrl,
                    method: 'GET',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                    }
                });

                if (response.text) {
                    const mainPagePosts = this.parsePostListFromHTML(response.text);
                    posts.push(...mainPagePosts);
                }
            }
        } catch (error) {
            throw new Error(`Failed to fetch post list: ${error.message}`);
        }

        return posts;
    }

    private parsePostListFromHTML(html: string): Omit<NaverBlogPost, 'content' | 'blogId' | 'originalTags'>[] {
        const posts: Omit<NaverBlogPost, 'content' | 'blogId' | 'originalTags'>[] = [];
        
        try {
            const $ = cheerio.load(html);
            
            // Look for various post link patterns more aggressively
            const linkSelectors = [
                'a[href*="logNo="]',
                'a[href*="/PostView.naver"]',
                'a[href*="/PostView.nhn"]',
                '.post-item a',
                '.blog-post a',
                '.post-title a',
                '.item_subject a',
                '.list_subject a',
                '[data-log-no]',
                'a[onclick*="logNo"]'
            ];

            // Also look for script tags that might contain post data
            $('script').each((_, script) => {
                const scriptContent = $(script).html();
                if (scriptContent && (scriptContent.includes('logNo') || scriptContent.includes('LogNo'))) {
                    // Try to extract logNo values from JavaScript with more patterns
                    const logPatterns = [
                        /logNo['":\s=]+(\d{8,15})/g,  // Standard logNo pattern
                        /LogNo['":\s=]+(\d{8,15})/g,  // Capital LogNo
                        /"logNo":\s*"?(\d{8,15})"?/g,  // JSON format
                        /'logNo':\s*'?(\d{8,15})'?/g,  // Single quotes
                        /logNo:\s*(\d{8,15})/g,       // Simple colon format
                        /log_no['":\s=]+(\d{8,15})/g  // Underscore format
                    ];
                    
                    logPatterns.forEach(pattern => {
                        let match;
                        while ((match = pattern.exec(scriptContent)) !== null) {
                            const logNo = match[1];
                            // Filter for modern Naver blog logNo format (usually 12+ digits)
                            if (logNo && logNo.length >= 12 && logNo.length <= 15 && !posts.find(p => p.logNo === logNo)) {
                                posts.push({
                                    title: `Post ${logNo}`,
                                    date: new Date().toISOString().split('T')[0],
                                    logNo: logNo,
                                    url: `https://blog.naver.com/${this.blogId}/${logNo}`,
                                    thumbnail: undefined
                                });
                            }
                        }
                    });
                }
            });

            // Look for links with logNo in various formats
            for (const selector of linkSelectors) {
                $(selector).each((_, element) => {
                    const $element = $(element);
                    let href = $element.attr('href');
                    const onclick = $element.attr('onclick');
                    const dataLogNo = $element.attr('data-log-no');
                    
                    // Get logNo from data attribute
                    if (dataLogNo && dataLogNo.length >= 12 && dataLogNo.length <= 15) {
                        const title = $element.text().trim() || $element.attr('title') || `Post ${dataLogNo}`;
                        if (!posts.find(p => p.logNo === dataLogNo)) {
                            posts.push({
                                title: title,
                                date: new Date().toISOString().split('T')[0],
                                logNo: dataLogNo,
                                url: `https://blog.naver.com/${this.blogId}/${dataLogNo}`,
                                thumbnail: undefined
                            });
                        }
                    }
                    
                    // Get logNo from href - improved patterns
                    if (href) {
                        const logNoPatterns = [
                            /logNo=(\d{8,15})/,           // Standard parameter format
                            /\/(\d{8,15})$/,              // URL ending with logNo
                            /\/(\d{8,15})\?/,             // logNo before query params
                            /\/(\d{8,15})#/,              // logNo before hash
                            /postId=(\d{8,15})/,          // Alternative parameter name
                            /log=(\d{8,15})/              // Short parameter name
                        ];
                        
                        for (const pattern of logNoPatterns) {
                            const logNoMatch = href.match(pattern);
                            if (logNoMatch) {
                                const logNo = logNoMatch[1];
                                // Filter for modern Naver blog logNo format (usually 12+ digits)
                                if (logNo.length >= 12 && logNo.length <= 15) {
                                    const title = $element.text().trim() || $element.attr('title') || `Post ${logNo}`;
                                    
                                    if (!posts.find(p => p.logNo === logNo)) {
                                        posts.push({
                                            title: title,
                                            date: new Date().toISOString().split('T')[0],
                                            logNo: logNo,
                                            url: `https://blog.naver.com/${this.blogId}/${logNo}`,
                                            thumbnail: undefined
                                        });
                                    }
                                    break; // Found a match, no need to try other patterns
                                }
                            }
                        }
                    }
                    
                    // Get logNo from onclick - improved patterns
                    if (onclick && (onclick.includes('logNo') || onclick.includes('LogNo'))) {
                        const onclickPatterns = [
                            /logNo['":\s=]*(\d{8,15})/,
                            /LogNo['":\s=]*(\d{8,15})/,
                            /'(\d{8,15})'/,  // Any quoted number
                            /"(\d{8,15})"/   // Any double-quoted number
                        ];
                        
                        for (const pattern of onclickPatterns) {
                            const logNoMatch = onclick.match(pattern);
                            if (logNoMatch) {
                                const logNo = logNoMatch[1];
                                // Filter for modern Naver blog logNo format (usually 12+ digits)
                                if (logNo.length >= 12 && logNo.length <= 15) {
                                    const title = $element.text().trim() || $element.attr('title') || `Post ${logNo}`;
                                    
                                    if (!posts.find(p => p.logNo === logNo)) {
                                        posts.push({
                                            title: title,
                                            date: new Date().toISOString().split('T')[0],
                                            logNo: logNo,
                                            url: `https://blog.naver.com/${this.blogId}/${logNo}`,
                                            thumbnail: undefined
                                        });
                                    }
                                    break; // Found a match, no need to try other patterns
                                }
                            }
                        }
                    }
                });
            }
            
        } catch {

            
            // Continue with next URL format

            
        }
        
        return posts;
    }

    private async fetchPostContent(logNo: string): Promise<{ content: string; title: string; date: string; tags: string[] }> {
        try {
            // Try different URL formats for Naver blog posts
            const urlFormats = [
                `https://blog.naver.com/${this.blogId}/${logNo}`,
                `https://blog.naver.com/PostView.naver?blogId=${this.blogId}&logNo=${logNo}`,
                `https://blog.naver.com/PostView.naver?blogId=${this.blogId}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true`,
                `https://blog.naver.com/PostView.nhn?blogId=${this.blogId}&logNo=${logNo}`
            ];

            for (const postUrl of urlFormats) {
                try {
                    const response = await requestUrl({
                        url: postUrl,
                        method: 'GET',
                        headers: {
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                        }
                    });

                    if (response.status === 200 && response.text) {
                        const parsed = this.parsePostContent(response.text);
                        if (parsed.content && parsed.content.trim() && !parsed.content.includes('[No content could be extracted]')) {
                            return parsed;
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
            
            throw new Error(`All URL formats failed for logNo: ${logNo}`);
        } catch (error) {
            throw new Error(`Failed to fetch content: ${error.message}`);
        }
    }

    private parsePostContent(html: string): { content: string; title: string; date: string; tags: string[] } {
        try {
            const $ = cheerio.load(html);
            let content = '';
            let title = '';
            let date = '';
            const tags: string[] = [];

            // Extract title from various selectors - improved with more specific selectors
            const titleSelectors = [
                // Most specific Naver blog title selectors first
                '.se-title-text',
                '.se_title',
                '.se-title .se-text',
                '.se-module-text h1',
                '.se-module-text h2',
                
                // Meta tag titles
                'meta[property="og:title"]',
                'meta[name="title"]',
                
                // General blog title selectors
                '.blog-title',
                '.post-title',
                '.title_text',
                '.blog_title',
                'h1.title',
                'h2.title',
                'h1',
                'h2',
                
                // Title from head tag
                'title'
            ];

            for (const selector of titleSelectors) {
                const titleElement = $(selector);
                if (titleElement.length > 0) {
                    if (selector.startsWith('meta')) {
                        // For meta tags, get content attribute
                        title = titleElement.attr('content')?.trim() || '';
                    } else {
                        title = titleElement.text().trim();
                    }
                    
                    if (title) {
                        // Clean up title - remove Naver blog suffix patterns
                        title = title.replace(/\s*:\s*네이버\s*블로그\s*$/, '');
                        title = title.replace(/\s*\|\s*네이버\s*블로그\s*$/, '');
                        title = title.replace(/\s*-\s*네이버\s*블로그\s*$/, '');
                        
                        // Remove [ ] brackets if present
                        if (title.includes('[') && title.includes(']')) {
                            title = title.replace(/^\[([^\]]+)\]/, '$1').trim();
                            title = title.replace(/\[([^\]]+)\]$/, '$1').trim();
                        }
                        
                        if (title && title !== 'Untitled') break;
                    }
                }
            }

            // First, try to extract from meta tags (like Python script)
            
            // Debug: list all meta tags
            $('meta').each((_, meta) => {
                const $meta = $(meta);
                
                
                
                
            });

            const metaSelectors = [
                'meta[property="article:published_time"]',
                'meta[property="article:modified_time"]', 
                'meta[name="pubDate"]',
                'meta[name="date"]',
                'meta[name="publish_date"]',
                'meta[name="article:published_time"]',
                'meta[property="og:published_time"]',
                'meta[property="og:updated_time"]',
                'meta[name="DC.date"]',
                'meta[name="DC.Date.created"]',
                'meta[name="created"]',
                'meta[name="date_published"]',
                'meta[name="blogPublishDate"]',
                'meta[property="blog:published_time"]'
            ];

            for (const selector of metaSelectors) {
                const metaElement = $(selector);
                if (metaElement.length > 0) {
                    const metaContent = metaElement.attr('content');
                    if (metaContent) {
                        date = this.parseDate(metaContent);
                        if (date) {
                            break;
                        }
                    }
                }
            }

            // If no meta date found, try visible elements
            if (!date) {
                
                const dateSelectors = [
                    '.se_publishDate',  // This is what naver_blog_md uses!
                    '.se-publishDate',
                    '.blog_author .date',
                    '.post_date',
                    '.date',
                    '.se-date',
                    '.blog-date',
                    '.publish_date',
                    '.post-date',
                    '.blog-post-date',
                    '.entry-date',
                    '.published',
                    '.article-date',
                    '.post-meta .date',
                    '.blog_author .info .date',
                    '.blog_author_info .date',
                    '.post_info .date',
                    'time',
                    '.time',
                    '.datetime',
                    '.blog_author_info',
                    '.blog_author',
                    '.post_info',
                    '.post-meta',
                    '.entry-meta',
                    '.blog-meta'
                ];

                for (const selector of dateSelectors) {
                    const dateElement = $(selector);
                    if (dateElement.length > 0) {
                        const dateText = dateElement.text().trim();
                        const dateAttr = dateElement.attr('datetime') || dateElement.attr('data-date');
                        
                        
                        if (dateAttr) {
                            date = this.parseDate(dateAttr);
                            if (date) {
                                break;
                            }
                        }
                        
                        if (dateText) {
                            date = this.parseDate(dateText);
                            if (date) {
                                break;
                            }
                        }
                    }
                }
            }

            // If still no date found, try to extract from script tags
            if (!date) {
                
                $('script').each((_, script) => {
                    const scriptContent = $(script).html();
                    if (scriptContent) {
                        // Look for various date patterns in JavaScript
                        const datePatterns = [
                            /"publishDate":\s*"([^"]+)"/,
                            /"pubDate":\s*"([^"]+)"/,
                            /"date":\s*"([^"]+)"/,
                            /"addDate":\s*"([^"]+)"/,
                            /"writeDate":\s*"([^"]+)"/,
                            /"postDate":\s*"([^"]+)"/,
                            /'publishDate':\s*'([^']+)'/,
                            /'pubDate':\s*'([^']+)'/,
                            /'date':\s*'([^']+)'/,
                            /'addDate':\s*'([^']+)'/,
                            /publishDate:\s*"([^"]+)"/,
                            /pubDate:\s*"([^"]+)"/,
                            /addDate:\s*"([^"]+)"/,
                            // Look for date patterns like "2024.12.31", "2024-12-31", "20241231"
                            /"(20\d{2}[.-]\d{1,2}[.-]\d{1,2})"/g,
                            /'(20\d{2}[.-]\d{1,2}[.-]\d{1,2})'/g,
                            /(20\d{6})/g // YYYYMMDD format
                        ];
                        
                        for (const pattern of datePatterns) {
                            const matches = scriptContent.match(pattern);
                            if (matches) {
                                for (const match of matches) {
                                    let dateStr = match;
                                    // Extract the date part from quotes if needed
                                    const extractMatch = dateStr.match(/"([^"]+)"|'([^']+)'|(\d+)/);
                                    if (extractMatch) {
                                        dateStr = extractMatch[1] || extractMatch[2] || extractMatch[3];
                                    }
                                    
                                    const parsedDate = this.parseDate(dateStr);
                                    if (parsedDate) {
                                        date = parsedDate;
                                        return false; // Break from each loop
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // Try different selectors for content - prioritize container selectors
            const contentSelectors = [
                '.se-main-container',
                '.post-content',
                '.blog-content',
                '#post-content',
                '.post_ct',
                '.post-view',
                '.post_area',
                '.blog_content',
                'body' // fallback to parse all se-components in document order
            ];

            for (const selector of contentSelectors) {
                const element = $(selector);
                if (element.length > 0) {
                    content = this.extractTextFromElement(element, $);
                    if (content.trim().length > 0) {
                        break;
                    }
                }
            }

            // If no content found, try to extract from script tags (for newer blogs)
            if (!content.trim()) {
                content = this.extractContentFromScripts(html);
            }
            
            // Additional fallback: try to find images anywhere in the HTML
            // if (content.trim()) {
            //     content = this.extractAdditionalImages(html, content);
            // }

            // Clean up the content
            content = this.cleanContent(content);

            // Extract tags from the blog post
            // Look for tag list container with various selectors
            const tagSelectors = [
                'div[id^="tagList_"] a span.ell',
                '.wrap_tag a.item span.ell',
                '.post_tag a span',
                '.tag_area a',
                '.se-tag a',
                'a.itemTagfont span.ell'
            ];

            for (const selector of tagSelectors) {
                $(selector).each((_: number, el: Element) => {
                    let tagText = $(el).text().trim();
                    // Remove # prefix if present
                    if (tagText.startsWith('#')) {
                        tagText = tagText.substring(1);
                    }
                    if (tagText && !tags.includes(tagText)) {
                        tags.push(tagText);
                    }
                });
                if (tags.length > 0) break;
            }

            return {
                content: content || '[No content could be extracted]',
                title: title || 'Untitled',
                date: date || new Date().toISOString().split('T')[0],
                tags: tags
            };
        } catch (error) {
            throw new Error(`Failed to parse content: ${error.message}`);
        }
    }

    /**
     * Parse oembed component (YouTube, etc.) and extract link
     * Uses Obsidian's native embed syntax: ![title](url) for YouTube
     */
    private parseOembedComponent($component: Cheerio<AnyNode>, $: CheerioAPI): string {
        // Try to get data from script tag with data-module or data-module-v2
        const scriptEl = $component.find('script.__se_module_data, script[data-module]');

        if (scriptEl.length > 0) {
            const moduleData = scriptEl.attr('data-module-v2') || scriptEl.attr('data-module');
            if (moduleData) {
                try {
                    const data = JSON.parse(moduleData);
                    const oembedData = data.data;

                    if (oembedData) {
                        const url = oembedData.inputUrl || oembedData.url || '';
                        const title = oembedData.title || '';

                        if (url) {
                            // YouTube: Use Obsidian native embed syntax
                            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                                return `![${title || 'YouTube'}](${url})\n\n`;
                            }
                            // Other embeds: Use link format
                            return `[${title || '임베드 콘텐츠'}](${url})\n\n`;
                        }
                    }
                } catch {
                    // Fall through to iframe check
                }
            }
        }

        // Fallback: try to extract URL from iframe src
        const iframe = $component.find('iframe');
        if (iframe.length > 0) {
            const src = iframe.attr('src') || '';
            const title = iframe.attr('title') || '';

            // Convert YouTube embed URL to watch URL
            if (src.includes('youtube.com/embed/')) {
                const videoId = src.match(/embed\/([^?&]+)/)?.[1];
                if (videoId) {
                    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
                    return `![${title || 'YouTube'}](${watchUrl})\n\n`;
                }
            }

            if (src) {
                return `[${title || '임베드 콘텐츠'}](${src})\n\n`;
            }
        }

        return '[임베드 콘텐츠]\n';
    }

    private extractTextFromElement(element: Cheerio<unknown>, $: CheerioAPI): string {
        let content = '';
        
        // Use Python library approach: find .se-main-container first, then .se-component
        const mainContainer = $('.se-main-container');
        
        let components;
        if (mainContainer.length > 0) {
            components = mainContainer.find('.se-component').toArray();
        } else {
            components = $('.se-component').toArray();
        }
        
        
        // Process components in document order to maintain text-image flow
        const allComponents = components;
        
        allComponents.forEach((el: Element) => {
            const $el = $(el);

            // Handle different component types
            if ($el.hasClass('se-component')) {
                if ($el.hasClass('se-text')) {
                    // Text component - process all children in DOM order (p, ul, ol)
                    const textModule = $el.find('.se-module-text');
                    if (textModule.length > 0) {
                        // Process all direct children in DOM order to maintain text flow
                        textModule.children().each((_: number, child: Element) => {
                            const $child = $(child);
                            const tagName = child.tagName.toLowerCase();

                            if (tagName === 'p') {
                                // Regular paragraph
                                const paragraphText = $child.text().trim();
                                if (paragraphText && !paragraphText.startsWith('#')) {
                                    content += paragraphText + '\n';
                                }
                            } else if (tagName === 'ul' || tagName === 'ol') {
                                // List (ordered or unordered)
                                const isOrdered = tagName === 'ol';
                                const listItems = $child.find('li');

                                listItems.each((index: number, li: Element) => {
                                    const $li = $(li);
                                    const listItemText = $li.text().trim();
                                    if (listItemText && !listItemText.startsWith('#')) {
                                        if (isOrdered) {
                                            content += `${index + 1}. ${listItemText}\n`;
                                        } else {
                                            content += `- ${listItemText}\n`;
                                        }
                                    }
                                });
                                content += '\n'; // Add space after list
                            }
                        });

                        // Fallback: if no children processed, try to get paragraphs directly
                        if (textModule.children().length === 0) {
                            textModule.find('p').each((_: number, p: Element) => {
                                const $p = $(p);
                                const paragraphText = $p.text().trim();
                                if (paragraphText && !paragraphText.startsWith('#')) {
                                    content += paragraphText + '\n';
                                }
                            });
                        }
                    }
                } else if ($el.hasClass('se-sectionTitle')) {
                    // Section title
                    const titleContent = $el.find('.se-module-text').text().trim();
                    if (titleContent) {
                        content += `## ${titleContent}\n\n`;
                    }
                } else if ($el.hasClass('se-quotation')) {
                    // Quotation - improved handling like Python script
                    const quoteElements = $el.find('.se-quote');
                    const citeElement = $el.find('.se-cite');
                    
                    if (quoteElements.length > 0) {
                        const quoteParts: string[] = [];
                        quoteElements.each((_: number, quote: Element) => {
                            const quoteText = $(quote).text().trim();
                            if (quoteText) {
                                quoteParts.push(`> ${quoteText}`);
                            }
                        });
                        
                        if (quoteParts.length > 0) {
                            content += '\n' + quoteParts.join('\n') + '\n';
                            
                            const citeText = citeElement.length > 0 ? citeElement.text().trim() : 'No Site';
                            if (citeText && citeText !== 'No Site') {
                                content += `\n출처: ${citeText}\n\n`;
                            } else {
                                content += '\n';
                            }
                        }
                    }
                } else if ($el.hasClass('se-image')) {
                    // Image component - with comprehensive image source detection
                    const imgElement = $el.find('img');
                    const videoElement = $el.find('video._gifmp4, video[src*="mblogvideo-phinf"]');
                    const caption = $el.find('.se-caption').text().trim();

                    // Check for GIF MP4 video first (Naver converts GIFs to MP4 videos)
                    // These are actual video files, so we keep them as links instead of images
                    if (videoElement.length > 0) {
                        let videoSrc = videoElement.attr('src') || videoElement.attr('data-gif-url');
                        if (videoSrc) {
                            const altText = caption || '동영상';
                            content += `[${altText}](${videoSrc})\n`;
                            if (caption) {
                                content += `*${caption}*\n`;
                            }
                        }
                    } else if (imgElement.length > 0) {
                        // First, try to find original image URL from Naver link data
                        let imgSrc = this.extractOriginalImageUrl($el, imgElement);
                        
                        // Fallback to standard image source attributes if original URL not found
                        if (!imgSrc) {
                            imgSrc = imgElement.attr('data-lazy-src') || 
                                   imgElement.attr('src') || 
                                   imgElement.attr('data-src') ||
                                   imgElement.attr('data-original') ||
                                   imgElement.attr('data-image-src') ||
                                   imgElement.attr('data-url') ||
                                   imgElement.attr('data-original-src');
                        }
                        
                        // Additional fallback: scan all data attributes for image URLs
                        if (!imgSrc) {
                            const dataAttrs = imgElement[0]?.attributes;
                            if (dataAttrs) {
                                for (let i = 0; i < dataAttrs.length; i++) {
                                    const attr = dataAttrs[i] as { name: string; value: string };
                                    if (attr.name.includes('src') || attr.name.includes('url')) {
                                        if (attr.value && (attr.value.startsWith('http') || attr.value.startsWith('//'))) {
                                            imgSrc = attr.value;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        
                        if (imgSrc) {
                            // Filter out profile and UI images
                            if (this.shouldIncludeImage(imgSrc, caption)) {
                                // Enhance image URL to get larger resolution
                                imgSrc = this.enhanceImageUrl(imgSrc);
                                
                                // Create markdown image with caption
                                const altText = caption || imgElement.attr('alt') || imgElement.attr('title') || 'Blog Image';
                                content += `![${altText}](${imgSrc})\n`;
                                if (caption) {
                                    content += `*${caption}*\n`;
                                }
                            }
                        } else {
                            // Fallback to placeholder
                            content += caption ? `[이미지: ${caption}]\n` : `[이미지]\n`;
                        }
                    } else {
                        // Check for background-image styles, inline styles, or other image containers
                        let bgImageSrc = null;
                        
                        // Check background-image in style attribute
                        const bgImageMatch = $el.attr('style')?.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/);
                        if (bgImageMatch) {
                            bgImageSrc = bgImageMatch[1];
                        }
                        
                        // Check for nested elements that might contain images
                        if (!bgImageSrc) {
                            $el.find('*').each((_: number, nestedEl: Element) => {
                                const $nested = $(nestedEl);
                                const nestedStyle = $nested.attr('style');
                                if (nestedStyle) {
                                    const nestedBgMatch = nestedStyle.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/);
                                    if (nestedBgMatch) {
                                        bgImageSrc = nestedBgMatch[1];
                                        return false; // Break the loop
                                    }
                                }
                                
                                // Also check data attributes on nested elements
                                const dataAttrs = nestedEl.attributes;
                                if (dataAttrs) {
                                    for (let i = 0; i < dataAttrs.length; i++) {
                                        const attr = dataAttrs[i] as { name: string; value: string };
                                        if ((attr.name.includes('src') || attr.name.includes('url')) && 
                                            attr.value && (attr.value.startsWith('http') || attr.value.startsWith('//'))) {
                                            bgImageSrc = attr.value;
                                            return false;
                                        }
                                    }
                                }
                            });
                        }
                        
                        if (bgImageSrc) {
                            const altText = caption || 'Blog Image';
                            content += `![${altText}](${bgImageSrc})\n`;
                            if (caption) {
                                content += `*${caption}*\n`;
                            }
                        } else {
                            // No img element found
                            content += caption ? `[이미지: ${caption}]\n` : `[이미지]\n`;
                        }
                    }
                } else if ($el.hasClass('se-imageGroup')) {
                    // Image Group (slideshow/carousel) component
                    const imageItems = $el.find('.se-imageGroup-item');
                    const groupCaption = $el.find('.se-caption').text().trim();

                    imageItems.each((_: number, item: Element) => {
                        const $item = $(item);
                        const imgElement = $item.find('img');

                        if (imgElement.length > 0) {
                            // Try to extract original image URL from link data
                            let imgSrc = this.extractOriginalImageUrl($item, imgElement);

                            // Fallback to standard image source attributes
                            if (!imgSrc) {
                                imgSrc = imgElement.attr('data-lazy-src') ||
                                       imgElement.attr('src') ||
                                       imgElement.attr('data-src') ||
                                       imgElement.attr('data-original') ||
                                       imgElement.attr('data-image-src');
                            }

                            if (imgSrc && this.shouldIncludeImage(imgSrc, '')) {
                                imgSrc = this.enhanceImageUrl(imgSrc);
                                const altText = imgElement.attr('alt') || imgElement.attr('title') || 'Blog Image';
                                content += `![${altText}](${imgSrc})\n`;
                            }
                        }
                    });

                    // Add group caption at the end
                    if (groupCaption) {
                        content += `*${groupCaption}*\n`;
                    }
                    content += '\n';
                } else if ($el.hasClass('se-file')) {
                    // File attachment component
                    const fileName = $el.find('.se-file-name').text().trim();
                    const fileExt = $el.find('.se-file-extension').text().trim();
                    const downloadLink = $el.find('a.se-file-save-button').attr('href');

                    if (fileName && downloadLink) {
                        const fullFileName = fileName + fileExt;
                        content += `📎 [${fullFileName}](${downloadLink})\n\n`;
                    } else if (fileName) {
                        content += `📎 ${fileName}${fileExt} (다운로드 링크 없음)\n\n`;
                    }
                } else if ($el.hasClass('se-oglink')) {
                    // Open Graph link preview component
                    const linkEl = $el.find('a.se-oglink-info, a.se-oglink-thumbnail').first();
                    const linkUrl = linkEl.attr('href') || '';
                    const title = $el.find('.se-oglink-title').text().trim();
                    const summary = $el.find('.se-oglink-summary').text().trim();
                    const domain = $el.find('.se-oglink-url').text().trim();

                    if (linkUrl && title) {
                        content += `> 🔗 **[${title}](${linkUrl})**\n`;
                        if (summary) {
                            content += `> ${summary}\n`;
                        }
                        if (domain) {
                            content += `> *${domain}*\n`;
                        }
                        content += '\n';
                    } else if (linkUrl) {
                        content += `🔗 ${linkUrl}\n\n`;
                    }
                } else if ($el.hasClass('se-code')) {
                    // Code component - improved like Python script
                    const codeElements = $el.find('.se-code-source');
                    if (codeElements.length > 0) {
                        const codeParts: string[] = [];
                        codeElements.each((_: number, code: Element) => {
                            let codeContent = $(code).text();
                            // Clean up code like Python script
                            if (codeContent.startsWith('\n')) {
                                codeContent = codeContent.substring(1);
                            }
                            if (codeContent.endsWith('\n')) {
                                codeContent = codeContent.slice(0, -1);
                            }
                            if (codeContent.trim()) {
                                codeParts.push("```\n" + codeContent.trim() + "\n```");
                            }
                        });
                        if (codeParts.length > 0) {
                            content += codeParts.join('\n\n') + '\n';
                        }
                    }
                } else if ($el.hasClass('se-horizontalLine')) {
                    // Horizontal line
                    content += '---\n';
                } else if ($el.hasClass('se-material')) {
                    // Material component - improved like Python script
                    const materialElements = $el.find('a.se-module-material');
                    if (materialElements.length > 0) {
                        const materialParts: string[] = [];
                        materialElements.each((_: number, material: Element) => {
                            const $material = $(material);
                            const linkData = $material.attr('data-linkdata');
                            if (linkData) {
                                try {
                                    const data = JSON.parse(linkData);
                                    const title = data.title || 'No Title';
                                    const link = data.link || '#';
                                    const type = data.type || 'Unknown';
                                    materialParts.push(`[${title}](${link}) (${type})`);
                                } catch {
                                    materialParts.push('[자료]');
                                }
                            } else {
                                materialParts.push('[자료]');
                            }
                        });
                        if (materialParts.length > 0) {
                            content += materialParts.join('\n\n') + '\n';
                        } else {
                            content += '[자료]\n';
                        }
                    }
                } else if ($el.hasClass('se-video')) {
                    // Video component
                    content += '[비디오]\n';
                } else if ($el.hasClass('se-oembed')) {
                    // Embedded content (YouTube, etc.)
                    content += this.parseOembedComponent($el, $);
                } else if ($el.hasClass('se-table')) {
                    // Table component
                    content += '[표]\n';
                } else {
                    // Fallback: extract any text with better paragraph handling
                    const textContent = $el.text().trim();
                    if (textContent && textContent.length > 10 && !textContent.startsWith('#')) {
                        // Try to maintain paragraph structure
                        const paragraphs = textContent.split(/\n\s*\n/);
                        paragraphs.forEach((paragraph: string) => {
                            const trimmed = paragraph.trim();
                            if (trimmed && !trimmed.startsWith('#')) {
                                content += trimmed + '\n';
                            }
                        });
                    }
                }
            }
        });
        
        return content;
    }

    private extractContentFromScripts(html: string): string {
        try {
            // Look for JSON data in script tags
            const scriptRegex = /<script[^>]*>(.*?)<\/script>/gis;
            let match;
            
            while ((match = scriptRegex.exec(html)) !== null) {
                const scriptContent = match[1];
                
                // Look for post content in various formats
                if (scriptContent.includes('postContent') || scriptContent.includes('components')) {
                    try {
                        // Try to extract JSON data
                        const jsonMatch = scriptContent.match(/\{.*"components".*\}/s);
                        if (jsonMatch) {
                            const data = JSON.parse(jsonMatch[0]);
                            return this.extractContentFromComponents(data.components || []);
                        }
                    } catch (error) {
                        // Continue to next script
                        continue;
                    }
                }
            }
            
            return '';
        } catch (error) {
            return '';
        }
    }

    private extractContentFromComponents(components: BlogComponent[]): string {
        let content = '';

        for (const component of components) {
            const type = component.componentType;
            const data = component.data || {};
            
            switch (type) {
                case 'se-text':
                    if (data.text) {
                        // Handle HTML in JSON text data
                        const textContent = data.text.replace(/<[^>]*>/g, '').trim();
                        if (textContent && !textContent.startsWith('#')) {
                            // Split into paragraphs if it's a long text
                            const paragraphs = textContent.split(/\n\s*\n/);
                            paragraphs.forEach((paragraph: string) => {
                                const trimmed = paragraph.trim();
                                if (trimmed && !trimmed.startsWith('#')) {
                                    content += trimmed + '\n';
                                }
                            });
                        }
                    }
                    break;
                case 'se-sectionTitle':
                    if (data.text) {
                        content += `## ${data.text}\n\n`;
                    }
                    break;
                case 'se-quotation':
                    if (data.quote) {
                        content += `\n> ${data.quote}\n`;
                        const cite = data.cite || 'No Site';
                        if (cite && cite !== 'No Site') {
                            content += `\n출처: ${cite}\n\n`;
                        } else {
                            content += '\n';
                        }
                    }
                    break;
                case 'se-image': {
                    // Image - with comprehensive image source detection
                    const imageUrl = data.src || data.url || data.imageUrl || data.imageInfo?.url;
                    if (imageUrl) {
                        const altText = data.caption || data.alt || data.title || 'Blog Image';
                        content += `![${altText}](${imageUrl})\n`;
                        if (data.caption) {
                            content += `*${data.caption}*\n`;
                        }
                    } else {
                        // Check nested image data
                        if (data.imageInfo && data.imageInfo.src) {
                            const altText = data.caption || data.imageInfo.alt || 'Blog Image';
                            content += `![${altText}](${data.imageInfo.src})\n`;
                            if (data.caption) {
                                content += `*${data.caption}*\n`;
                            }
                        } else {
                            // Fallback to placeholder
                            content += data.caption ? `[이미지: ${data.caption}]\n` : `[이미지]\n`;
                        }
                    }
                    break;
                }
                case 'se-code':
                    if (data.code) {
                        let cleanCode = data.code;
                        // Clean up code like Python script
                        if (cleanCode.startsWith('\n')) {
                            cleanCode = cleanCode.substring(1);
                        }
                        if (cleanCode.endsWith('\n')) {
                            cleanCode = cleanCode.slice(0, -1);
                        }
                        content += '```\n' + cleanCode.trim() + '\n```\n';
                    }
                    break;
                case 'se-horizontalLine':
                    content += '---\n';
                    break;
                case 'se-material':
                    if (data.title && data.link) {
                        const type = data.type || 'Unknown';
                        content += `[${data.title}](${data.link}) (${type})\n`;
                    } else {
                        content += '[자료]\n';
                    }
                    break;
                case 'se-video':
                    content += '[비디오]\n';
                    break;
                case 'se-oembed': {
                    // Embedded content (YouTube, etc.) - Use Obsidian native embed syntax
                    const oembedData = data as Record<string, string>;
                    const oembedUrl = oembedData.inputUrl || oembedData.url || '';
                    const oembedTitle = oembedData.title || '';

                    if (oembedUrl) {
                        if (oembedUrl.includes('youtube.com') || oembedUrl.includes('youtu.be')) {
                            content += `![${oembedTitle || 'YouTube'}](${oembedUrl})\n\n`;
                        } else {
                            content += `[${oembedTitle || '임베드 콘텐츠'}](${oembedUrl})\n\n`;
                        }
                    } else {
                        content += '[임베드 콘텐츠]\n';
                    }
                    break;
                }
                case 'se-table':
                    content += '[표]\n';
                    break;
                default:
                    // For unknown components, try to extract any text
                    if (data.text) {
                        content += data.text + '\n';
                    }
                    break;
            }
        }
        
        return content;
    }

    private cleanContent(content: string): string {
        let cleanedContent = content
            .replace(/\r\n/g, '\n') // Normalize line endings
            .replace(/\r/g, '\n') // Normalize line endings
            .replace(/[ \u00A0]{2,}/g, ' ') // Replace multiple spaces and non-breaking spaces
            .replace(/\u00A0/g, ' ') // Replace non-breaking spaces with regular spaces
            .replace(/\t/g, ' '); // Replace tabs with spaces

        // Remove blog metadata patterns from the beginning of content
        const lines = cleanedContent.split('\n');
        const cleanedLines: string[] = [];
        let skipMetadata = true;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip metadata patterns at the beginning
            if (skipMetadata) {
                // Common blog metadata patterns to remove
                const metadataPatterns = [
                    /^\d{4}\s+투르\s+드\s+프랑스.*$/,        // "2025 투르 드 프랑스 스테이지 9: 유럽의 별, 팀 메를리에 더블 승리."
                    /^[가-힣\s]+\s+뉴스$/,                    // "사이클링 뉴스"
                    /^\d{4}\s+[가-힣\s:,]+\.$/,            // "2025 투르 드 프랑스 스테이지 9: ..." (일반적인 긴 제목)
                    /^아다미$/,                            // "아다미" (구체적인 이름)
                    /^글$/,                                // "글" (단독) - 우선순위 높게
                    /^・$/,                                // "・" 구분자 - 우선순위 높게
                    /^[가-힣]{1,4}$/,                       // 1-4글자 단일 한글 단어 (아다미 같은 이름 포함)
                    /^\d+시간?\s*전$/,                      // "7시간 전"
                    /^URL\s*복사$/,                        // "URL 복사"
                    /^이웃추가$/,                          // "이웃추가"
                    /^본문\s*기타\s*기능$/,                 // "본문 기타 기능"
                    /^공유하기$/,                          // "공유하기"
                    /^신고하기$/,                          // "신고하기"
                    /^글-[가-힣]+$/,                       // "글-장영한"
                    /^[가-힣]+님의\s*블로그$/,               // "xxx님의 블로그"
                    /^구독하기$/,                          // "구독하기"
                    /^좋아요$/,                            // "좋아요"
                    /^댓글$/,                              // "댓글"
                    /^스크랩$/,                            // "스크랩"
                    /^전체보기$/,                          // "전체보기"
                    /^카테고리\s*이동$/,                    // "카테고리 이동"
                    /^\d+\.\d+\.\d+\.\s*\d{2}:\d{2}$/,     // "2025.1.15. 14:30" 형태의 날짜
                    /^작성자\s*[가-힣]+$/,                  // "작성자 홍길동"
                    /^[\d,]+\s*조회$/,                     // "1,234 조회"
                    /^태그\s*#[가-힣\s#]+$/,               // "태그 #사이클링 #뉴스"
                    /^제목$/,                              // "제목"
                    /^내용$/,                              // "내용"
                    /^작성일$/,                            // "작성일"
                    /^[・·•‧⋅]$/,                         // 다양한 형태의 점 구분자
                    /^[가-힣]\s*[・·•‧⋅]\s*[가-힣]$/,      // "글 ・ 제목" 형태
                    /^[가-힣]{1}\s*$/,                     // 단일 한글 문자 + 공백
                    // 사이클링 관련 특수 패턴
                    /^.*팀\s+메를리에.*$/,                  // "팀 메를리에 더블 승리" 등
                    /^.*스테이지\s+\d+.*$/,                // "스테이지 9" 등
                    /^유럽의\s*별.*$/                      // "유럽의 별" 등
                ];

                // Additional check for very short Korean text
                const isShortKorean = /^[가-힣]{1,2}\s*$/.test(line) && line.length <= 3;

                // Check if the line matches any metadata pattern
                const isMetadata = metadataPatterns.some(pattern => pattern.test(line)) || isShortKorean;
                
                // Also skip very short lines that are likely metadata
                const isShortLine = line.length > 0 && line.length <= 2;
                
                // Skip if it's metadata or very short, but don't skip empty lines
                if (line.length > 0 && (isMetadata || isShortLine)) {
                    continue;
                }
                
                // If we hit a substantial content line (more than 10 characters), stop skipping
                if (line.length > 10) {
                    skipMetadata = false;
                }
            }
            
            // Add the line if it's not empty or if we're past the metadata section
            if (line.length > 0 || !skipMetadata) {
                cleanedLines.push(line);
            }
        }

        // Process lines to preserve intentional spacing around quotes and other elements
        const finalLines: string[] = [];
        for (let i = 0; i < cleanedLines.length; i++) {
            const line = cleanedLines[i];
            const prevLine = i > 0 ? cleanedLines[i - 1] : '';
            const nextLine = i < cleanedLines.length - 1 ? cleanedLines[i + 1] : '';
            
            // If this is an empty line
            if (line.length === 0) {
                // Preserve empty lines around quotes
                const isAroundQuote = prevLine.startsWith('>') || nextLine.startsWith('>') || 
                                      prevLine.startsWith('출처:') || nextLine.startsWith('출처:');
                
                // Preserve empty lines around headings
                const isAroundHeading = prevLine.startsWith('#') || nextLine.startsWith('#');
                
                // Preserve empty lines around images
                const isAroundImage = prevLine.startsWith('![') || nextLine.startsWith('![');
                
                if (isAroundQuote || isAroundHeading || isAroundImage) {
                    finalLines.push(line);
                }
                // Otherwise, skip the empty line
            } else {
                finalLines.push(line);
            }
        }
        
        return finalLines.join('\n');
    }

    private parseDate(dateText: string): string {
        try {
            
            // Clean up the input
            const cleanText = dateText.trim().replace(/\s+/g, ' ');
            
            // Handle various Korean and international date formats
            const patterns = [
                /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*\d{1,2}:\d{2}/,  // 2024. 05. 22. 14:30 (Naver format)
                /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/,  // 2024. 01. 01 or 2024.01.01
                /(\d{4})-(\d{1,2})-(\d{1,2})/,   // 2024-01-01
                /(\d{4})\/(\d{1,2})\/(\d{1,2})/,  // 2024/01/01
                /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/, // 2024년 01월 01일
                /(\d{1,2})\.(\d{1,2})\.(\d{4})/,  // 01.01.2024
                /(\d{1,2})-(\d{1,2})-(\d{4})/,   // 01-01-2024
                /(\d{1,2})\/(\d{1,2})\/(\d{4})/,  // 01/01/2024
                /(\d{4})(\d{2})(\d{2})/,         // 20240101
            ];

            for (const pattern of patterns) {
                const match = cleanText.match(pattern);
                if (match) {
                    let year, month, day;
                    
                    if (match[1].length === 4) {
                        // Year first format
                        year = match[1];
                        month = match[2].padStart(2, '0');
                        day = match[3].padStart(2, '0');
                    } else if (match[3].length === 4) {
                        // Year last format
                        year = match[3];
                        month = match[1].padStart(2, '0');
                        day = match[2].padStart(2, '0');
                    } else if (match[0].length === 8) {
                        // YYYYMMDD format
                        year = match[1];
                        month = match[2];
                        day = match[3];
                    }
                    
                    if (year && month && day) {
                        // Validate the date
                        const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                        if (dateObj.getFullYear() == parseInt(year) && 
                            dateObj.getMonth() == parseInt(month) - 1 && 
                            dateObj.getDate() == parseInt(day)) {
                            const result = `${year}-${month}-${day}`;
                            return result;
                        }
                    }
                }
            }

            // Try to parse as ISO date or other standard formats
            const date = new Date(cleanText);
            if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
                const result = date.toISOString().split('T')[0];
                return result;
            }

            // Look for any 4-digit year in the text
            const yearMatch = cleanText.match(/20\d{2}/);
            if (yearMatch) {
                const year = yearMatch[0];
                // Look for month and day around the year
                const fullMatch = cleanText.match(new RegExp(`(\\d{1,2})[^\\d]*${year}[^\\d]*(\\d{1,2})|${year}[^\\d]*(\\d{1,2})[^\\d]*(\\d{1,2})`));
                if (fullMatch) {
                    let month, day;
                    if (fullMatch[1] && fullMatch[2]) {
                        // Month Year Day or Day Year Month
                        month = fullMatch[1].padStart(2, '0');
                        day = fullMatch[2].padStart(2, '0');
                    } else if (fullMatch[3] && fullMatch[4]) {
                        // Year Month Day
                        month = fullMatch[3].padStart(2, '0');
                        day = fullMatch[4].padStart(2, '0');
                    }
                    
                    if (month && day) {
                        return `${year}-${month}-${day}`;
                    }
                }
            }

            return '';
        } catch (error) {
            return '';
        }
    }

    private formatDate(dateStr: string): string {
        try {
            // Handle various date formats from Naver
            if (!dateStr) return new Date().toISOString().split('T')[0];
            
            // Try to parse the date
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) {
                return new Date().toISOString().split('T')[0];
            }
            
            return date.toISOString().split('T')[0];
        } catch (error) {
            return new Date().toISOString().split('T')[0];
        }
    }

    private extractAdditionalImages(html: string, existingContent: string): string {
        try {
            const $ = cheerio.load(html);
            let additionalImages: string[] = [];
            
            // Find all img elements that might not have been caught - but filter content images only
            $('img').each((_, img) => {
                const $img = $(img);
                const imgSrc = $img.attr('data-lazy-src') || 
                             $img.attr('src') || 
                             $img.attr('data-src') ||
                             $img.attr('data-original') ||
                             $img.attr('data-image-src') ||
                             $img.attr('data-url');
                
                if (imgSrc && (imgSrc.startsWith('http') || imgSrc.startsWith('//'))) {
                    // Check if this image is already in the content
                    if (!existingContent.includes(imgSrc)) {
                        // Only add if it's likely a content image, not UI element
                        if (this.isContentImage($img, imgSrc)) {
                            const alt = $img.attr('alt') || $img.attr('title') || 'Additional Image';
                            additionalImages.push(`![${alt}](${imgSrc})`);
                        }
                    }
                }
            });
            
            // Find images in style attributes
            $('*[style*="background-image"]').each((_, el) => {
                const style = $(el).attr('style');
                if (style) {
                    const bgMatch = style.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/);
                    if (bgMatch && bgMatch[1]) {
                        const imgSrc = bgMatch[1];
                        if ((imgSrc.startsWith('http') || imgSrc.startsWith('//')) && !existingContent.includes(imgSrc)) {
                            // Filter out background images using same logic as content images
                            if (this.shouldIncludeImage(imgSrc, 'Background Image')) {
                                additionalImages.push(`![Background Image](${imgSrc})`);
                            }
                        }
                    }
                }
            });
            
            // Append additional images to content if found
            if (additionalImages.length > 0) {
                return existingContent + '\n\n' + additionalImages.join('\n\n') + '\n';
            }
            
            return existingContent;
        } catch (error) {
            return existingContent;
        }
    }

    private createErrorContent(post: Omit<NaverBlogPost, 'content' | 'blogId' | 'originalTags'>, error: unknown): string {
        const timestamp = new Date().toISOString();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        return `# ⚠️ 콘텐츠 가져오기 실패

## 포스트 정보
- **LogNo**: ${post.logNo}
- **URL**: [${post.url}](${post.url})
- **제목**: ${post.title || '제목 없음'}
- **날짜**: ${post.date || '날짜 없음'}
- **썸네일**: ${post.thumbnail || '썸네일 없음'}

## 오류 정보
- **오류 시간**: ${timestamp}
- **오류 메시지**: ${errorMessage}

## 문제 해결 방법
1. 네이버 블로그에서 직접 포스트를 확인해보세요
2. 포스트가 비공개 또는 삭제되었을 수 있습니다
3. 네트워크 연결 상태를 확인해보세요
4. 나중에 다시 시도해보세요

---
*이 파일은 자동으로 생성된 오류 로그입니다.*`;
    }

    private shouldIncludeImage(imgSrc: string, caption?: string): boolean {
        // Filter out profile and UI images specifically in content extraction

        // Skip ssl.pstatic.net profile images
        if (imgSrc.includes('ssl.pstatic.net/static/blog/profile/')) {
            return false;
        }

        // Allow Naver video/GIF CDN images (content videos/GIFs)
        if (imgSrc.includes('mblogvideo-phinf.pstatic.net')) {
            return true;
        }

        // Skip obvious UI patterns (GIF removed - handled by domain check above)
        const uiPatterns = [
            /se-sticker/i,
            /se-emoticon/i,
            /editor/i,
            /icon/i,
            /logo/i,
            /button/i,
            /thumb/i,
            /loading/i,
            /spinner/i,
            /1x1/,
            /spacer/i,
            /profile/i,
            /defaultimg/i,
            /bg_/i,
            /background/i,
            /_bg/i
        ];
        
        for (const pattern of uiPatterns) {
            if (pattern.test(imgSrc)) {
                return false;
            }
        }
        
        // Check caption for UI indicators
        if (caption) {
            const uiCaptions = [
                /profile/i,
                /background/i,
                /프로필/i,
                /배경/i,
                /아이콘/i,
                /icon/i
            ];
            
            for (const pattern of uiCaptions) {
                if (pattern.test(caption)) {
                    return false;
                }
            }
        }
        
        return true;
    }

    private isContentImage($img: Cheerio<Element>, imgSrc: string): boolean {
        // Check if image is likely a content image vs UI element

        // Skip ssl.pstatic.net profile images - same as shouldIncludeImage
        if (imgSrc.includes('ssl.pstatic.net/static/blog/profile/')) {
            return false;
        }

        // Allow Naver video/GIF CDN images (content videos/GIFs)
        if (imgSrc.includes('mblogvideo-phinf.pstatic.net')) {
            return true;
        }

        // Skip obvious UI patterns (GIF removed - handled by domain check above)
        const uiPatterns = [
            /se-sticker/i,
            /se-emoticon/i,
            /editor/i,
            /icon/i,
            /logo/i,
            /button/i,
            /thumb/i,
            /loading/i,
            /spinner/i,
            /1x1/,
            /spacer/i,
            /profile/i,
            /defaultimg/i,
            /bg_/i,
            /background/i,
            /_bg/i
        ];
        
        for (const pattern of uiPatterns) {
            if (pattern.test(imgSrc)) {
                return false;
            }
        }
        
        // Check parent elements - content images are usually in content containers
        const $parent = $img.closest('.se-component, .se-text, .se-image, .post-content, .blog-content');
        if ($parent.length === 0) {
            // If not in a content container, likely a UI element
            return false;
        }
        
        // Check image size attributes - very small images are likely UI elements
        const width = parseInt($img.attr('width') || '0');
        const height = parseInt($img.attr('height') || '0');
        
        if ((width > 0 && width < 50) || (height > 0 && height < 50)) {
            return false;
        }
        
        // Check CSS classes for UI indicators
        const className = $img.attr('class') || '';
        const uiClasses = ['icon', 'logo', 'button', 'ui', 'editor', 'control'];
        if (uiClasses.some(cls => className.toLowerCase().includes(cls))) {
            return false;
        }
        
        return true;
    }

    private extractOriginalImageUrl($el: Cheerio<Element>, imgElement: Cheerio<Element>): string | null {
        // Try to extract original image URL from Naver blog's data-linkdata attribute
        const imageLink = $el.find('a.__se_image_link, a.se-module-image-link');
        
        if (imageLink.length > 0) {
            const linkData = imageLink.attr('data-linkdata');
            if (linkData) {
                try {
                    const data = JSON.parse(linkData);
                    if (data.src) {
                        return data.src;
                    }
                } catch {

                                    // Continue parsing

                }
            }
        }
        
        // Also check script tags for image data (newer Naver blogs)
        const scriptElement = $el.find('script.__se_module_data, script[data-module-v2]');
        if (scriptElement.length > 0) {
            const scriptContent = scriptElement.attr('data-module-v2') || scriptElement.html();
            if (scriptContent) {
                try {
                    const data = JSON.parse(scriptContent);
                    if (data.data && data.data.src) {
                        return data.data.src;
                    }
                    if (data.data && data.data.imageInfo && data.data.imageInfo.src) {
                        return data.data.imageInfo.src;
                    }
                } catch {

                                    // Continue parsing

                }
            }
        }
        
        // Check for Naver's image data in surrounding elements
        const parentComponent = $el.closest('.se-component');
        if (parentComponent.length > 0) {
            // Look for data attributes in parent component
            const dataAttrs = (parentComponent[0] as unknown as { attribs?: Record<string, unknown> })?.attribs;
            if (dataAttrs) {
                for (let i = 0; i < dataAttrs.length; i++) {
                    const attr = dataAttrs[i] as { name: string; value: string };
                    if (attr.name.includes('data-') && attr.value.includes('https://postfiles.pstatic.net')) {
                        try {
                            // Try to extract URL from JSON-like data attributes
                            const matches = attr.value.match(/https:\/\/postfiles\.pstatic\.net[^"'\s}]+/g);
                            if (matches && matches.length > 0) {
                                // Find the largest/original image URL (usually without size params or with longer path)
                                const originalUrl = matches.reduce((best: string, current: string) => {
                                    // Prefer URLs without size parameters or with longer paths (more likely to be original)
                                    if (!current.includes('type=w') && current.includes('.jpg')) {
                                        return current;
                                    }
                                    return current.length > best.length ? current : best;
                                }, matches[0]);
                                
                                return originalUrl;
                            }
                        } catch {
                            // Continue to next attribute
                        }
                    }
                }
            }
        }
        
        return null;
    }

    private enhanceImageUrl(imgSrc: string): string {
        
        // Use the same logic as Python naver_blog_md library for getting original images
        let enhancedUrl = imgSrc;
        
        // Step 1: Remove all query parameters (same as Python's split("?")[0])
        enhancedUrl = enhancedUrl.split('?')[0];
        
        // Step 2: Replace postfiles with blogfiles for original images
        enhancedUrl = enhancedUrl.replace('postfiles', 'blogfiles');
        
        // Step 3: Replace video CDN with blogfiles CDN
        enhancedUrl = enhancedUrl.replace(
            'https://mblogvideo-phinf.pstatic.net/', 
            'https://blogfiles.pstatic.net/'
        );
        
        // Step 4: Additional replacements for other Naver CDN variants
        enhancedUrl = enhancedUrl
            .replace('https://mblogthumb-phinf.pstatic.net/', 'https://blogfiles.pstatic.net/')
            .replace('https://postfiles.pstatic.net/', 'https://blogfiles.pstatic.net/')
            .replace('https://blogpfthumb-phinf.pstatic.net/', 'https://blogfiles.pstatic.net/');
        
        // Log the transformation for debugging
        if (enhancedUrl !== imgSrc) {
            // Empty block
        }
        
        
        return enhancedUrl;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}