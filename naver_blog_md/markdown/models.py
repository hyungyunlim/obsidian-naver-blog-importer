from dataclasses import dataclass


@dataclass
class SectionTitleBlock:
    text: str


@dataclass
class ParagraphBlock:
    text: str


@dataclass
class ImageBlock:
    src: str
    alt: str


@dataclass
class ImageGroupBlock:
    images: list[ImageBlock]


Block = SectionTitleBlock | ParagraphBlock | ImageBlock | ImageGroupBlock
