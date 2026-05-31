---
'@idevconn/create-icore': patch
---

Replace deprecated `FormEvent` with `SyntheticEvent<HTMLFormElement>` in all generated client templates.

`React.FormEvent` (and its parameterized form `React.FormEvent<HTMLFormElement>`) are deprecated in React 19 — "FormEvent doesn't actually exist" per the React type declarations. The generated client had four occurrences across shadcn (bare `FormEvent` imported from react) and mui (`React.FormEvent<HTMLFormElement>`) in form submit handlers.

Replaced with `SyntheticEvent<HTMLFormElement>` (named import from react), which is not deprecated, carries `preventDefault()`, and types the form element correctly.
