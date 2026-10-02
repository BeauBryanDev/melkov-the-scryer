
from functools import lru_cache
 
MAX_N = 500  # well under Python's default recursion limit (1000)
 
 
@lru_cache(maxsize=None)
def _fib(n: int) -> int:
    if n < 2:
        return n
    
    return _fib(n - 1) + _fib(n - 2)
 
 
def fibonacci(n: int) -> int:
 
    if n < 0 or n > MAX_N:
        raise ValueError(f"n must be between 0 and {MAX_N}")
    
    return _fib(n)
 
 
def fibonacci_sequence(n: int) -> list[int]:
    """Fib(0..n) inclusive, as a list. 
    Raises ValueError outside [0, MAX_N].

    """
    if n < 0 or n > MAX_N:
        raise ValueError(f"n must be between 0 and {MAX_N}")
    
    return [_fib(i) for i in range(n + 1)]