# تحویل Sprint 2.5 در Owj Chat

تاریخ تصویر وضعیت: ۲۰۲۶-۱۱-۲۱. مخزن/سرویس: Owj Chat (`chatamlak`).

## نتیجه یکپارچه‌سازی

**پذیرش محلی پاس شد — rollout تولید همچنان بسته است.** stack مشترک و مصنوعی Web+Chat در Docker flow اصلی visitor ناشناس → conversation پشتیبانی → reply کارشناس → دریافت مشتری و همچنین registered، revocation، isolation، realtime و restart مستقل را پاس کرد. browser automation، window واقعی rotation با کلید قبلی، migration/deployment تولید و پذیرش capacity باز هستند.

هیچ VPS، database، conversation، DNS، Nginx، image registry، migration، deploy، commit یا push تولیدی لمس نشد. feature flag سورس همچنان پیش‌فرض `OWJ_SUPPORT_ENABLED=false` است.

## مالکیت و محدوده

Web مرجع user ID، احراز انسان، وضعیت حساب، role کلی، فعال‌بودن agency/consultant، صدور RS256، JWKS و guest است. Chat مالک conversation پشتیبانی، support session، message، history، acknowledgement/idempotency، assignment و WebSocket/SSE بومی است.

Chat collectionهای Web را نمی‌خواند یا نمی‌نویسد. Web باید API احرازشده Chat را استفاده کند و model آن را import نکند. Analytics و CRM تغییر نکردند.

## دفتر milestoneهای Sprint 2.5

| milestone | وضعیت سورس/تست | gate باقی‌مانده |
|---|---|---|
| CHAT-S2.5-01 interoperability هویت | JWKS/assertion سرویس Web درحال اجرا با policy سخت‌گیرانه RS256 پذیرفته شد | token واقعی با کلید قبلی/window rotation در دسترس نبود |
| CHAT-S2.5-02 bootstrap | bootstrap واقعی HMAC وب و recovery همان گفتگو با JTI تازه پاس شد | browser automation باز است |
| CHAT-S2.5-03 status جاری Web | Web هم‌راستا پاسخ دقیق `{subject,role,support,cache}` داد و revocation session موجود را رد کرد | variantهای باقیمانده status در contract test پوشش دارند و همه در Docker mutate نشدند |
| CHAT-S2.5-04 مهمان | bootstrap، session، message/history، isolation مهمان دوم، WS/SSE و logout پاس شد | expiry/reconnect طولانی در browser باز است |
| CHAT-S2.5-05 پیام | send جدید/تکراری/conflict، history و ماندگاری restart از proxy پاس شد | widget automation باز است |
| CHAT-S2.5-06 realtime بومی | resume بومی WS و replay/Origin نوع SSE از Nginx پاس شد؛ Socket.IO وجود ندارد | Chromium/Firefox automation و reconnect طولانی باز است |
| CHAT-S2.5-07 staff | bootstrap واقعی staff، مشاهده queue، assignment و reply پاس شد | dashboard کامل staff لازم نبود و اجرا نشد |
| CHAT-S2.5-08 Docker محلی | stack Web/Chat/Mongo/Nginx و stop/start مستقل Chat با حفظ volume پاس شد | TLS شبیه تولید/پذیرش منابع باز است |
| CHAT-S2.5-09 reliability | تست Mongo واقعی recovery کار media با client/runner تازه، stale lease، سقف retry و dedupe را ثابت می‌کند | interruption کامل Docker worker/FFmpeg و browser suite pending است |
| CHAT-S2.5-10 flow پلتفرم | flow مهمان، registered، revocation، isolation، reply کارشناس، proxy و restart Chat با داده مصنوعی محلی پاس شد | rollout تولید مجاز نیست |

Sprint 2.5 در revision ثبت‌شده به‌شکل محلی integrated است. تا وقتی gateهای browser، rotation، migration/rollback، منابع و TLS شبیه تولید باز هستند، production-ready نیست.

## قرارداد frozen وضعیت هویت

Chat فراخوانی می‌کند:

