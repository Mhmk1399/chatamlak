# گزارش regression مرورگر اسپرینت ۵

تاریخ: ۲۰۲۶-۱۱-۲۳

مرورگر: Google Chrome/Chromium محلی. Firefox اجرا نشد چون executable آن در Playwright موجود نبود.

## اجرای کامل

```bash
VITEST_COVERAGE=1 npm --prefix client exec vitest --project browser --run
```

اجرای گسترده **۷۳ فایل و ۸۲۰ تست** داشت: **۶۵ فایل و ۸۰۸ تست موفق** و در ابتدا **۸ فایل و ۱۲ تست ناموفق** بود. بنابراین مجموعهٔ کامل موفق اعلام نمی‌شود.

## Triage

| گروه شکست | طبقه‌بندی | نتیجه |
|---|---|---|
| `ChatPageOffline` (۳) و `ChatPageMobileSearch` (۱) | regression واقعی اسپرینت ۵ | `callsDisabledForUser` در controller تعریف ولی از view model جداشده حذف شده بود. اصلاح شد و هر چهار تست در اجرای متمرکز موفق شدند. |
| `ChatHeaderActions` (۲)، keyboard منوی upload (۱)، layer منوی کاربر (۱) | timing/contention در اجرای موازی گسترده | اجرای متمرکز موفق: header ‏۹/۹، upload ‏۲۰/۲۰ و user-menu layers ‏۷/۷. |
| `SidebarHeader.calls` (۱) | expectation قدیمی تست | تست هنوز `h-[72px]` را می‌خواهد؛ طراحی جاری header این class را ندارد. |
| `ConversationFilters` دسکتاپ (۲) | expectation قدیمی تست | تست‌ها `.ouj-folder-count` را می‌خواهند؛ action دسکتاپ جاری آن node را ندارد. |
| `SidebarHeader.userButton` (۱) | expectation قدیمی تست | تست کنترل desktop با نام `User menu` را انتظار دارد که header جاری دیگر render نمی‌کند. |

اجرای متمرکز نهایی هشت فایل، **۴۶ از ۵۰ تست** را موفق کرد. چهار شکست باقی‌مانده فقط در سه فایل expectation قدیمی بالا هستند و به SSO، CRM، enforce کردن scope یا اصلاح view-model اسپرینت ۵ مربوط نیستند.

## شواهد دیگر کلاینت

```bash
npm --prefix client run test:unit
```

نتیجه: **۴۹ فایل و ۴۵۹ تست موفق**. build تولیدی کلاینت نیز داخل image ایزولهٔ Chat موفق شد.

## تفسیر

regression مرورگری تأییدشدهٔ اسپرینت ۵ اصلاح و پوشش داده شد. برای چهار شکست باقی‌مانده باید مشخص شود رفتار فعلی UI یا انتظار قدیمی مرجع است؛ این اسپرینت رفتار layout نامرتبط را فقط برای سبزکردن تست تغییر نداد.
