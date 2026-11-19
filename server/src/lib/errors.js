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
  QUESTION_NOT_FOUND: {
    http: 404,
    retryable: false,
    hint: '这道题已经失效了，重新出一道吧',
  },
  INTERNAL_ERROR: {
    http: 500,
    retryable: true,
    hint: '出了点问题，我们正在查',
  },
};

/**
 * 对外前把 `detail` 里可能含**服务器路径 / 栈帧**的片段洗掉。
 *
 * 安全网：正常路径上 `detail` 只放 `question_id=xxx` 这种**不含路径**的细节；
 * 万一将来有人把路径或栈塞进来，这里兜住 —— 赛规要求密钥与内部信息不得出现在
 * 前端响应里，这层不依赖每个人每次都记得。
 */
function scrubDetail(detail) {
  if (detail === null || detail === undefined) return null;
  return String(detail)
    .replace(/[A-Za-z]:[\\/][^\s'"]*/g, '[已隐藏的服务器路径]')
    .replace(/\/[\w.-]*\/node_modules\/[\w./-]*/g, '[已隐藏的依赖路径]')
    .replace(/\s+at\s+[^\s(]+\([^)]*\)/g, '')
    .slice(0, 400);
}

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
        detail: scrubDetail(this.detail),
      },
    };
  }
}

/**
 * 把任意异常包成 ApiError。
 *
 * ⚠️ **绝不把栈、绝对路径、原始报错透给客户端**（2026-11-19 修）。
 *
 * 之前这里把 `err.stack` 塞进 `detail`，于是一个 body-parser 的 500
 * 会把 `C:\Users\steam\Desktop\从心\server\node_modules\body-parser\...`
 * **原样吐给浏览器**——泄露服务器目录结构、依赖版本，还把英文原始报错
 * 甩到界面上（违反「失败要给真话，但真话不是给用户看栈」）。
 *
 * 现在：响应里只留一个**短 id**，栈与原始报错**只进服务端日志**。
 * 排查时拿 id 去日志里搜即可，对外一点路径都不漏。
 */
export function toApiError(err) {
  if (err instanceof ApiError) return err;

  // body-parser 解析坏 JSON 时抛的 SyntaxError（带 status 400 / type entity.parse.failed）。
  // 这是**请求格式不对**，不是服务器内部错误 —— 别回 500。
  // ⚠️ 11-19 实测撞出来的：命令行里 JSON 的引号被 shell 吃了，接口回的是
  //    「出了点问题，我们正在查」（INTERNAL_ERROR），而真实原因是「你的请求格式不对」。
  if (err?.type === 'entity.parse.failed' || (err?.status === 400 && err instanceof SyntaxError)) {
    return new ApiError('VALIDATION_ERROR', '请求体不是合法 JSON', {
      userHint: '请求格式不对，检查一下发过来的内容',
    });
  }

  const ref = `err_${Math.random().toString(36).slice(2, 10)}`;
  console.error(`[server] 未处理异常 ${ref}：`, err);
  return new ApiError('INTERNAL_ERROR', '服务器内部错误', {
    detail: ref,
  });
}
