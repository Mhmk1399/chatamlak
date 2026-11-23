# گزارش یکپارچه‌سازی تماس realtime

تاریخ: ۲۰۲۶-۱۱-۲۳

revision آغازین Chat برابر `0397bd32da4d653bc237d47f33f3223e393683f4` و Web برابر `825deb1dec989e390ac8048310db790c5f111e8f` بود.

## نتیجه

**موفق: نشست‌های واقعی برنامهٔ فدره‌شده، signaling واقعی WebSocket/پراکسی معکوس Chat و رسانهٔ WebRTC loopback مرورگر محلی.** این نتیجه صریحاً تماس فقط محلی است و پذیرش NAT/TURN تولید نیست.

دو هویت مصنوعی Web از callback واقعی SSO وارد شدند، گفتگوی مستقیم مجاز باز کردند و WebSocket احرازشده را از `chat.owj.localhost:28088` به کار بردند. اجرا موارد زیر را تأیید کرد:

- دعوت صوتی، event ورودی و پذیرش؛
- relay ‏SDP offer/answer توسط call manager واقعی Chat؛
- اتصال peer با صوت oscillator و ویدیوی canvas مصنوعی؛
- mute و سپس unmute؛
- relay وضعیت روشن/خاموش دوربین؛
- hangup و نبود state تماس ورودی در سرور؛
- دریافت خطای مجوز تماس توسط کاربر سوم فدره‌شده و غیرعضو؛
- حفظ نشست مات و پیام پایدار پس از restart فقط Chat؛ retry ‏CRM نیز امن ماند.

## نقص کشف و اصلاح‌شده

کلاینت بومی نوع شروع WebSocket برابر `voice` می‌فرستاد، اما gateway فقط `audio` یا `video` را می‌پذیرفت. ابتدا regression test رد شدن voice را بازتولید کرد. اکنون gateway نوع‌های `voice`، `video` و `audio` قدیمی را می‌پذیرد. تست متمرکز gateway ‏۴/۴ موفق شد و سپس تماس مرورگری فدره‌شدهٔ واقعی نیز موفق بود.

## شواهد

```bash
npm --prefix server exec vitest run test/lib/websocketGateway.call.test.js
zsh -a -c 'source integration/.env.synthetic; node ../chatamlak/client/test/e2e/web-sso-crm-platform-flow.mjs'
```

خروجی محافظ‌دار مرورگر تماس را `actual-federated-session-websocket-loopback-media` طبقه‌بندی کرد. مجموعهٔ کامل سرور نیز ۳۳ تست API تماس و ۴۵ تست call-manager را در میان **۱۲۳۹ از ۱۲۳۹** تست موفق کرد.

## نیازمندی‌های تولید

پیش از پذیرش تولید:

- Web و Chat روی HTTPS و `wss` ارائه شوند؛
- TURN احرازشده با credential محدود تنظیم و مسیرهای UDP/TCP/TLS آزمایش شود؛
- NAT و firewall محدود، تغییر شبکهٔ موبایل، reconnect، رد مجوز رسانه و ناپدیدشدن peer آزمایش شود؛
- خطای signaling، زمان setup، نتیجهٔ ICE و سلامت TURN بدون log کردن SDP، credential یا متن پیام پایش شود؛
- بررسی وضعیت جاری `chat:call` و عضویت گفتگوی بومی برای هر عمل تماس حفظ شود.

هیچ زیرساخت TURN زنده‌ای فراخوانی نشد. موفقیت loopback محلی عبور اینترنتی یا پایداری رسانه در تولید را ثابت نمی‌کند.