```http
POST /api/internal/v1/identity/status
Authorization: Bearer <OWJ_CHAT_TO_WEB_SERVICE_TOKEN>
X-Owj-Service: ouj-chat
X-Correlation-Id: <request-id>
Content-Type: application/json
```

درخواست:

```json
{
  "subject": "507f1f77bcf86cd799439011",
  "tokenIssuedAt": 1795161600,
  "jti": "fixture-registered-jti-1"
}
```

پاسخ موفق:

```json
{
  "version": 1,
  "subject": "507f1f77bcf86cd799439011",
  "status": "active",
  "role": "user",
  "support": { "allowed": true, "staff": false },
  "authorizationCacheMaxAgeSeconds": 60,
  "checkedAt": "2026-11-20T08:00:00.000Z",
  "requestId": "fixture-chat-correlation-1"
}
```

هر دو service value جهت‌دار—`OWJ_WEB_TO_CHAT_SERVICE_SECRET` برای HMAC ورودی و `OWJ_CHAT_TO_WEB_SERVICE_TOKEN` برای Bearer خروجی—باید مستقل و حداقل ۳۲ کاراکتر باشند.

cache معمول authorization هرگز بیش از ۶۰ ثانیه نیست. concurrency پیش‌فرض status برابر ۱۶ و سقف runtime برابر ۶۴ است. بررسی همسان concurrent یک درخواست in-flight مشترک دارد. bootstrap و reply، assign و resolve کارشناس cache را bypass می‌کنند. رد role برای حساب active فقط agent sessionها را revoke می‌کند و نباید customer session همان subject را ببندد.

## سازگاری support session

session جدید registered/agent متادیتای assertion تأییدشده را در دو فیلد افزایشی اختیاری ذخیره می‌کند:

- `identity_issued_at` — تبدیل `iat` assertion به Unix seconds؛
- `bootstrap_jti` — شناسه یک‌بارمصرف تأییدشده assertion.

schema این دو را required نکرده است؛ پس سندهای session موجود migration مخرب لازم ندارند. guest قدیمی بدون آن‌ها ادامه می‌دهد. session نوع registered/agent که یکی را ندارد fail closed می‌شود و باید re-bootstrap شود. Chat assertion reference را حدس یا backfill نمی‌کند.

credential مرورگر همان `owj_support_sid` با `HttpOnly`، `SameSite=Lax`، `Path=/support/v1` و روی HTTPS با `Secure` است. route مرورگر، WS و SSE فقط cookie را قبول می‌کنند؛ Bearer و query credential ممنوع‌اند.

## قرارداد recovery در bootstrap

Web درخواست `POST /internal/v1/support/bootstrap` را با headerهای HMAC-SHA256 دارای timestamp/nonce امضا و `Idempotency-Key` ارسال می‌کند. در نتیجه مبهم می‌تواند یک بار با همان key/identity منطقی ولی nonce/signature تازه و assertion/JTI تازه retry کند.

retry همان گفتگوی منطقی را resume می‌کند. plaintext credential لازم نیست یکسان باشد؛ Chat فقط digest ذخیره می‌کند و می‌تواند session مجاز تازه بدهد. replay assertion اول همچنان ممنوع است.

## قرارداد message و realtime

فرمان message:

```json
{ "body": "Hello", "clientRequestId": "unique-request-id" }
```

acknowledgement:

```json
{
  "version": 1,
  "conversationId": "uuid",
  "messageId": "uuid",
  "deduped": false
}
```

write جدید `201`، retry دقیق `200` با همان message ID و `deduped:true`، و همان key با body دیگر `409 SUPPORT_IDEMPOTENCY_CONFLICT` می‌دهد. history رکورد امن `{id,body,authorKind,createdAt,editedAt,files}` را در ترتیب زمانی صفحه و cursor opaque برمی‌گرداند.

