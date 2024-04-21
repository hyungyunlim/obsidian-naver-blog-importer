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
from naver_blog_md.multiprocess.pool import use_map


def blocks_as_markdown(
    blocks: Iterator[Block],
    front_matter: dict[Any, Any] | None = None,
    result: str = "",
    **context: Unpack[MarkdownRenderContext],
) -> str:

    if front_matter is not None and result == "":
        result = _front_matter_as_yaml(front_matter, **context)

    map = use_map(context["num_workers"])

    rendered_blocks = map(
        lambda block: _block_as_markdown(block, **context),
        blocks,
    )

    return (result + "".join(rendered_blocks)).strip() + "\n"


def _block_as_markdown(
    block: Block,
    **context: Unpack[MarkdownRenderContext],
) -> str:
    processed_image_src = _use_image_processor_with_fallback(**context)

    match block:
        case SectionTitleBlock(text):
            return f"## {text.strip()}\n\n"
        case ParagraphBlock(text="") | ParagraphBlock(text="\n"):
            return ""
        case ParagraphBlock(text):
            return f"{text.strip()}\n\n"
        case ImageBlock(src=""):
            return ""
        case ImageBlock(src, alt):
            return f"![{alt}]({processed_image_src(src)})\n\n"
        case ImageGroupBlock([]):
            return ""
        case ImageGroupBlock(images):
            return (
                " ".join(
                    f"![{image.alt}]({processed_image_src(image.src)})"
                    for image in images
                )
                + "\n\n"
            )


def _front_matter_as_yaml(
    front_matter: dict[Any, Any],
    **context: Unpack[MarkdownRenderContext],
) -> str:
    if "image" in front_matter and "url" in front_matter["image"]:
        image_processor = _use_image_processor_with_fallback(**context)
        front_matter["image"]["url"] = image_processor(front_matter["image"]["url"])

    return (
        "---\n"
        + yaml.safe_dump(
            front_matter,
            default_flow_style=False,
            allow_unicode=True,
            default_style=None,
        )
        + "---\n\n"
    )


def _use_image_processor_with_fallback(**context: Unpack[MarkdownRenderContext]):
    if "image_context" not in context:
        default_context = with_default()
        assert "image_context" in default_context
        image_context = default_context["image_context"]
    else:
        image_context = context["image_context"]

    return use_image_processor(image_context)
