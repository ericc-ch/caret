## Coding Style

- Never explicitly write types unless needed. Prefer type inference.
- Extract a helper only when reused or when duplication is worse than indirection. Avoid splitting logic into small named pieces for "structure".
- Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.
- Minimize nesting.

## Testing

- Write fewer tests. Prefer integration tests.
- Do not compromise production code for testing (no test-only hooks, exports, flags, or abstractions). Adapt the tests, not the product.
- Do not test what the type system guarantees (e.g., schema shapes, literal unions, trivial getters).
- Test behavior that can actually regress.
