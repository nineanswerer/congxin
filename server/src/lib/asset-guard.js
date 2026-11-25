/**
 * 首屏资源守护脚本 —— **内联**进 index.html 的一道保险。
 *
 * ## 为什么要有这个文件
 *
 * 部署到 AI Works 之后，preview 域名的静态资源**全部经过腾讯云 CloudBase 的
 * SCF 云函数**（响应头可证：`x-cloudbase-upstream-type: Tencent-SCF_HTTP`）。
 * 平台的限流是**并发**限流：
 *
 *     HTTP 429 {"code":"EXCEED_RATELIMIT",
 *               "message":"Client 127.0.0.6 exceeds rate limit."}
 *
 * 首屏同域并发约 26 个请求（12 个 CSS + 12 个 module script + 图片 + 接口），
 * 而函数冷启动期间的并发容量只有 ~6 —— **超出的会被平台直接 429 打掉**，
 * 打掉哪几个是随机的。于是每次刷新都可能缺一张样式表、缺一张图，
 * 页面就塌成「文字叠在一起 / 荧光绿背景 / 图标变方块」。
 *
 * ## 这个脚本干什么
 *
 * 它是**内联**的（不占并发名额，也不会自己被 429 打掉），做两件事：
 *   1. **图片重试**：`img` 加载失败（naturalWidth === 0）→ 换 query 重取。
 *      刘看山那张 210KB 的 idle.webp 被打掉时，页面上会出现「刘看山」三个字
 *      代替图片 —— 这是评审第一眼就会看见的。
 *   2. **script 重试**：module script 被 429 打掉时，页面会**完全没有交互**
 *      （连「叫它出来聊聊」都点不动）。服务端给每个 script 标了 `data-g`，
 *      这里靠 `onerror` 标记失败，然后换 query 重新挂载。
 *      ⚠️ 2026-11-25（D74）：原来每个 script **只重试 1 轮**（`data-gretried` 一旦
 *      置位就再也不重试）→ 平台连续两轮限流就彻底死掉。改成**最多 6 轮**，
 *      每轮间隔 900ms。
 *      ⚠️ 这里的重试是「**整个 module 图**重挂」，救不了「依赖里的某个模块
 *      被 429」—— 那种情况靠 `module-loader.js` 的**单模块级**动态 import 重试。
 *
 *   3. **module 依赖图自愈**（D74，见 module-loader.js）：首屏 module 的静态
 *      import 在服务端被改写成动态 import + 单模块重试 → 某个依赖被 429 打掉时
 *      它自己等一等再来一次，不连累整张图。
 *
 * ## 为什么不做更多
 *
 * CSS 的问题不靠重试解决 —— 重试会造成 FOUC（先塌后好，闪一下很难看）。
 * CSS 走的是**服务端内联**（见 `web-static.js`），从根上不让它变成请求。
 * 这个脚本只兜「图片 / script / 接口」这三类，够用且不会引入闪烁。
 */

/**
 * 守护脚本正文（IIFE，无构建步骤）。
 *
 * ⚠️ 这里的字符串会被原样写进 HTML —— **不能用 `</script>` 字面量**，
 *    也不能用模板串里未转义的 `${`。
 */
export const ASSET_GUARD_SCRIPT = `(function () {
  var MAX_ROUNDS = 6;
  var rounds = 0;

  function retryImage(img) {
    if (!img.complete || img.naturalWidth !== 0) return;
    if (img.dataset.gRetry) return;
    img.dataset.gRetry = '1';
    var src = img.getAttribute('src') || '';
    if (!src) return;
    img.setAttribute('src', src + (src.indexOf('?') >= 0 ? '&' : '?') + 'gr=' + rounds);
  }

  function retryScript(old) {
    if (!old.dataset.gFailed) return;
    var tries = Number(old.dataset.gTries || '0');
    if (tries >= MAX_ROUNDS) return;
    old.dataset.gTries = String(tries + 1);
    var next = document.createElement('script');
    for (var i = 0; i < old.attributes.length; i++) {
      var a = old.attributes[i];
      if (a.name === 'data-gfailed' || a.name === 'data-gtries') continue;
      next.setAttribute(a.name, a.value);
    }
    next.setAttribute('data-g', '1');
    next.setAttribute('data-gtries', String(tries + 1));
    if (old.parentNode) old.parentNode.replaceChild(next, old);
  }

  function sweep() {
    rounds += 1;
    var imgs = document.images;
    for (var i = 0; i < imgs.length; i++) retryImage(imgs[i]);
    var scripts = document.querySelectorAll('script[data-g]');
    for (var j = 0; j < scripts.length; j++) retryScript(scripts[j]);
    if (rounds < MAX_ROUNDS) setTimeout(sweep, 900);
  }

  function start() { setTimeout(sweep, 400); }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();`;

/**
 * 给 `<script src="...">` 加守护标记与 onerror。
 *
 * onerror 只能写在 HTML 属性里（模块脚本没有 `addEventListener('error')`
 * 的统一钩子可用），所以服务端改写 HTML 时要给它补上。
 *
 * @param {string} html 原始 HTML 片段
 * @returns {string} 加好标记的 HTML 片段
 */
export function markGuardedScripts(html) {
  return html.replace(/<script\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)>/gi, (match, before, quote, src, after) => {
    if (/\bdata-g\b/.test(match)) return match;
    const guard = ' onerror="this.setAttribute(\'data-gfailed\',\'1\')"';
    return `<script${before} src=${quote}${src}${quote}${after}${guard} data-g="1">`;
  });
}
