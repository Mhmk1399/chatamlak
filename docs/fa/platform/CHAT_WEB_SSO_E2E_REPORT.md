# گزارش end-to-end ‏SSO میان Chat و Web

تاریخ: ۲۰۲۶-۱۱-۲۳

revision آغازین Chat برابر `0397bd32da4d653bc237d47f33f3223e393683f4` و Web برابر `825deb1dec989e390ac8048310db790c5f111e8f` بود. هنگام پذیرش، Chat تغییرات commit‌نشدهٔ اسپرینت ۵ داشت.

## نتیجه

**موفق: یکپارچه با Web واقعی و مرورگر Chrome واقعی در harness ایزولهٔ پورت ۲۸۰۸۸.**

جریان مرورگری محافظ‌دار از سه هویت مصنوعی مستقل Web استفاده کرد. Chat بدون احراز هویت باز شد، authorization وب آغاز شد، مرورگر به callback دقیق Chat برگشت، کوکی تراکنش host-only و `HttpOnly` تأیید شد، code یک‌بارمصرف exchange شد و نشست مات فدره‌شدهٔ Chat—نه نشست JWT وب—صادر شد.

دو کاربر مجاز گفتگوی مستقیم ساختند و پیام واقعی Chat فرستادند. peer گفتگو را بارگذاری کرد ولی هویت سوم نامرتبط آن را ندید. tab دوم همان نشست را استفاده کرد. پس از restart فقط Chat، هر دو tab و نشست peer معتبر ماندند؛ logout دسترسی هر دو tab را لغو کرد.

حساب‌ها با نام کاربری، تلفن یا ایمیل خودکار match/merge نشدند. پیوند دقیق موجود استفاده شد؛ پوشش مخزن و MongoDB یک‌بارمصرف provisioning جدا برای کاربر جدید و تعارض پیوند را آزمایش می‌کند.

## مدل مجوز جاری

- `chat:access` federation بومی Chat را مجاز می‌کند.
- `chat:call` در endpoint تماس بررسی و در UI منعکس می‌شود.
- `chat:staff` و `chat:admin` فقط واقعیت مجوز Web هستند و نقش پایگاه‌دادهٔ بومی Chat را بازنویسی نمی‌کنند.
- مجوز owner/admin بومی Chat مرجع و پیش‌فرض آن deny است.
- UI ‏CRM فقط با capability نمایندگی جاری ظاهر می‌شود.
- لغو قطعی Web نشست Chat را حذف می‌کند؛ قطعی status به‌صورت fail-closed عمل می‌کند.

## شواهد منفی و چرخهٔ عمر

verifier واقعی Web بررسی provider ‏SSO، replay، revocation، delegated actor، idempotency ‏CRM و assignment ناموفق را گذراند. تست‌های Chat شامل PKCE اشتباه، state/redirect، expiry، تعارض پیوند، demotion/deactivation و status unavailable است. جریان مرورگر نیز جداسازی کاربر نامرتبط و لغو نشست میان tabها را ثابت کرد.

## دستورات

```bash
# اجرا از مخزن Web؛ اسکریپت هر target غیر از marker/port/database مصنوعی را رد می‌کند.
zsh -a -c 'source integration/.env.synthetic; node ../chatamlak/client/test/e2e/web-sso-crm-platform-flow.mjs'

docker compose --project-name owj-sprint4-synthetic \
  --env-file integration/.env.synthetic \
  -f integration/compose.yaml \
  -f integration/synthetic.compose.yaml \
  -f /tmp/owj-sprint5-chat.override.yaml \
  exec -T web node /app/verify-web-sprint4.mjs
```

خروجی مرورگر SSO را `actual-web-browser-integrated` طبقه‌بندی کرد؛ verifier وب برای provider بومی SSO، لغو، actor نمایندگی، idempotency ‏CRM و assignment ناموفق `PASS` داد.

## محدودیت‌ها

این نتیجه فقط استقرار مصنوعی محلی را ثابت می‌کند و TLS تولید، rotation secret، تأخیر اینترنت، چند node یا دادهٔ هویت تولید را پوشش نمی‌دهد. منبع Web/Analytics تغییر نکرد.
