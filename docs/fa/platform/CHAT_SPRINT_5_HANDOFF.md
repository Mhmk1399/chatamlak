# تحویل اسپرینت ۵ گفتگوی اوج

تاریخ: ۲۰۲۶-۱۱-۲۳

وضعیت: **SSO واقعی Web، CRM از Chat به Web، دوام پس از restart و تماس realtime محلی به‌صورت واقعی با Web/مرورگر یکپارچه و تأیید شدند. پذیرش Web برای پشتیبانی نسخهٔ ۲ و پیوند تاریخچهٔ مهمان میان hostnameها همچنان مسدود است.**

revisionهای آغازین Chat برابر `0397bd32da4d653bc237d47f33f3223e393683f4` و Web برابر `825deb1dec989e390ac8048310db790c5f111e8f` بودند. working tree مخزن Chat تغییرات commit‌نشدهٔ اسپرینت ۵ دارد؛ منبع Web و Analytics ویرایش نشد.

## مالکیت و محیط

Chat همچنان مالک گفتگو، پیام، عضویت، تماس، پروندهٔ پشتیبانی و مجوز realtime است. Web مرجع هویت و مالک تغییرات CRM می‌ماند. Chat فقط با API احرازشده به Web دسترسی دارد و collectionهای Web را نمی‌خواند.

تمام بررسی‌های میان‌مخزنی در محیط مصنوعی حفظ‌شده انجام شد:

| محافظ | مقدار |
|---|---|
| پروژهٔ Compose | `owj-sprint4-synthetic` |
| پراکسی | `http://*.owj.localhost:28088` |
| پایگاه‌های داده | `owj_web_e2e`، `owj_chat_e2e`، `owj_analytics_e2e` |
| نشانگر | `owj-sprint4-synthetic-only-v1` |
| ارائه‌دهندگان | SMS، object storage، Divar، Atlas و سرویس‌های پولی/خارجی غیرفعال |

هیچ داده‌ای روی پورت `18088`، production clone، ارائه‌دهندهٔ خارجی یا reset کردن volume استفاده نشد.

## اصلاحات تحویل‌شده

- envelope واقعی اثبات نمایندگی CRM و شکل flat خطای Web با مصرف‌کننده‌های Chat سازگار شد.
- اثبات قدیمی CRM هنگام refresh بدون اثبات جدید پاک و لغو آن پایدار شد.
- scopeهای جاری Web و قابلیت CRM به کلاینت رسید؛ `chat:call` در سرور و UI enforce می‌شود و `chat:admin` هرگز نقش بومی Chat را ارتقا نمی‌دهد.
- بازسازی کلید idempotency محدود به session بدون ذخیرهٔ محتوای وظیفه اضافه شد؛ retry مبهم از بازشدن دوبارهٔ modal و restart Chat عبور می‌کند.
- فیلد اجباری `dueAt` وب و شناسه/لینک canonical وظیفه حفظ شد.
- signaling صوتی WebSocket برای نوع `voice` کلاینت اصلاح و سازگاری قدیمی `audio` حفظ شد.
- انتقال `callsDisabledForUser` به view جداشدهٔ Chat که اجرای کامل Chromium آشکار کرد اصلاح شد.

## ماتریس پذیرش

| بخش | طبقه‌بندی | نتیجه |
|---|---|---|
| SSO وب و نشست بومی Chat | یکپارچه با Web واقعی و مرورگر واقعی | با سه هویت مصنوعی Web، callback دقیق، پیام خصوصی، tab دوم، جداسازی و لغو logout موفق |
| قرارداد منفی provider وب | یکپارچه با Web واقعی | verifier وب بررسی‌های code/identity/revocation/delegation را موفق کرد |
| فرمان وظیفهٔ CRM | Web و مرورگر واقعی | ساخت، شناسهٔ پایدار، dedupe بعد از restart، تعارض payload و قرارداد assignment موفق |
| تماس | مرورگر واقعی، فقط محلی | WebSocket/پراکسی واقعی Chat و WebRTC loopback صوت/ویدیو موفق |
| backend پشتیبانی v1/v2 | unit/API | نسخهٔ ۱: ۱۸ تست؛ نسخهٔ ۲: ۵ تست، همگی موفق |
| widget وب پشتیبانی v2 | مسدود | harness واقعی Web فقط `/support/v1` را ارائه می‌کند و widget مصرف‌کنندهٔ v2 نیست |
| پیوند تاریخچهٔ مهمان میان hostها | مسدود | عملیات فعلی دو کوکی host-only را در یک درخواست می‌خواهد و handoff یک‌بارمصرف بررسی‌شده وجود ندارد |
| مجموعهٔ کامل Chromium | جزئی | ابتدا ۸۰۸ از ۸۲۰ موفق؛ crash اسپرینت ۵ رفع شد اما چهار انتظار قدیمی باقی است |
| Firefox | موکول | executable محلی موجود نبود |

جزئیات در گزارش‌های [SSO](./CHAT_WEB_SSO_E2E_REPORT.md)، [CRM](./CHAT_WEB_CRM_E2E_REPORT.md)، [پشتیبانی](./CHAT_SUPPORT_V2_WEB_ACCEPTANCE.md)، [مرورگر](./CHAT_BROWSER_REGRESSION_REPORT.md) و [تماس](./CHAT_REALTIME_CALL_INTEGRATION_REPORT.md) آمده است.

## تأیید

```bash
npm --prefix server run test
npm --prefix server run test:mongo
npm --prefix client run test:unit
VITEST_COVERAGE=1 npm --prefix client exec vitest --project browser --run
```

- سرور: **۱۴۷ فایل و ۱۲۳۹ تست موفق**. اجرای اولیه داخل sandbox به‌علت `EPERM` برای listener محلی و child process معتبر نبود؛ اجرای مجاز بالا کاملاً موفق شد.
- replica set یک‌بارمصرف MongoDB: **۱۰ فایل و ۶۴ تست موفق**.
- unit کلاینت: **۴۹ فایل و ۴۵۹ تست موفق**.
- اجرای گستردهٔ Chromium: پیش از triage، **۶۵ از ۷۳ فایل و ۸۰۸ از ۸۲۰ تست موفق**. crash تأییدشدهٔ اسپرینت ۵ و چهار تست متأثر پس از اصلاح موفق شدند؛ چهار انتظار نامرتبط در سه فایل باقی است.

## مرز استقرار

این پذیرش مصنوعی محلی است، نه تأیید تولید. تولید هنوز به HTTPS، بررسی NAT محدود/TURN، rotation توکن سرویس، مرور proxy/header، سنجش منابع، پایش، backup/restore و rollback نیاز دارد. پشتیبانی v2 و پیوند مهمان باید تا پیاده‌سازی قرارداد مصرف‌کننده/handoff توسط Web مسدود بمانند.
