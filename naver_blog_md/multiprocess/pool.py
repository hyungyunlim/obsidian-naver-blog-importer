from typing import Callable, Iterable, TypeVar

from multiprocess.pool import Pool  # pyright: ignore[reportMissingTypeStubs]

_T = TypeVar("_T")
_U = TypeVar("_U")


def use_map(processes: int) -> Callable[[Callable[[_T], _U], Iterable[_T]], list[_U]]:
    return Pool(processes).map  # type: ignore
