from bs4 import Tag

from naver_blog_md.markdown.models import (
    Block,
    ImageBlock,
    ImageGroupBlock,
    ParagraphBlock,
)


def text_component(component: Tag) -> list[Block]:
    return [
        ParagraphBlock(text=tag.text.strip())
        for tag in component.select(".se-text-paragraph")
    ]


def image_group_component(component: Tag) -> Block:
    images = component.select("img")
    caption = component.select_one(".se-caption")

    return ImageGroupBlock(
        images=[
            ImageBlock(
                src=_original_image_url(str(img["src"])),
                alt=caption.text.strip() if caption is not None else "",
            )
            for img in images
        ]
    )


def image_component(component: Tag) -> Block:
    img = component.select_one("img")
    assert img is not None, "No image found"

    caption = component.select_one(".se-caption")

    return ImageBlock(
        src=_original_image_url(str(img["src"])),
        alt=caption.text.strip() if caption is not None else "",
    )


def _original_image_url(url: str):
    return url.split("?")[0].replace("postfiles", "blogfiles")
