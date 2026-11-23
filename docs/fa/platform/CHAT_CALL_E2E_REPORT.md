# گزارش end-to-end تماس Chat

تاریخ: ۲۰۲۶-۱۱-۲۳

وضعیت: **شواهد عملکردی محلی WebRTC است، نه ادعای پایداری تولید**.

## بررسی واقعی مرورگر دوکاربره

`client/test/e2e/call-two-users.mjs` با دستور `npm run test:e2e:call` مرورگر واقعی Chromium را با دو context/page جدا برای Alice و Bob اجرا می‌کند. هر طرف یک `RTCPeerConnection` واقعی می‌سازد؛ صوت oscillator و ویدیوی canvas مصنوعی، رسانهٔ قطعی و بدون دوربین/میکروفن فیزیکی می‌دهند.

اجرای ثبت‌شده این موارد را تأیید کرد:

- ساخت و تحویل offer؛
- ساخت و تحویل answer؛
- برقراری اتصال peer؛
- یک track صوتی و یک track ویدیویی راه‌دور؛
- mute صوت (`enabled=false`)؛
- خاموشی دوربین (`enabled=false`)؛
- hangup و بسته شدن peer.

mirror مصنوعی و machine-readable نتیجه در [`fixtures/chat-sprint4-v1/call-e2e-result.json`](../../platform/fixtures/chat-sprint4-v1/call-e2e-result.json) است.

## شواهد regression پشتیبان

| بررسی | نتیجه |
|---|---|
| مجموعهٔ کامل سرور | ۱۴۶ فایل و ۱۲۳۴ تست موفق |
| مجموعهٔ کامل MongoDB یک‌بارمصرف | ۱۰ فایل و ۶۴ تست موفق، شامل native-auth و تبدیل تاریخچهٔ مهمان روی replica set واقعی |
| مجموعهٔ کامل unit کلاینت | ۴۸ فایل و ۴۵۷ تست موفق |
| اجراهای متمرکز مؤلفهٔ اسپرینت ۴ در Chromium | ۶ فایل و ۳۵ تست موفق، شامل regression عدم ارسال محتوای پیام به CRM |
| پوشش تماس/سرور در مجموعهٔ سرور | API تماس، call manager و مسیرهای signaling وب‌سوکت موفق |
| regression مربوط به scope تماس فدره | guard اصلاح‌شده، نشست فدره‌شده بدون `chat:call` را رد و نشست دارای آن scope را می‌پذیرد |
| audit متمرکز تماس/رسانه/امنیت | ۱۰ فایل و ۸۳ تست موفق برای مجوز تماس/رسانه، رسانهٔ خصوصی، مالکیت/تلاش مجدد callback بارگذاری، صف و امنیت استقرار |
| build و lint کلاینت | موفق |

۳۵ تست متمرکز مرورگر، UI احراز هویت، هشدار احراز هویت، header چت، modal وظیفهٔ CRM، یکپارچگی speaker/media و مؤلفه‌های تماس گروهی مرتبط را پوشش دادند. Firefox به‌دلیل نبود executable در cache محلی دوباره اجرا نشد؛ گزارش فقط شواهد Chromium را ادعا می‌کند.

## مواردی که ثابت نشده‌اند

اسکریپت E2E از `iceServers: []` و دو context محلی loopback استفاده می‌کند. مدیریت اعتبارنامهٔ TURN، خاتمهٔ TLS، عبور NAT/firewall محدود، رفتار loss/reconnect شبکهٔ گسترده، ظرفیت یا دسترس‌پذیری signaling تولید را ثابت نمی‌کند. WebRTC تولید همچنان به secure context از نوع HTTPS و سرویس TURN درست تنظیم‌شده، ترجیحاً با TLS و اعتبارنامهٔ چرخش‌یافته، نیاز دارد.

مسیرهای incoming/reject/busy/group در موارد ذکرشده پوشش مؤلفه و سرور دارند، اما اسکریپت دوکاربره به offer/answer/connect/media-controls/hangup محدود است. مسیر کامل مرورگری Web ↔ Chat در استقرار واقعی از proxy، هویت، signaling، TURN و شبکهٔ مشابه تولید همچنان وظیفهٔ پذیرش استقرار است.

