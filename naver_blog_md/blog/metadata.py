from datetime import datetime
from urllib.parse import unquote

import requests
from bs4 import Tag

from naver_blog_md.markdown.models import ImageBlock


def metadata(
    root: Tag,
    tags: list[str],
    preview_image: ImageBlock | None,
):
    return {
        "title": title(root),
        "author": nickname(root),
        "pubDate": pub_date(root),
        "description": "",
        "tags": tags,
        "categories": [category(root)],
        "draft": False,
        **(
            {
                "image": {
                    "url": preview_image.src,
                    "alt": preview_image.alt,
                }
            }
            if preview_image is not None
            else {}
        ),
    }


def title(root: Tag) -> str:
    tag = root.select_one(".se-title-text")

    assert tag is not None, "No title found"

    return tag.text.strip()


def nickname(root: Tag):
    tag = root.select_one(".nick")

    assert tag is not None, "No nickname found"

    return tag.text.strip()


def pub_date(root: Tag):
    tag = root.select_one(".se_publishDate")

    assert tag is not None, "No pub date found"

    return datetime.strptime(
        tag.text.strip() + "+0900", "%Y. %m. %d. %H:%M%z"
    )  # FIXME: Timezone is hardcoded


def category(root: Tag) -> str:
    tag = root.select_one(".blog2_series")

    assert tag is not None, "No category found"

    return tag.text.strip()


def tags(blog_id: str, log_no: int):
    url = f"https://blog.naver.com/BlogTagListInfo.naver?blogId={blog_id}&logNoList={log_no}&logType=mylog"

    response = requests.get(url)

    return [
        tag
        for tags in response.json()["taglist"]
        for tag in unquote(tags["tagName"]).split(",")
    ]
