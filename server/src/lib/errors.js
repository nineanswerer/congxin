/**
 * 统一错误信封。
 *
 * 契约要求（contracts/api.json 的 x-error-codes）：
 *   { error: { code, message, user_hint, retryable, retry_after_ms, upstream, detail } }
 *
 * **user_hint 是直接显示在界面上的中文提示**——不允许为空、不允许是英文原始报错、
 * 不允许写「未知错误」。这是官方提交前检查第 7 条查的东西。
 */

export const ERROR_CATALOG = {
  VALIDATION_ERROR: {
    http: 400,
    retryable: false,
    hint: '这个请求不太对，换个说法再试一次',
  },
  ZHIHU_AUTH_INVALID: {
    http: 401,
    retryable: false,
    hint: '登录状态失效了，重新授权一下',
  },
  OAUTH_REQUIRED: {
    http: 401,
    retryable: false,
    hint: '这个功能需要先登录知乎账号',
  },
  ZHIHU_RATE_LIMITED: {
    http: 429,
    retryable: true,
    hint: '等几秒再试一下，这不是你的操作问题',
  },
  ZHIHU_QUOTA_EXHAUSTED: {
    http: 429,
    retryable: false,
    hint: '今天的调用次数用完了，明天再来',
  },
  ZHIHU_UPSTREAM_ERROR: {
    http: 502,
    retryable: true,
    hint: '知乎那边暂时不稳定，稍后重试',
  },
  ZHIHU_TIMEOUT: {
    http: 504,
    retryable: true,
    hint: '网络有点慢，再试一次',
  },
  INTERNAL_ERROR: {
    http: 500,
    retryable: true,
    hint: '出了点问题，我们正在查',
  },
};

export class ApiError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    const cat = ERROR_CATALOG[code] || ERROR_CATALOG.INTERNAL_ERROR;
    this.httpStatus = options.httpStatus || cat.http;
    this.retryable = options.retryable !== undefined ? options.retryable : cat.retryable;
    this.userHint = options.userHint || cat.hint;
    this.retryAfterMs = options.retryAfterMs !== undefined ? options.retryAfterMs : null;
    this.upstream = options.upstream || null;
    this.detail = options.detail !== undefined ? options.detail : null;
  }

  /** 转成契约里的错误信封。 */
  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        user_hint: this.userHint,
        retryable: this.retryable,
        retry_after_ms: this.retryAfterMs,
        upstream: this.upstream,
        detail: this.detail,
      },
    };
  }
}

/** 把任意异常包成 ApiError。**不认识的异常一律 INTERNAL_ERROR，绝不把栈透给前端。 */
export function toApiError(err) {
  if (err instanceof ApiError) return err;
  return new ApiError('INTERNAL_ERROR', err?.message || '内部错误', {
    detail: process.env.NODE_ENV === 'production' ? null : String(err?.stack || err),
  });
}
