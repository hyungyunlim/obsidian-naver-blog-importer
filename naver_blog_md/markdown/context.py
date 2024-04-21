from pathlib import Path
from typing import NotRequired, TypedDict

from naver_blog_md.markdown.image import ImageContext


class MarkdownRenderContext(TypedDict):
    image_context: NotRequired[ImageContext]


def with_default() -> MarkdownRenderContext:
    return {"image_context": {"image_processor_variant": "default"}}


def with_images_from_naver_cdn() -> MarkdownRenderContext:
    return {"image_context": {"image_processor_variant": "cdn"}}


def with_fetched_local_images(
    assets_directory: Path, image_src_prefix: str
) -> MarkdownRenderContext:
    return {
        "image_context": {
            "image_processor_variant": "fetch",
            "assets_directory": assets_directory,
            "image_src_prefix": image_src_prefix,
        }
    }
