// Uniform service result.
// `code` + `params` let the presentation layer show the outcome in the selected
// interface language (FR-20); `message` keeps a plain English default for logs and tests.
// `data` carries extra fields (created records, alternatives offered after a refusal).
export function success(code, message, params = {}, data = {}) {
  return { ok: true, code, params, message, ...data };
}

export function failure(code, message, params = {}, data = {}) {
  return { ok: false, code, params, message, ...data };
}
