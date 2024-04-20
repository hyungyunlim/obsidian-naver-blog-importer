from typing import Callable, TypeVar

T = TypeVar("T")


def lazy_val(func: Callable[[], T]) -> Callable[[], T]:
    """
    Decorator for lazy evaluation of a function.

    Args:
        func (Callable[[], T]): A function that takes no arguments and returns a value of type T.

    Returns:
        Callable[[], T]: A function that lazily evaluates the decorated function.
    """
    value = None

    def wrapper() -> T:
        nonlocal value
        if value is None:
            value = func()
        return value

    return wrapper
