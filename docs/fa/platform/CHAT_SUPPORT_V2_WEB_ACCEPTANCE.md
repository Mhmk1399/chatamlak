# پذیرش Web برای پشتیبانی نسخهٔ ۲

تاریخ: ۲۰۲۶-۱۱-۲۳

وضعیت: **پذیرش unit/API در backend ‏Chat موفق است؛ پذیرش widget واقعی Web مسدود است.**

revisionهای آغازین Chat و Web به‌ترتیب `0397bd32da4d653bc237d47f33f3223e393683f4` و `825deb1dec989e390ac8048310db790c5f111e8f` بودند.

## تأییدشده در Chat

مجموعهٔ کامل سرور تمام **۱۸ تست Support v1** و **۵ تست چرخهٔ Support v2** را موفق کرد. پوشش backend شامل exchange نشست محدود، جداسازی current/history، پروندهٔ جدید، reopen مجاز، جداسازی پیام بر اساس پرونده، قصد صریح guest-link، logout/revocation و حفظ سازگاری v1 است.

این شاهد unit/API است، نه شاهد widget واقعی Web.

## مانع Web واقعی

harness آزمایش‌شدهٔ Web فقط `/support/v1` را ارائه می‌کند و widget آن exchange/current/history/new/reopen/message/unread/replay/logout نسخهٔ ۲ را فراخوانی نمی‌کند. Chat نمی‌تواند جریان وبی را که Web مصرف نمی‌کند اثبات کند و این مخزن اجازهٔ ویرایش Web را ندارد.

## مانع پیوند تاریخچه میان hostها

عملیات فعلی `link-registered` هر دو کوکی پشتیبانی مهمان v2 و `sid` بومی فدره‌شدهٔ Chat را در یک درخواست می‌خواهد. این کوکی‌ها عمداً روی دو subdomain متفاوت host-only هستند و مرورگر نمی‌تواند هر دو را به یک host بفرستد. اشتراک کوکی میان originها یا افشای bearer token به JavaScript frontend مدل امنیتی را ضعیف می‌کند و پیاده‌سازی نشد.

handoff افزایشی باید با مالکیت مشترک Web بررسی شود و موارد زیر را داشته باشد:

1. تأیید سمت سرور نشست مهمان و هویت ثبت‌شدهٔ Web؛
2. تأیید پیوند دقیق هویت بومی Chat؛
3. proof کوتاه‌عمر، یک‌بارمصرف و محدود به audience/purpose؛
4. اتصال CSRF میان-origin، مصرف اتمیک، expiry و رد replay؛
5. اتصال حساب دقیق بدون merge بر اساس نام/ایمیل/تلفن؛
6. قواعد conflict وقتی هر دو هویت پروندهٔ فعال دارند؛
7. حفظ authorship/history و رفتار Support v1؛
8. تست موفق و hostile در هر دو مخزن.

تا ایجاد این قرارداد، link میان hostها و پذیرش واقعی Support v2 در Web **مسدود** هستند و کامل تلقی نمی‌شوند.

## دستور و شاهد

```bash
npm --prefix server run test
```

اجرای کامل مجاز **۱۴۷ فایل و ۱۲۳۹ تست** را، شامل `test/api/support.test.js` و `test/api/supportV2.test.js`، موفق کرد. منبع Web یا Analytics تغییر نکرد و ارائه‌دهندهٔ خارجی فراخوانی نشد.
