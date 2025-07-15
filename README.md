# Naver Blog Importer for Obsidian

Import posts from Naver Blog directly into your Obsidian vault with AI-powered enhancements.

![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22naver-blog-importer%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)

## Features

- **🚀 Bulk Blog Import**: Import all posts from a Naver Blog with just the blog ID
- **📂 Subscription Management**: Subscribe to multiple blogs and sync new posts automatically
  - Individual post count settings per blog
  - Manual sync for individual blogs
  - Auto-sync on startup
- **🤖 AI-Powered Features** (Optional):
  - Automatic tag generation using OpenAI, Anthropic, or Google APIs
  - AI-generated post excerpts
  - Smart layout formatting and content enhancement
- **🔧 Advanced Features**:
  - Local image download and storage
  - Duplicate post detection and filtering
  - Single post import by URL
- **📝 Comprehensive Parsing**: Supports text, images, quotes, code blocks, lists, and more in proper order
- **⚡ Optimized Metadata**: Obsidian-friendly frontmatter with rich metadata
- **🌐 Multilingual**: Full Korean and English language support

## Installation

### From Obsidian Community Plugins

1. Open Obsidian Settings
2. Go to Community Plugins and disable Safe Mode
3. Click Browse and search for "Naver Blog Importer"
4. Install and enable the plugin

### Manual Installation

1. Download the latest release from GitHub
2. Extract `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/naver-blog-importer/` folder
3. Restart Obsidian and enable the plugin in Settings

## Quick Start

### 1. Configure AI Provider (Optional)

1. Go to Settings → Community Plugins → Naver Blog Importer
2. Choose your AI provider (OpenAI, Anthropic, Google, or Ollama)
3. Enter your API key for AI-powered features
4. Configure folder settings for posts and images

### 2. Import Posts

**Method 1: Bulk Import**
1. Click the download ribbon icon or use Command Palette
2. Select "Import All Posts from Blog"
3. Enter Naver Blog ID (e.g., "yonofbooks")
4. Click "Import All Posts"

**Method 2: Single Post Import**
1. Use Command Palette → "Import Single Post by URL"
2. Enter blog ID and post URL or LogNo
3. Click "Import Post"

**Method 3: Subscription Management**
1. Use Command Palette → "Sync Subscribed Blogs"
2. Add blog IDs to your subscription list
3. Auto-sync new posts on startup

### 3. Output Format

Each blog post is saved as a markdown file with rich metadata:

```markdown
---
title: "Blog Post Title"
date: 2024-01-01
tags: ["AI-generated", "tag2", "tag3"]
excerpt: "AI-generated summary of the post..."
source: "Naver Blog"
url: "https://blog.naver.com/blogid/123456789"
logNo: "123456789"
categories: ["Category1", "Category2"]
---

# Blog Post Title

Post content with properly formatted images, quotes, and code blocks...
```

## Supported Content Types

