// Uniform service result.
// `code` + `params` let the presentation layer show the outcome in the selected
// interface language (FR-20); `message` keeps a plain English default for logs and tests.
export function success(code, message, params = {}, data = {}) {
  return { ok: true, code, params, message, ...data };
}

export function failure(code, message, params = {}) {
  return { ok: false, code, params, message };
}
