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
            + yaml.dump(front_matter, default_flow_style=False, allow_unicode=True)
            + "---\n"
        )

    try:
        block = next(blocks)
    except StopIteration:
        return result

    match block:
        case SectionTitleBlock(text):
            return blocks_as_markdown(
                blocks, front_matter, f"{result}\n## {text.strip()}\n\n"
            )
        case ParagraphBlock(text):
            return blocks_as_markdown(blocks, front_matter, f"{result}{text.strip()}\n")
        case ImageBlock(src, alt):
            return blocks_as_markdown(
                blocks, front_matter, f"{result}![{alt}]({src})\n"
            )
        case ImageGroupBlock(images):
            return blocks_as_markdown(
                blocks,
                front_matter,
                f"{result}"
                + " ".join(f"![{image.alt}]({image.src})" for image in images)
                + "\n",
            )
