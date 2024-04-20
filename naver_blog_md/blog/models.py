from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from urllib.parse import unquote_plus

from pydantic import (
    AfterValidator,
    AliasGenerator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
)
from pydantic.alias_generators import to_camel

UrlEncodedStr = Annotated[str, AfterValidator(lambda x: unquote_plus(x))]
DateStr = Annotated[
    str, AfterValidator(lambda x: datetime.strptime(x, "%Y. %m. %d.").date())
]
IntStr = Annotated[int, BeforeValidator(lambda x: int(x) if x != "" else 0)]


class PostListResponse(BaseModel):
    result_code: Literal["S"]
    result_message: str
    post_list: list[PostItem]
    count_per_page: IntStr
    total_count: IntStr

    model_config = ConfigDict(
        alias_generator=AliasGenerator(
            validation_alias=to_camel,
            serialization_alias=to_camel,
        )
    )


class PostItem(BaseModel):
    log_no: IntStr
    title: UrlEncodedStr
    category_no: IntStr
    parent_category_no: IntStr
    comment_count: IntStr
    add_date: DateStr

    model_config = ConfigDict(
        alias_generator=AliasGenerator(
            validation_alias=to_camel,
            serialization_alias=to_camel,
        )
    )