realtime پشتیبانی همان WS بومی `/support/v1/ws` و SSE در `/support/v1/events` است. event نوع `chat_message` فقط hintهای conversation/message/user/actor/cursor/event/timestamp دارد و body خصوصی ندارد. history HTTP مرجع است. consumer با `eventId` و سپس cursor dedupe، حداکثر ۲۰۰ event ماندگار را page و روی `gap:true` state را از HTTP refetch می‌کند.

## قرارداد machine-readable

manifest fixture مرجع:

`docs/platform/fixtures/support-v1/manifest.json`

فایل‌های آن:

- `assertion-policies.json`؛
- `bootstrap-hmac.json`؛
- `bootstrap-recovery.json`؛
- `cookie.json`؛
- `identity-status.json`؛
- `messages.json`؛
- `realtime.json`.

همه synthetic هستند و credential تولید یا private signing key ندارند. active key/assertion واقعی Web محلی verify شد؛ token واقعی امضاشده با کلید قبلی در دسترس نبود.

## پذیرش واقعی Web+Chat در محیط محلی

Image درحال‌اجرا ابتدا route قدیمی status را داشت و `400 IDENTITY_REFERENCE_INVALID` برگرداند. Chat سخت‌گیر باقی ماند. پس از rebuild Image وب از سورس هم‌راستا، درخواست مستقیم Chat به Web با `X-Owj-Service: ouj-chat` پاسخ HTTP 200 با subject تخت دقیق، role حروف‌کوچک `admin`، هر دو boolean پشتیبانی، cache برابر ۶۰ ثانیه، timestamp و correlation ID بازتاب‌شده گرفت.

stack مشترک سپس نتایج مصنوعی زیر را تولید کرد:

- Guest A: وب assertion واقعی مهمان را صادر کرد، Chat گفتگوی `11a70796-3105-4d53-bd65-249f6e1b85ad` را ساخت، ایجاد پیام 201، retry دقیق 200/deduped با همان ID، body متفاوت `409 SUPPORT_IDEMPOTENCY_CONFLICT` و history فقط یک نسخه داد.
- recovery مبهم: همان request وب conversation را با `created:false` و session opaque تازه resume کرد.
- isolation: Guest B گفتگوی متفاوت گرفت؛ حتی با ID مهمان A در query اضافه، Chat history خالی خود Guest B را برگرداند.
- realtime: SSE بدون Origin رد شد؛ SSE با Origin مجاز و resume بومی WS، `chat_message` و metadata انتهای replay با `gap:false` دادند. پس از reply کارشناس، SSE مهمان A از cursor مشتری resume شد و event کارشناس را گرفت.
- staff/registered: verifier وب bootstrap کارشناس، مشاهده queue، assignment و reply و نیز bootstrap registered، recovery همان گفتگو و history ماندگار را پاس کرد.
- revocation: تغییر موقت و Web-owned فیلد `authRevokedBefore` باعث شد session موجود registered پاسخ `401 SUPPORT_SESSION_REVOKED` بگیرد؛ fixture اختصاصی بلافاصله restore و active/non-revoked بودن آن تأیید شد.
- restart/logout: Chat متوقف شد درحالی‌که همان container وب سالم و HTTP 200 ماند؛ پس از restart Chat هر دو پیام باقی بودند. logout مهمان B پاسخ 200 داد و cookie قدیمی سپس 401 گرفت.

هیچ سورس Web از این task مربوط به Chat تغییر نکرد؛ Image وب از سورس هم‌راستای هم‌زمان و Web-owned rebuild شد. هیچ سیستم تولید یا volume حذف نشد. prose مخزن همسایه Web هنوز با runtime drift دارد: header وضعیت را به‌جای `X-Owj-Service` واقعی به‌شکل `X-Ouj-Service` می‌نویسد، `SERVICE_AUTH_INVALID` را حذف می‌کند و الزامی‌بودن `X-Request-Id` را بیش از واقع بیان می‌کند. این سندهای Web-owned اینجا تغییر نکردند؛ تا زمان reconcile شدن، consumer باید fixture machine-readable و runtime تست‌شده را دنبال کند.

## شواهد verification

فقط commandهای گزارش‌شده روی سورس Sprint 2.5 در این جدول هستند:

