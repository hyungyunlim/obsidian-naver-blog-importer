from bs4 import Tag

from naver_blog_md.markdown.models import (
    Block,
    ImageBlock,
    ImageGroupBlock,
    ParagraphBlock,
    SectionTitleBlock,
)


def section_title_component(component: Tag) -> Block:
    return SectionTitleBlock(_text_from_tag(component))


def text_component(component: Tag) -> list[Block]:
    return [
        ParagraphBlock(text=_text_from_tag(tag))
        for tag in component.select(".se-text-paragraph")
    ]


def image_group_component(component: Tag) -> Block:
    images = component.select("img")
    caption = component.select_one(".se-caption")

    return ImageGroupBlock(
        images=[
            ImageBlock(
                src=str(img["src"]),
                alt=_text_from_tag(caption) if caption is not None else "",
            )
            for img in images
        ]
    )


def image_component(component: Tag) -> Block:
    img = component.select_one("img")
    video = component.select_one("video")

    match img, video:
        case Tag(), None:
            src = str(img["src"])
        case None, Tag():
            src = str(video["src"])
        case _:
            assert False, "Image and video are mutually exclusive"

    caption = component.select_one(".se-caption")

    return ImageBlock(
        src=src,
        alt=_text_from_tag(caption) if caption is not None else "",
    )


def _text_from_tag(tag: Tag):
    return tag.get_text(strip=True).strip()
