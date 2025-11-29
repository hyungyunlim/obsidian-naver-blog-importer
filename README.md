# Naver Blog Importer (Obsidian Plugin)

Import Naver Blog posts directly into your Obsidian vault with AI-powered enhancements.

![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22naver-blog-importer%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)

## Features

- **Bulk Import**: Import all posts from a blog by ID
- **Single Post Import**: Import individual posts by URL (desktop, mobile, m.naver.com)
- **Subscription System**: Subscribe to multiple blogs with auto-sync
- **AI Features** (optional): Auto-generate tags and excerpts using OpenAI, Anthropic, Google, or Ollama
- **Image Download**: Download and save images locally
- **Organized Storage**: Posts saved under `blogId` subfolder with rich frontmatter
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

### Import Posts

**Bulk Import**: Click ribbon icon → Enter blog ID → Import all posts

**Single Post**: Command palette → "Import single post" → Enter URL or LogNo

**Supported URL formats**:
- `https://blog.naver.com/blogid/logno`
- `https://m.blog.naver.com/PostView.naver?blogId=xxx&logNo=xxx`
- `https://m.naver.com/PostView.naver?blogId=xxx&logNo=xxx`

### Output Format

```markdown
---
title: "Post Title"
date: 2024-01-01
tags: ["tag1", "tag2"]
excerpt: "AI-generated summary..."
source: "네이버 블로그"
blogId: "example_blog"
url: "https://blog.naver.com/example_blog/123456789"
logNo: "123456789"
---

Post content with images, quotes, code blocks...
```

Posts are saved to: `{defaultFolder}/{blogId}/{title}.md`

## Settings

- **AI Provider**: OpenAI, Anthropic, Google, or Ollama
- **Default Folder**: Where posts are saved
- **Image Folder**: Where images are downloaded
- **Enable AI Tags/Excerpt**: Toggle AI features
- **Enable Image Download**: Download images locally
- **Duplicate Check**: Skip existing posts

## Supported Content

- ✅ Text, headings, quotes, code blocks
- ✅ Images with captions
- ✅ Ordered/unordered lists
- ✅ Horizontal lines
- ⚠️ Videos, embeds, tables (placeholder)

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
