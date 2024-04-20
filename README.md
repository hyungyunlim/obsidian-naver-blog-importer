# naver-blog.md

Convert NAVER blog posts to markdown files.

## Installation

1. Clone the repository: `git clone https://github.com/betarixm/naver-blog.md.git`
2. Navigate to the project directory: `cd naver-blog.md`
3. Install dependencies: `poetry install`

## Usage

```python
from naver_blog_md.blog.hooks import use_post

_, _, as_markdown = use_post("your_blog_id", your_post_id_in_number)

print(as_markdown())

```
