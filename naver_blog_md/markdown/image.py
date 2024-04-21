from pathlib import Path
from typing import Callable, Literal, TypedDict, Unpack
from urllib.parse import unquote_plus

import requests


class ImageDefaultContext(TypedDict):
    image_processor_variant: Literal["default"]


class ImageNaverCdnContext(TypedDict):
    image_processor_variant: Literal["cdn"]


class ImageFetchContext(TypedDict):
    image_processor_variant: Literal["fetch"]
    assets_directory: Path
    image_src_prefix: str


ImageContext = ImageDefaultContext | ImageNaverCdnContext | ImageFetchContext


def use_image_processor(context: ImageContext) -> Callable[[str], str]:
    match context["image_processor_variant"]:
        case "default":
            return _identity
        case "cdn":
            return _original_image_url
        case "fetch":
            return lambda src: _fetch_image_processor(src, **context)


def _identity(src: str) -> str:
    return src


def _original_image_url(src: str) -> str:
    return (
        src.split("?")[0]
        .replace("postfiles", "blogfiles")
        .replace(
            "https://mblogvideo-phinf.pstatic.net/", "https://blogfiles.pstatic.net/"
        )
    )


def _fetch_image_processor(src: str, **context: Unpack[ImageFetchContext]) -> str:
    assert context["assets_directory"].is_dir()

    url = _original_image_url(src)
    response = requests.get(url)

    response.raise_for_status()

    filename = unquote_plus(url.split("/")[-1])

    (context["assets_directory"] / filename).write_bytes(response.content)

    return f"{context['image_src_prefix']}{filename}"
