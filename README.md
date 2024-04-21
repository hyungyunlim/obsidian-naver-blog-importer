# naver-blog.md

Convert NAVER blog posts to markdown files.

## Installation

1. Clone the repository: `git clone https://github.com/betarixm/naver-blog.md.git`
2. Navigate to the project directory: `cd naver-blog.md`
3. Install dependencies: `poetry install`

## Usage

### Basic Usage

```python
from naver_blog_md import (
    with_default,  # Use image sources without any modification,
    with_fetched_local_images,  # Fetch images into local directory while rendering
    with_images_from_naver_cdn,  # Use original images from Naver CDN
)
from naver_blog_md import use_blog, use_post

blog_id = "YOUR-BLOG-ID"

(posts,) = use_blog(blog_id)

for post in posts():
    metadata, as_markdown, _ = use_post(blog_id, post.log_no)
    print(metadata())
    print(as_markdown(**with_default()))

```

### Download Images into Local Directory

```python
from pathlib import Path
from typing import Any

from naver_blog_md import (
    use_blog,
    use_post,
    with_default,  # Use image sources without any modification,
    with_fetched_local_images,  # Fetch images into local directory while rendering
    with_images_from_naver_cdn,  # Use original images from Naver CDN
)


def crawl(blog_id: str, posts_directory: Path, assets_directory: Path):
    (posts,) = use_blog(blog_id)

    for post in posts():
        metadata, as_markdown, _ = use_post(
            blog_id,
            post.log_no,
        )

        filename = to_filename(metadata())
        post_assets_directory = assets_directory / filename
        post_assets_directory.mkdir(exist_ok=True)

        render_context = with_fetched_local_images(
            num_workers=64,
            assets_directory=post_assets_directory,
            image_src_prefix=f"assets/{filename}/",
        )

        markdown = as_markdown(**render_context)

        (posts_directory / filename).write_text(markdown)


def to_filename(metadata: dict[Any, Any]) -> str:
    raise NotImplementedError()


if __name__ == "__main__":
    crawl("YOUR-BLOG-ID", Path("posts"), Path("assets"))
```