- ✅ **Text**: Regular text content with proper formatting
- ✅ **Headings**: Subheadings converted to `##` format
- ✅ **Quotes**: Block quotes converted to `>` format
- ✅ **Images**: High-quality images with captions and local download
- ✅ **Code Blocks**: Code snippets converted to ``` format
- ✅ **Dividers**: Horizontal rules converted to `---` format
- ⚠️ **Videos**: Displayed as placeholders with source links
- ⚠️ **Embedded Content**: Displayed as placeholders with descriptions
- ⚠️ **Tables**: Displayed as placeholders (future enhancement)

## AI Providers & API Keys

The plugin supports multiple AI providers for enhanced functionality:

- **OpenAI**: [Get API Key](https://platform.openai.com/api-keys)
- **Anthropic**: [Get API Key](https://console.anthropic.com/)
- **Google Gemini**: [Get API Key](https://aistudio.google.com/app/apikey)
- **Ollama**: Local AI server (no API key required)

AI features are optional - basic blog import works without any API keys.

## Configuration

### AI Settings
- **Provider**: Choose between OpenAI, Anthropic, Google, or Ollama
- **Model**: Select specific model (auto-refreshed from APIs)
- **Features**: Enable/disable AI tags and excerpts

### Folder Settings
- **Default Folder**: Where imported posts are saved
- **Image Folder**: Where downloaded images are stored

### Advanced Options
- **Duplicate Check**: Skip posts that already exist
- **Image Download**: Download and store images locally
- **Subscription Management**: Auto-sync multiple blogs

## Troubleshooting

### Common Issues

1. **Import Failed**: Check network connection and blog accessibility
2. **AI Features Not Working**: Verify API key and provider settings
3. **Images Not Loading**: Enable image download in settings
4. **Language Issues**: Change Obsidian language in settings

### Performance Tips

- Use subscription management for regular updates
- Enable duplicate checking to avoid re-importing
- Configure appropriate folder structure for organization

## Architecture & Code Quality

This plugin follows enterprise-grade development practices with a modular architecture:

- **📊 Code Statistics**: 450 lines (down from 2,969 - 85% reduction)
- **🏗️ Modular Design**: 32 specialized modules with single responsibilities
- **🔧 Clean Architecture**: Complete separation of concerns (API, Services, UI, Utils)
- **🎯 SOLID Principles**: Factory patterns, dependency inversion, interface segregation
- **📝 Type Safety**: Full TypeScript coverage with compile-time validation
- **🧪 Testable**: Independent module testing capability

### Development Inspiration

This project was inspired by and references the following excellent libraries:

- **[betarixm/naver-blog.md](https://github.com/betarixm/naver-blog.md)** - Comprehensive Naver Blog parsing and Markdown conversion library
- **[Jeongseup/naver-blog-backer](https://github.com/Jeongseup/naver-blog-backer)** - Naver Blog backup solution with parsing insights

Special thanks to these projects for providing valuable insights into Naver Blog's structure and API patterns.

## Contributing

Bug reports and feature requests are welcome via [GitHub Issues](https://github.com/hyungyunlim/obsidian-naver-blog-importer/issues).

### Development Setup

```bash
# Clone the repository
git clone https://github.com/hyungyunlim/obsidian-naver-blog-importer.git

# Install dependencies
npm install

# Build for development
npm run dev

# Build for production
npm run build
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Changelog

### v1.2.1 (Latest) - Major Architecture Refactoring
- **🏗️ Complete Code Refactoring**: 85% code reduction (2,969 → 450 lines)
- **📦 Modular Architecture**: Separated into 32 specialized modules
- **🎯 Factory Pattern Implementation**: Unified API client management
- **🔧 Clean Architecture**: Complete separation of concerns
- **🚀 Performance Optimization**: Improved loading and execution speed
- **🧪 Enhanced Testability**: Independent module testing capability
- **📝 Enterprise Standards**: SOLID principles and clean code practices

### v1.2.0
- **🤖 Enhanced AI Integration**: Support for OpenAI, Anthropic, Google, and Ollama
- **🌐 Real-time Model Fetching**: Automatic model list updates from APIs
- **🎯 Smart Token Management**: Adaptive limits for different model types
- **🔄 Retry Logic**: Automatic retry for failed API calls
- **📱 Progress Notifications**: Real-time status updates for AI operations
- **🌍 Improved Localization**: Better language detection and switching

### v1.0.1
- **🖼️ Fixed Image Positioning**: Images now appear in correct order
- **📂 Enhanced Subscription UI**: Individual post count settings per blog
- **🔄 Individual Sync**: Manual sync for specific blogs
- **🎨 UI Improvements**: Better user interface and feedback

### v1.0.0
- **🎉 Initial Release**: Core blog import functionality
- **🤖 AI Features**: Tag and excerpt generation
- **📝 Content Parsing**: Support for various blog components