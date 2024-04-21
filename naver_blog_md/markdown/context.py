from pathlib import Path
from typing import NotRequired, TypedDict

from naver_blog_md.markdown.image import ImageContext


class MarkdownRenderContext(TypedDict):
    image_context: NotRequired[ImageContext]
    num_workers: int


def with_default(num_workers: int = 8) -> MarkdownRenderContext:
    return {
        "image_context": {"image_processor_variant": "default"},
        "num_workers": num_workers,
    }


def with_images_from_naver_cdn(num_workers: int = 8) -> MarkdownRenderContext:
    return {
        "image_context": {"image_processor_variant": "cdn"},
        "num_workers": num_workers,
    }


def with_fetched_local_images(
    assets_directory: Path, image_src_prefix: str, num_workers: int = 8
) -> MarkdownRenderContext:
    return {
        "image_context": {
            "image_processor_variant": "fetch",
            "assets_directory": assets_directory,
            "image_src_prefix": image_src_prefix,
        },
        "num_workers": num_workers,
    }