| بررسی | نتیجه |
|---|---|
| command متمرکز قرارداد | **۵۵/۵۵ قبول**: `npm --prefix server exec vitest run test/lib/webIdentityStatusClient.test.js test/lib/supportRuntime.test.js test/lib/supportSessions.test.js test/lib/supportSessionStore.test.js test/db/mongoSupport.test.js test/api/support.test.js test/contracts/supportFixtures.test.js` |
| قرارداد fixture | **۷/۷ قبول** و داخل همان ۵۵ است؛ ۷ تست اضافه نیست |
| suite کامل server | پس از fixture exactness و دو case regression مربوط به live `actorKind` مهمان/registered، **۱۴۱ فایل / ۱٬۲۱۵ تست قبول** شد |
| status client پس از دو تست | **۱۳/۱۳ قبول** |
| API متمرکز پشتیبانی پس از audit envelope زنده | mismatch برای guest و registered ابتدا با test قرمز بازتولید و پس از یکسان‌سازی `actorKind` زنده به `customer`، **۱۸/۱۸ قبول** شد |
| MongoDB واقعی | **۹ فایل / ۵۸ تست قبول**، شامل media job با ۲/۲ و round trip متادیتای support با ۴/۴ |
| Docker مشترک Web+Chat/proxy | با داده مصنوعی محلی **پاس شد**؛ همه سرویس‌ها بعد از restart هدفمند proxy سالم بودند |
| browser WS/SSE/widget | transport بومی از proxy پاس شد؛ **browser automation اجرا نشد** |

آمار قدیمی server/Mongo/worker/client/browser در Sprint 2 baseline تاریخی است، نه مدرک Sprint 2.5. آن را به‌عنوان نتیجه فعلی کپی نکنید.

تست real-Mongo رسانه با metadata synthetic و client/repository/runner تازه ثابت کرد job پذیرفته‌شده پس از reconnect یک بار کامل می‌شود و stale lease با سقف retry بدون job تکراری reclaim می‌شود. این تست interruption بایت/FFmpeg در Docker worker را ثابت نمی‌کند.

## اثر resource، امنیت و migration

- status دارای timeout پیش‌فرض ۳ ثانیه، پاسخ ۳۲ KiB، ۵۰۰۰ cache entry، concurrency پیش‌فرض ۱۶/سقف runtime ۶۴ و coalescing است.
- متادیتای support session فقط دو فیلد کوچک اختیاری اضافه می‌کند؛ rewrite collection لازم نیست.
- force refresh فراخوانی Web را روی action حساس بیشتر می‌کند ولی در hot path history پیام نیست.
- Chat مالکیت پیام خصوصی را حفظ می‌کند و body پیام را به status یا event عمومی نمی‌فرستد.
- Redis، Kafka، Socket.IO، process دوم Mongo یا cross-database write اضافه نشد.
- میزبان مشترک 4-vCPU و حدود 7.8-GiB هنوز قبل از تغییر ceiling تولید به اندازه‌گیری RSS، CPU، event-loop، p95 Mongo، connection، queue و disk نیاز دارد.

## قدم‌های بعدی لازم

1. نسخه Web و Chat مربوط به fixture دقیق status با role حروف‌کوچک و `X-Owj-Service` همگام بماند و consumer contract test روی هر تغییر اجرا شود.
2. token واقعی قبل/بعد از rotation محلی signing key تست شود؛ پذیرش کلید قبلی را فقط از JWKS/unit fixture نتیجه نگیرید.
3. widget در Chromium/Firefox، cookie/proxy روی HTTPS شبیه تولید و سناریوی reconnect/gap طولانی اجرا شود.
4. interruption کامل Docker media-worker/FFmpeg و observation محدود RSS، CPU، event-loop، p95 مونگو، connection، queue و disk اجرا شود.
5. migration identity-link، backup/restore، مالکیت incident و rollback جداگانه بازبینی شود.
6. فقط پس از این gateها rollout آماده شود. Sprint 2.5 مجوز enable تولید یا بازنویسی ID تاریخی Chat نیست.
