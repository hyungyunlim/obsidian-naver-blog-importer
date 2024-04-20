from typing import Any, Iterator

import yaml

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

    match block:
        case SectionTitleBlock(text):
            return blocks_as_markdown(
                blocks, front_matter, f"{result}## {text.strip()}\n\n"
            )
        case ParagraphBlock(text="") | ParagraphBlock(text="\n"):
            return blocks_as_markdown(blocks, front_matter, result)
        case ParagraphBlock(text):
            return blocks_as_markdown(
                blocks, front_matter, f"{result}{text.strip()}\n\n"
            )
        case ImageBlock(src=""):
            return blocks_as_markdown(blocks, front_matter, result)
        case ImageBlock(src, alt):
            return blocks_as_markdown(
                blocks, front_matter, f"{result}![{alt}]({src})\n\n"
            )
        case ImageGroupBlock([]):
            return blocks_as_markdown(blocks, front_matter, result)
        case ImageGroupBlock(images):
            return blocks_as_markdown(
                blocks,
                front_matter,
                f"{result}"
                + " ".join(f"![{image.alt}]({image.src})" for image in images)
                + "\n\n",
            )
