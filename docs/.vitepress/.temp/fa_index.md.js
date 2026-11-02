import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"","description":"","frontmatter":{"layout":"home","hero":{"name":"Songbird","text":"پیام‌رسان شخصی","tagline":"یک پلتفرم پیام‌رسان سبک و امن که با هدف حمایت از آزادی دیجیتال در سراسر جهان ساخته شده است.","image":{"src":"/songbird-hero.svg","alt":"Songbird"},"actions":[{"theme":"brand","text":"شروع کنید","link":"/fa/Deployment-Script"},{"theme":"alt","text":"مشاهده در GitHub","link":"https://github.com/bllackbull/Songbird"}]},"features":[{"icon":"💬","title":"پیش‌نویس و پخش ویس","details":"متن ناتمام و پیام‌های در صف را روی دستگاه نگه دارید و سرعت و نقطهٔ پخش ویس را کنترل کنید.","link":"/fa/Chat-Features"},{"icon":"🚀","title":"نصب آسان","details":"اسکریپت نصب تک خطی، وابستگی ها، build، Nginx و SSL را برای شما مدیریت میکند.","link":"/fa/Deployment-Script"},{"icon":"🐳","title":"آماده برای Docker","details":"ایمیج های رسمی و آماده داکر به همراه پشتیبانی از Docker Compose برای استقرار سریع و آسان در هر سرور.","link":"/fa/Installation-Docker"},{"icon":"🛡️","title":"پنل مدیریت","details":"رابط مدیریتی جامع برای کاربران، چت‌ها، تنظیمات و عملیات سیستم.","link":"/fa/Admin-Panel"},{"icon":"🔧","title":"قابل پیکربندی","details":"پورت‌ها، آپلودها، نگه‌داری فایل‌ها، push و موارد دیگر را از طریق متغیرهای محیطی یا رابط مدیریت تنظیم کنید.","link":"/fa/Environment-Variables"},{"icon":"☁️","title":"ذخیره سازی ابری و Media Worker","details":"ذخیره سازی ابری سازگار با S3، میکروسرویس ترنسکد و بهینه سازی رسانه با HTTP Push و توزیع CDN.","link":"/fa/Object-Storage"},{"icon":"📡","title":"Remote Channel","details":"کانال‌های Telegram یا کانال‌های Songbird دیگر را داخل کانال‌های خودتان mirror کنید.","link":"/fa/Remote-Channel-Setup"},{"icon":"📞","title":"تماس صوتی و تصویری","details":"تماس‌های صوتی و تصویری نظیر‌به‌نظیر با استفاده از WebRTC و سیگنالینگ کم‌تاخیر.","link":"/fa/Voice-Video-Calls"},{"icon":"🩺","title":"عیب‌یابی","details":"مشکلات DNS، شبکه، push و نصب را با راهنماهای کاربردی تشخیص دهید.","link":"/fa/Troubleshooting"}]},"headers":[],"relativePath":"fa/index.md","filePath":"fa/index.md","lastUpdated":null}');
const _sfc_main = { name: "fa/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("fa/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
