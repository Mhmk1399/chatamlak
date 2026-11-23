# گزارش end-to-end ‏CRM از Chat به Web

تاریخ: ۲۰۲۶-۱۱-۲۳

revision آغازین Chat برابر `0397bd32da4d653bc237d47f33f3223e393683f4` و Web برابر `825deb1dec989e390ac8048310db790c5f111e8f` بود. Chat اصلاحات commit‌نشدهٔ سازگاری اسپرینت ۵ داشت.

## نتیجه

**موفق: یکپارچه با Web و مرورگر واقعی، از endpoint محافظت‌شدهٔ Chat تا endpoint مالک CRM در Web.**

مرورگر فدره‌شده `POST /api/integrations/crm/tasks` را در Chat فراخواند؛ Chat با اثبات جاری actor نمایندگی و service identity به `POST /api/internal/v1/crm/tasks` در Web درخواست داد. دسترسی مستقیم به پایگاه‌دادهٔ Web وجود نداشت.

رفتار تأییدشده:

- عضویت گفتگوی مبدأ در Chat بررسی شد؛
- سیاست جاری actor/assignment در Web بررسی شد؛
- `dueAt` اجباری، subject/instructions/steps محدود و لینک/شناسهٔ canonical وب برگشت؛
- transcript، متن پیام، اطلاعات تماس مشتری، تلفن یا هویت گسترده ارسال نشد؛
- موفقیت فقط پس از تأیید mutation توسط Web نمایش داده شد؛
- retry همان key و payload پس از restart Chat همان task را با `deduped: true` برگرداند؛
- همان key با payload متفاوت پاسخ `409` داد؛
- verifier وب رفتار actor لغوشده/نمایندگی و assignment ناموفق را موفق کرد.

## اصلاحات سازگاری

Chat اکنون envelope واقعی `{ token, expiresInSeconds }` را در کنار شکل قدیمی string می‌پذیرد. خطاهای flat مانند `{ error: "TOKEN_REVOKED" }` در کنار شکل nested قدیمی normalize می‌شوند. refresh بدون اثبات جدید مقدار `null` می‌نویسد و مانع استفاده از مجوز قدیمی می‌شود. UI به `crmTaskAllowed` نیاز دارد و کلید session-scoped پایدار را از hash قصد گفتگو/وظیفه بازسازی می‌کند، بدون ذخیرهٔ محتوای وظیفه.

## سطوح شواهد

| سطح | شاهد |
|---|---|
| Unit/API | فرمان CRM، client، عضویت route، normalization خطا، پاک‌سازی proof و allowlist درخواست UI |
| MongoDB یک‌بارمصرف | پایداری و پاک‌شدن proof در refresh نشست بومی Web |
| Web واقعی | verifier provider وب و فرمان داخلی واقعی CRM |
| مرورگر واقعی | نشست UI ‏Chat → API ‏Chat → CRM ‏Web، شامل retry پس از restart و conflict |

## دستور

```bash
zsh -a -c 'source integration/.env.synthetic; node ../chatamlak/client/test/e2e/web-sso-crm-platform-flow.mjs'
```

اسکریپت محافظ‌دار فقط با پروژهٔ `owj-sprint4-synthetic`، پورت `28088`، سه database با پسوند `_e2e` و marker برابر `owj-sprint4-synthetic-only-v1` اجرا شد.

## محدودیت و rollback

ذخیرهٔ session-scoped key محدود است و فقط key/fingerprint/time دارد. Web مالک دوام idempotency و task است. rollback کردن helper کلاینت بازسازی retry میان modalها را حذف می‌کند ولی task یا schema وب را تغییر نمی‌دهد. timeout تولید، rotation توکن و alert عملیاتی همچنان کار استقرار است.
