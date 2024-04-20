# naver-blog.md

Convert NAVER blog posts to markdown files.

## Installation

1. Clone the repository: `git clone https://github.com/betarixm/naver-blog.md.git`
2. Navigate to the project directory: `cd naver-blog.md`
3. Install dependencies: `poetry install`

## Usage

```python
import re

from naver_blog_md import use_blog, use_post

blog_id = "YOUR-BLOG-ID"

(posts,) = use_blog(blog_id)

for post in posts():
    metadata, as_markdown, _ = use_post(blog_id, post.log_no)
    print(metadata())
    print(as_markdown())
```
