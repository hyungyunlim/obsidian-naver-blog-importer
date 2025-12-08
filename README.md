# Naver Blog Importer (Obsidian Plugin)

Import Naver Blog and Cafe posts directly into your Obsidian vault with AI-powered enhancements.

![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22naver-blog-importer%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)

## Features

### Blog Import
- **Bulk Import**: Import all posts from a blog by ID
- **Single Post Import**: Import individual posts by URL (desktop, mobile, m.naver.com)
- **Subscription System**: Subscribe to multiple blogs with auto-sync

### Cafe Import (New!)
- **Single Article Import**: Import cafe articles by URL
- **Private Cafe Support**: Access private cafes with cookie authentication
- **Organized by Cafe Name**: Articles saved under cafe name subfolder

### Common Features
- **AI Features** (optional): Auto-generate tags and excerpts using OpenAI, Anthropic, Google, or Ollama
- **Image Download**: Download and save images locally
- **YouTube Embeds**: Native Obsidian embed support for YouTube videos
- **Duplicate Detection**: Skip already imported posts
- **Multi-language**: Korean and English UI support

## Installation

### From Obsidian Community Plugins

1. Open Obsidian Settings → Community Plugins
2. Search for "Naver Blog Importer"
3. Install and enable

### Manual Installation

1. Download latest release from GitHub
2. Extract to `.obsidian/plugins/naver-blog-importer/`
3. Enable in Settings → Community Plugins

## Usage

### Blog Import

**Bulk Import**: Click ribbon icon → Enter blog ID → Import all posts

**Single Post**: Command palette → "Import single post" → Enter URL or LogNo

**Supported URL formats**:
- `https://blog.naver.com/blogid/logno`
- `https://m.blog.naver.com/PostView.naver?blogId=xxx&logNo=xxx`
- `https://m.naver.com/PostView.naver?blogId=xxx&logNo=xxx`

### Cafe Import

**Single Article**: Command palette → "Import cafe article" → Enter URL

**Supported URL formats**:
- `https://cafe.naver.com/cafename/articleid`
- `https://m.cafe.naver.com/cafename/articleid`

### Private Cafe Authentication

To access private cafes, you need to provide your Naver login cookies:

1. Log in to Naver in your browser
2. Open Developer Tools (F12) → Application → Cookies
3. Find `NID_AUT` and `NID_SES` cookie values
4. Enter them in plugin settings under "Naver Cafe Settings"

## Output Format

### Blog Post
```markdown
---
title: "Post Title"
date: 2024-01-01
tags: ["tag1", "tag2"]
excerpt: "AI-generated summary..."
source: naver-blog
blogId: "example_blog"
url: "https://blog.naver.com/example_blog/123456789"
logNo: "123456789"
---

Post content with images, quotes, code blocks...
```

Posts are saved to: `{defaultFolder}/{blogId}/{title}.md`

### Cafe Article
```markdown
---
title: "Article Title"
date: 2024-01-01
author: "Writer Name"
articleId: "123456"
cafeId: "12345678"
cafeName: "Cafe Full Name"
cafeUrl: "cafename"
menuName: "Board Name"
url: "https://cafe.naver.com/cafename/123456"
source: naver-cafe
viewCount: 100
commentCount: 5
---

Article content...
```

Articles are saved to: `{cafeFolder}/{cafeName}/{title}.md`

## Settings

### Blog Settings
- **AI Provider**: OpenAI, Anthropic, Google, or Ollama
- **Default Folder**: Where blog posts are saved
- **Image Folder**: Where images are downloaded
- **Enable AI Tags/Excerpt**: Toggle AI features
- **Enable Image Download**: Download images locally
- **Duplicate Check**: Skip existing posts

### Cafe Settings
- **NID_AUT / NID_SES**: Cookie values for private cafe access
- **Cafe Import Folder**: Where cafe articles are saved
- **Download Cafe Images**: Download images from cafe articles
- **Exclude Notice**: Skip notice/announcement posts
- **Minimum Content Length**: Filter short posts
- **Duplicate Check**: Skip existing articles

## Supported Content

- Text, headings, quotes, code blocks
- Images with captions
- Ordered/unordered lists
- Horizontal lines
- YouTube embeds (native Obsidian format)
- Link cards / OG previews
- Videos (as links)
- Tables (basic support)

## Development

```bash
git clone https://github.com/hyungyunlim/obsidian-naver-blog-importer.git
npm install
npm run build
```

## Credits

Inspired by [betarixm/naver-blog.md](https://github.com/betarixm/naver-blog.md) and [Jeongseup/naver-blog-backer](https://github.com/Jeongseup/naver-blog-backer).

## License

MIT License
