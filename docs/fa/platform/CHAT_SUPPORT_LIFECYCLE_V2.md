# چرخهٔ پشتیبانی Chat نسخه ۲

وضعیت: **به‌صورت API افزایشی چرخهٔ مشتری پیاده‌سازی شده است**. پشتیبانی نسخهٔ ۱ ثبت می‌ماند و قراردادهای bootstrap، staff، SSE و WebSocket بومی آن حفظ می‌شوند.

## exchange نشست با حفظ نسخهٔ ۱

کوکی ثابت نسخهٔ ۱ همچنان `owj_support_sid` با مسیر دقیق `/support/v1` است و اسپرینت ۴ مسیر آن را گسترده نمی‌کند. پس از آن‌که Web، `supportSessionCredential` مات و صادرشده را دریافت کرد، با بدنهٔ JSON آن را به `POST /support/v2/session` می‌فرستد. Chat مجوز `read` را اعتبارسنجی می‌کند، `{version:2,ok:true,expiresAt}` را برمی‌گرداند و کوکی host-only جداگانهٔ `owj_support_v2_sid` را با `HttpOnly`، `SameSite=Lax`، مسیر `/support/v2` و در HTTPS با `Secure` تنظیم می‌کند. همهٔ مسیرهای زیر از این کوکی نسخهٔ ۲ احراز می‌شوند.

`POST /support/v2/logout` به‌صورت محلی idempotent است: در صورت دسترسی نشست را revoke، اتصال‌های realtime آن را قطع و `owj_support_v2_sid` را در همان مسیر `/support/v2` پاک می‌کند. اگر نشست قبلاً منقضی شده یا مجوز upstream در دسترس نباشد نیز logout قابل استفاده می‌ماند.

## مدل پرونده

نسخهٔ ۲ به هر مالک تاریخچه و حداکثر یک پروندهٔ فعال (`open` یا `assigned`) می‌دهد. `owner_identity_key` چند پرونده را پشتیبانی می‌کند و رکوردهای قدیمی نسخهٔ ۱ با `identity_key` در انتخاب جاری/تاریخچه دیده می‌شوند. ساخت پرونده از `create_idempotency_digest` با ایندکس یکتای partial استفاده می‌کند. شمارش خوانده‌نشدهٔ مشتری با کار محدود روی حداکثر ۱۰۰ پرونده و timestamp خواندن مشتری انجام می‌شود.

`GET /support/v2/cases` برمی‌گرداند:

```json
{
  "version": 2,
  "current": { "conversationId": "case_current_01", "caseNumber": 2, "status": "open", "unreadCount": 0, "current": true, "reopenedAt": null },
  "history": []
}
```

فیلدهای normalizeشدهٔ پرونده می‌توانند status، شمارهٔ پرونده، unread count، جاری بودن و زمان بازگشایی را شامل شوند. نشست پشتیبانی مرز مجوز می‌ماند.

## مسیرها و قواعد چرخه

| مسیر | قاعده |
|---|---|
| `POST /support/v2/session` | اعتبارنامهٔ مات صادرشده را به کوکی جداگانه و `HttpOnly` نسخهٔ ۲ تبدیل می‌کند و قرارداد کوکی نسخهٔ ۱ را تغییر نمی‌دهد |
| `POST /support/v2/logout` | در صورت امکان revoke، نشست را disconnect و کوکی نسخهٔ ۲ را idempotent پاک می‌کند |
| `GET /support/v2/cases` | فقط پروندهٔ جاری و تاریخچهٔ مشتری/مهمان احرازشده را برگرداند |
| `POST /support/v2/cases` | مجوز `send` و `Idempotency-Key` لازم؛ locale/context allowlistشده اختیاری؛ در وجود پروندهٔ فعال رد؛ پس از resolve/close پرونده‌ای مستقل می‌سازد |
| `POST /support/v2/cases/:conversationId/reopen` | مالک، هدف resolved/closed، نبود پروندهٔ فعال دیگر و `Idempotency-Key` لازم؛ پرونده را open و بدون assignment می‌کند |
| `GET /support/v2/cases/:conversationId/messages` | مجوز مالک و pagination محدود؛ پرونده را خوانده‌شده علامت می‌زند |
| `POST /support/v2/cases/:conversationId/messages` | مجوز مالک و بررسی چرخه؛ قواعد idempotency پیام موجود را حفظ می‌کند |
| `GET /support/v2/cases/:conversationId/events` | replay محدود JSON با cursor، `gap` و `hasMore`؛ transport جدید SSE/WebSocket نسخهٔ ۲ نیست |
| `POST /support/v2/link-registered` | تبدیل صریح تاریخچهٔ مهمان که در ادامه آمده است |

