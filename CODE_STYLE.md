# Code style

This TypeScript/React, JavaScript, Python, and SQL project adapts the requested
Google C++ naming conventions. Preserve behavior and UI when applying the style.

## Names and files

- Types, classes, interfaces, enums, and aliases: `UpperCamelCase`.
- Project-defined functions and named callable values: `PascalCase`, including
  event handlers and React state setters.
- Variables, parameters, and internal object fields: `lower_snake_case`.
- Class data members: `lower_snake_case_` with a trailing underscore.
- Policy constants and fixed lookup tables: `kCamelCase`. A local `const` binding
  is not automatically a policy constant.
- Source and script filenames: `lower_snake_case`, retaining their extensions.
  Keep modules focused; use explicit types at public boundaries and clear names.

Compatibility exceptions are deliberate: React hooks retain `useCamelCase`;
framework/library imports, callbacks required by a framework, DOM/React attributes,
configuration keys, established JSON API fields, and inherited members retain
their required names. Python unittest discovery methods retain `test_`, `setUp`,
and `tearDown`. CSS selectors follow the existing CSS conventions. Tool-required
filenames, documentation filenames, applied SQL migration filenames, and archived
legacy migration contents remain unchanged. Do not add aliases just to hide old
internal naming; update their callers instead.

## Comments and structure

All code comments are English. Document each named project function, method, and
component with a concise four-part contract; include each parameter (or `None`):

```text
Summary: What the function does.
Parameters: Meaning, valid values, optional/null requirements of each parameter.
Return Value: Meaning and empty/error outcomes, including rejected promises.
Side Effects & Constraints: State/database/network changes, resource ownership,
  relevant cost or concurrency constraints, and exceptions that can propagate.
```

Use JSDoc for TypeScript/JavaScript and docstrings for Python. Describe meaningful
constraints without boilerplate claims about nonexistent allocations or risks.
Short anonymous callbacks can rely on their enclosing function's contract.
Explain SQL scripts' purpose, prerequisites, and effects in English header comments.
Avoid comments that merely repeat code. Keep existing formatting consistent and
separate validation, persistence, and rendering responsibilities where practical.

## Verification

Update imports and tests after renaming. Preserve existing API payloads, database
semantics, and migration history. Run type checks, a production build, focused unit
and database tests, and isolated API/concurrency acceptance before declaring the
refactor complete. Never run fixture-writing acceptance tests against production.
