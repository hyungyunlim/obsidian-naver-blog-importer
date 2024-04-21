from typing import Any, Iterator, Unpack

import yaml

from naver_blog_md.markdown.context import MarkdownRenderContext, with_default
from naver_blog_md.markdown.image import use_image_processor
from naver_blog_md.markdown.models import (
    Block,
    ImageBlock,
    ImageGroupBlock,
    ParagraphBlock,
    SectionTitleBlock,
)


def blocks_as_markdown(
    blocks: Iterator[Block],
    front_matter: dict[Any, Any] | None = None,
    result: str = "",
    **context: Unpack[MarkdownRenderContext],
) -> str:

    if front_matter is not None and result == "":
        result = (
            "---\n"
            + yaml.safe_dump(
                front_matter,
                default_flow_style=False,
                allow_unicode=True,
                default_style=None,
            )
            + "---\n\n"
        )

    try:
        block = next(blocks)
    except StopIteration:
        return result.strip() + "\n"

    if "image_context" not in context:
        default_context = with_default()
        assert "image_context" in default_context
        image_context = default_context["image_context"]
    else:
        image_context = context["image_context"]

    processed_image_src = use_image_processor(image_context)

    match block:
        case SectionTitleBlock(text):
            return blocks_as_markdown(
                blocks, front_matter, f"{result}## {text.strip()}\n\n", **context
            )
        case ParagraphBlock(text="") | ParagraphBlock(text="\n"):
            return blocks_as_markdown(blocks, front_matter, result, **context)
        case ParagraphBlock(text):
            return blocks_as_markdown(
                blocks, front_matter, f"{result}{text.strip()}\n\n", **context
            )
        case ImageBlock(src=""):
            return blocks_as_markdown(blocks, front_matter, result, **context)
        case ImageBlock(src, alt):
            return blocks_as_markdown(
                blocks,
                front_matter,
                f"{result}![{alt}]({processed_image_src(src)})\n\n",
                **context,
            )
        case ImageGroupBlock([]):
            return blocks_as_markdown(blocks, front_matter, result, **context)
        case ImageGroupBlock(images):
            return blocks_as_markdown(
                blocks,
                front_matter,
                f"{result}"
                + " ".join(
                    f"![{image.alt}]({processed_image_src(image.src)})"
                    for image in images
                )
                + "\n\n",
                **context,
            )
