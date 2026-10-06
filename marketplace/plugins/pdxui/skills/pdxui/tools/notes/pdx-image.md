⚠️ **A bound `:src` is sanitised, and `data:image/svg+xml` is refused.** The policy
(`sanitizeMediaUrl`) accepts http(s), relative URLs, `blob:` and `data:image/{png,jpeg,gif,webp,avif}`.
An SVG is refused on purpose: opened as a document it runs its script. The attribute is then not
written at all, and in dev the console says which scheme was dropped — once per element.

Two asymmetries the policy's name does not give away:

- a **static** `src="data:image/svg+xml,…"` written in the template is **not filtered**: the
  sanitiser runs on bound attributes only;
- **`blob:` passes** — `URL.createObjectURL(file)`, the preview of a file the user just picked.
