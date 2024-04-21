import re
from math import ceil
from typing import Iterator, TypeVar, Unpack

import requests
from bs4 import BeautifulSoup, Tag

from naver_blog_md.blog import components as Components
from naver_blog_md.blog import metadata as Metadata
from naver_blog_md.blog.models import PostItem, PostListResponse
from naver_blog_md.fp.lazy_val import lazy_val
from naver_blog_md.markdown.context import MarkdownRenderContext
from naver_blog_md.markdown.models import Block, ImageBlock, ImageGroupBlock
from naver_blog_md.markdown.render import blocks_as_markdown

T = TypeVar("T")


def use_post(blog_id: str, log_no: int):

    @lazy_val
    def root() -> Tag:
        response = requests.get(
            "https://blog.naver.com/PostView.naver",
            params={"blogId": blog_id, "logNo": log_no},
        )
        return BeautifulSoup(
            _remove_unicode_special_characters(response.text), "html.parser"
        )

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
                    yield Components.section_title_component(component)
                case "se-image":
                    yield Components.image_component(component)
                case "se-imageGroup":
                    yield Components.image_group_component(component)
                case "se-placesMap":
                    pass
                case "se-text":
                    yield from Components.text_component(component)
                case "se-oglink":
                    pass
                case unknown:
                    raise ValueError(f"Unknown component type: {unknown}")

    def as_markdown(**context: Unpack[MarkdownRenderContext]):
        return blocks_as_markdown(as_blocks(), metadata(), **context)

    return (
        metadata,
        as_markdown,
        as_blocks,
    )


def _first_image_of_blocks(blocks: Iterator[Block]) -> ImageBlock | None:
    try:
        block = next(blocks)
    except StopIteration:
        return None

    match block:
        case ImageBlock(src, alt):
            return ImageBlock(src, alt)
        case ImageGroupBlock(images):
            return ImageBlock(images[0].src, images[0].alt)
        case _:
            return _first_image_of_blocks(blocks)


def use_blog(blog_id: str):
    @lazy_val
    def posts() -> Iterator[PostItem]:
        response = _post_title_list_async(blog_id)

        total_count, count_per_page = response.total_count, response.count_per_page

        for current_page in range(1, ceil(total_count / count_per_page) + 1):
            yield from _post_title_list_async(blog_id, current_page).post_list

    return (posts,)


def _post_title_list_async(
    blog_id: str, current_page: int = 1, category_no: int = 0, count_per_page: int = 5
):
    response = requests.get(
        "https://blog.naver.com/PostTitleListAsync.naver",
        params={
            "blogId": blog_id,
            "currentPage": current_page,
            "categoryNo": category_no,
            "countPerPage": count_per_page,
        },
    )

    return PostListResponse.model_validate_json(
        response.text.split(',"pagingHtml"')[0] + "}"
    )


def _remove_unicode_special_characters(text: str):
    pattern = r"[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]"
    cleaned_text = re.sub(pattern, "", text)

    return cleaned_text
