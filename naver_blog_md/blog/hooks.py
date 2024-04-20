from typing import Iterator, TypeVar

import requests
from bs4 import BeautifulSoup, Tag

from naver_blog_md.blog import components as Components
from naver_blog_md.blog import metadata as Metadata
from naver_blog_md.fp.lazy_val import lazy_val
from naver_blog_md.markdown.models import (
    Block,
    ImageBlock,
    ImageGroupBlock,
    SectionTitleBlock,
)
from naver_blog_md.markdown.render import blocks_as_markdown

T = TypeVar("T")


def use_post(blog_id: str, log_no: int):

    def post_url():
        return f"https://blog.naver.com/PostView.naver?blogId={blog_id}&logNo={log_no}"

    @lazy_val
    def root() -> Tag:
        response = requests.get(post_url())
        return BeautifulSoup(response.text, "html.parser")

    @lazy_val
    def preview_image():
        return _first_image_of_blocks(as_blocks())

    def metadata():
        return Metadata.metadata(
            root(), Metadata.tags(blog_id, log_no), preview_image()
        )

    def as_blocks() -> Iterator[Block]:
        for component in root().select(".se-main-container .se-component"):
            match component["class"][1]:
                case "se-sectionTitle":
                    yield SectionTitleBlock(component.text.strip())
                case "se-image":
                    yield Components.image_component(component)
                case "se-imageGroup":
                    yield Components.image_group_component(component)
                case "se-placesMap":
                    pass
                case "se-text":
                    yield from Components.text_component(component)
                case unknown:
                    raise ValueError(f"Unknown component type: {unknown}")

    @lazy_val
    def as_markdown():
        return blocks_as_markdown(as_blocks(), metadata())

    return metadata, as_blocks, as_markdown


def _first_image_of_blocks(blocks: Iterator[Block]) -> ImageBlock | None:
    match next(blocks):
        case ImageBlock(src, alt):
            return ImageBlock(src, alt)
        case ImageGroupBlock(images):
            return ImageBlock(images[0].src, images[0].alt)
        case _:
            return _first_image_of_blocks(blocks)