پشتیبانی نسخهٔ ۱ سطح سازگاری realtime باقی می‌ماند. رفتار SSE/WebSocket نسخهٔ ۱ جایگزین نشده است.

## پیوند تاریخچهٔ مهمان

تبدیل مهمان عمداً صریح است. درخواست باید `{ "intent": "link_guest_history" }`، یک `Idempotency-Key` پایدار، کوکی نشست مهمان `owj_support_v2_sid` و `sid` بومی و جاریِ فدره‌شده با وب داشته باشد. Chat مجوز بومی وب را با اجبار refresh و پیوند دقیق و فعال پلتفرم را بررسی می‌کند.

در موفقیت، همهٔ پرونده‌های آن هویت مهمان به مالک ثبت‌شده تبدیل و عضویت کاربر Chat اضافه می‌شود. اگر تاریخچهٔ ثبت‌شده از قبل موجود باشد، پرونده‌های مهمان شماره‌های یکتای بعدی می‌گیرند. وقتی هر دو سمت پروندهٔ فعال داشته باشند پیوند رد می‌شود تا قاعدهٔ یک پروندهٔ فعال دور زده نشود. اگر primary نسخهٔ ۱ ثبت‌شده وجود نداشته باشد، پروندهٔ فعال یا جدیدترین پروندهٔ تبدیل‌شدهٔ مهمان به primary قابل‌ادامه تبدیل می‌شود.

مقادیر اصلی `actor_id` مهمان تغییر نمی‌کنند و رکورد تبدیل digest مهمان، actor اصلی مهمان، شمارهٔ قبلی پرونده، proof و زمان تبدیل را نگه می‌دارد. normalize پیام، actor مهمان حفظ‌شده و actor ثبت‌شدهٔ Chat را هر دو نویسندهٔ مشتری می‌شناسد؛ بنابراین پیام پیش از پیوند به پیام agent تبدیل نمی‌شود. تکرار همان تبدیل تکمیل‌شده، تعداد تبدیل‌شدهٔ قبلی را برمی‌گرداند. digest یکتای مهمان و digestهای proof/idempotency جلوی تبدیل متعارض را می‌گیرند. مسیر از نام، ایمیل، تلفن یا متن پیام هویت استنباط نمی‌کند.

## جداسازی، سازگاری و خطاها

هر عملیات پرونده، پیام، replay و پیوند به هویت پشتیبانی احرازشده محدود است. شناسهٔ کاربر دیگر دسترسی نمی‌دهد. تعارض پروندهٔ فعال، وضعیت نامعتبر بازگشایی، عدم تطابق idempotency یا تعارض پیوند مهمان با خطای محدود و بدون افشای پروندهٔ دیگر پاسخ می‌گیرد.

این قرارداد افزایشی است: `/support/v1/*` را حذف نکنید، قرارداد cookie/bootstrap آن را تغییر ندهید و ترافیک مرورگر نسخهٔ ۲ را به login بومی Chat هدایت نکنید. اتصال widget مستقرشدهٔ وب به current/history/reopen و آزمایش از proxy واقعی همچنان اعتبارسنجی استقرار است.

نمونه‌های چرخه و تعارض در [`fixtures/chat-sprint4-v1/support-lifecycle-v2.json`](../../platform/fixtures/chat-sprint4-v1/support-lifecycle-v2.json) هستند.

