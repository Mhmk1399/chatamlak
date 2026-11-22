# قرارداد API پشتیبانی Chat نسخه ۱

وضعیت: **در stack مصنوعی و محلی Web+Chat پیاده‌سازی و پذیرفته شده و پیش‌فرض غیرفعال است** (تصویر Sprint 2.5 در ۲۰۲۶-۱۱-۲۱). این فقط مدرک قرارداد محلی است، نه migration یا deployment تولید، نتیجه capacity یا browser automation.

## مالکیت و مسیریابی

Web مالک هویت مرجع انسان، ورود، وضعیت حساب، نقش کلی، صدور assertion از نوع RS256، JWKS و bootstrap مرورگر است. Chat مالک گفتگوی پشتیبانی، session پشتیبانی، پیام، assignment و realtime بومی است. هیچ سرویس در database سرویس دیگر نمی‌نویسد.

routeهای هدف:

- `POST /internal/v1/support/bootstrap`: فرمان داخلی Web به Chat؛ هرگز برای مرورگر expose نشود.
- `/support/v1/*`: سطح پشتیبانی same-origin مرورگر که به Chat proxy می‌شود.

پشتیبانی Chat تا وقتی `OWJ_SUPPORT_ENABLED=true` نباشد غیرفعال است. routeهای login/register قدیمی Chat، directory کلی، admin، channel، call یا CRM را وارد widget سایت نکنید.

## پیکربندی لازم runtime

با فعال‌شدن پشتیبانی، نبود مقدار معتبر زیر startup را fail-closed می‌کند:

| متغیر | قرارداد |
|---|---|
| `OWJ_WEB_ISSUER` | issuer مطلق و دقیق Web؛ در تولید HTTPS |
| `OWJ_WEB_JWKS_URL` | URL مطلق JWKS؛ در تولید HTTPS |
| `OWJ_WEB_STATUS_URL` | URL مطلق status هویت؛ در تولید HTTPS |
| `OWJ_WEB_TO_CHAT_SERVICE_SECRET` | secret جهت‌دار HMAC برای bootstrap، حداقل **۳۲ کاراکتر** |
| `OWJ_CHAT_TO_WEB_SERVICE_TOKEN` | credential جهت‌دار Bearer برای status، حداقل **۳۲ کاراکتر** |
| `OWJ_SUPPORT_ALLOWED_ORIGINS` | originهای دقیق مرورگر؛ در غیر این صورت `APP_PUBLIC_URL` لازم است |

دو credential جهت‌دار باید متفاوت باشند و نباید signing key وب، `JWT_SECRET`، credential مونگو یا token مرورگر را تکرار کنند. `OWJ_WEB_ALLOW_INSECURE_HTTP=true` فقط بیرون تولید برای local development پذیرفته می‌شود.

حدود current-state:

- cache معمول status حداکثر ۶۰ ثانیه؛
- concurrency پیش‌فرض status برابر ۱۶ و سقف runtime برابر ۶۴؛
- درخواست‌های همسان درحال‌اجرا coalesce می‌شوند؛
- session پشتیبانی به‌طور پیش‌فرض idle برابر ۳۰ دقیقه و absolute برابر ۱۲ ساعت؛
- صفحه پیام حداکثر ۱۰۰ و replay حداکثر ۲۰۰؛
- متن پیام حداکثر ۴۰۰۰ کاراکتر و ۱۶ KiB.

## احراز Web به Chat برای bootstrap

`POST /internal/v1/support/bootstrap` از HMAC-SHA256 با timestamp/nonce استفاده می‌کند، نه Bearer:

```http
X-Ouj-Service-Auth-Version: 1
X-Ouj-Service-Auth-Timestamp: <13-digit Unix milliseconds>
X-Ouj-Service-Auth-Nonce: <16-128 base64url characters>
X-Ouj-Service-Auth-Signature: <lowercase hex HMAC-SHA256>
Idempotency-Key: <1-180 characters>
```

ورودی امضا دقیقاً این متن newline-separated است:

```text
ouj-service-auth-v1
<timestamp>
<nonce>
POST
/internal/v1/support/bootstrap
```

skew پیش‌فرض timestamp پنج دقیقه است. nonce در replay guard حافظه‌ای محدود ده‌دقیقه‌ای مصرف می‌شود. `jti` یکتای assertion تأییدشده در MongoDB ماندگار مصرف می‌شود؛ بنابراین replay بعد از restart Chat نیز رد می‌ماند.

body bootstrap مشتری:

```json
{
  "assertion": "<one-time Web-issued RS256 assertion>",
  "bootstrapType": "customer",
  "locale": "fa-IR",
  "context": {
    "page": "/listing/public-safe-id",
    "publicListingId": "public-token"
  }
}
```

assertion مشتری `support_registered` یا `support_guest` است. bootstrap کارشناس `bootstrapType:"staff"`، نوع `support_agent` و هر دو scope یعنی `support:agent` و `support:conversation:create` را می‌خواهد. context فقط `page`، `locale` و `publicListingId`، با سقف ۲ KiB است و نباید داده CRM/contact/listing خصوصی داشته باشد.

bootstrap برای مشتری ثبت‌شده و agent بررسی Web status را اجباری و بدون cache انجام می‌دهد. پاسخ موفق برای گفتگوی جدید `201` و برای resume برابر `200` است:

```json
{
  "version": 1,
  "conversationId": "11111111-1111-4111-8111-111111111111",
  "supportSessionCredential": "ocs_<opaque-random-value>",
  "expiresAt": "2026-11-21T12:00:00.000Z",
  "created": true,
  "assigned": false,
  "supportAvailable": true
}
```

Chat فقط digest نام‌گذاری‌شده SHA-256 از credential را ذخیره می‌کند. Web باید credential را در cookie زیر بنویسد:

```http
Set-Cookie: owj_support_sid=<credential>; Path=/support/v1; HttpOnly; SameSite=Lax; Secure
```

روی HTTPS، `Secure` الزامی است. endpointهای مرورگر فقط همین cookie را قبول می‌کنند؛ Bearer یا credential در query مجاز نیست.

### بازیابی bootstrap مبهم

Web می‌تواند یک timeout/unavailability مبهم را با شرایط زیر یک بار retry کند:

- همان `Idempotency-Key` منطقی و همان identity؛
- timestamp، nonce و امضای service-auth تازه؛
- assertion تازه Web با `jti` جدید.

retry همان گفتگوی منطقی را resume می‌کند ولی ممکن است plaintext credential تازه بدهد. Chat plaintext قبلی را ذخیره یا replay نمی‌کند. استفاده دوباره assertion قبلی باید به‌عنوان replay شکست بخورد.

## قرارداد frozen وضعیت Chat به Web

مجوز registered/agent از credential اختصاصی Bearer استفاده می‌کند:

```http
POST /api/internal/v1/identity/status
Authorization: Bearer <OWJ_CHAT_TO_WEB_SERVICE_TOKEN>
Content-Type: application/json
X-Owj-Service: ouj-chat
X-Correlation-Id: <request-id>
```

body frozen در Sprint 2.5:

```json
{
  "subject": "507f1f77bcf86cd799439011",
  "tokenIssuedAt": 1795161600,
  "jti": "fixture-registered-jti-1"
}
```

`tokenIssuedAt` و `jti` فقط از assertion تأییدشده RS256 می‌آیند تا Web بتواند زمان صدور را با مرز revocation خود مقایسه کند.

پاسخ موفق باید این شکل باشد:

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

Chat statusهای `active`، `disabled`، `revoked` و `deleted` را می‌پذیرد؛ subject دقیق و role و booleanهای support را بررسی می‌کند و زمان cache وب را به بازه ۰ تا ۶۰ ثانیه و سقف محلی محدود می‌کند. guest هرگز به این endpoint ارسال نمی‌شود. پیکربندی ناقص، timeout، خطای upstream غیرقطعی، payload نامعتبر و cache منقضی fail closed هستند.

بررسی passive session/read/realtime می‌تواند از cache محدود استفاده کند. bootstrap، reply کارشناس، assign و resolve refresh اجباری دارند. رد نقش staff فقط sessionهای `agent` همان subject را revoke می‌کند و session جداگانه customer ثبت‌شده را نمی‌بندد. disabled/revoked/deleted یا رد کلی support مجوز فعال مرتبط را متناسب با وضعیت revoke می‌کند.

### مرجع assertion ذخیره‌شده

session جدید registered/agent دو فیلد اختیاری افزایشی دارد:

- `identity_issued_at`: مقدار `iat` assertion تأییدشده به Unix seconds؛
- `bootstrap_jti`: مقدار `jti` assertion تأییدشده.

validator مونگو این فیلدها را مجاز ولی اجباری نمی‌کند؛ بنابراین migration مخرب یا بازنویسی تاریخی لازم نیست. session مهمان قدیمی بدون آن‌ها معتبر می‌ماند. session غیرمهمان قدیمی که یکی از این دو را ندارد در current-state authorization fail closed می‌شود و باید با assertion/session تازه re-bootstrap شود.

## API مشتری در مرورگر

### `GET /support/v1/session`

فقط state widget شامل `version`، `conversationId`، `status`، `identityKind`، `allowedActions`، `expiresAt` و `supportAvailable` برمی‌گردد. Web subject، Chat actor ID، role، token digest یا فیلد admin برنمی‌گردد.

### `GET /support/v1/messages?cursor=<base64url>&limit=50`

conversation از session می‌آید. cursor، JSON base64url مات روی قدیمی‌ترین `{id,createdAt}` برگشتی است:

```json
{
  "version": 1,
  "conversationId": "uuid",
  "messages": [
    {
      "id": "uuid",
      "body": "Hello",
      "authorKind": "customer",
      "createdAt": "ISO-8601",
      "editedAt": null,
      "files": []
    }
  ],
  "nextCursor": null,
  "hasMore": false
}
```

### `POST /support/v1/messages`

schema درخواست دقیق است:

```json
{ "body": "Hello", "clientRequestId": "unique-request-id" }
```

conversation در body پذیرفته نمی‌شود. `clientRequestId` بین ۱ تا ۱۲۰ کاراکتر از `[A-Za-z0-9._:-]` است. repository موجود Chat idempotency را به `(conversation, actor, clientRequestId)` متصل می‌کند:

- persistence جدید: HTTP `201` و `deduped:false`؛
- retry دقیق: HTTP `200`، همان `messageId` و `deduped:true`؛
- همان key با body متفاوت: HTTP `409 SUPPORT_IDEMPOTENCY_CONFLICT`.

```json
{
  "version": 1,
  "conversationId": "uuid",
  "messageId": "uuid",
  "deduped": false
}
```

پیام و hint ماندگار event journal در همان transaction مونگو نوشته می‌شوند. history HTTP مرجع body/file است و notification realtime عمداً body ندارد.

### realtime و logout

- WebSocket بومی: `/support/v1/ws`.
- SSE: `/support/v1/events`.
- logout: `POST /support/v1/logout` session را محلی revoke، stream شناخته‌شده را قطع و فقط `owj_support_sid` را پاک می‌کند؛ حتی با unavailable بودن Web کار می‌کند.

[پروتکل realtime نسخه ۱](./CHAT_REALTIME_PROTOCOL_V1.md) را ببینید.

## API کارشناس

هر route کارشناس به `actorKind:"agent"`، scope برابر `support:agent`، link فعال، مجوز جاری staff در Web و action مرتبط session نیاز دارد.

| روش/path | قرارداد |
|---|---|
| `GET /support/v1/staff/conversations?status=...` | لیست محدود available/assigned/open/resolved/closed |
| `GET /support/v1/staff/conversations/:conversationId` | فقط agent assigned همراه membership در Chat |
| `POST .../:conversationId/assign` | `Idempotency-Key`، status refresh اجباری و یک winner تراکنشی |
| `POST .../:conversationId/reply` | schema دقیق پیام، refresh اجباری و فقط حالت assigned |
| `POST .../:conversationId/resolve` | `Idempotency-Key`، refresh اجباری و transition به `resolved` یا `closed` |

Chat فقط backend را پیاده می‌کند؛ به agent پنل admin Chat نمی‌دهد و UI staff تازه اضافه نمی‌کند.

## خطاها و fixtureهای machine-readable

خطای HTTP بسته‌بندی‌شده:

```json
{
  "error": {
    "code": "SUPPORT_REQUEST_INVALID",
    "message": "Safe text",
    "requestId": "request-or-generated-id"
  }
}
```

statusهای نماینده: 400 ورودی نامعتبر، 401 session یا service auth غایب/منقضی، 403 رد scope/conversation/staff، 409 conflict idempotency/assignment/lifecycle، 426 درخواست HTTP عادی روی WS، 429 limit و 503 provider لازمِ unavailable. credential و متن خصوصی پیام نباید در log/error بیاید.

manifest fixture مرجع Chat:

`docs/platform/fixtures/support-v1/manifest.json`

این مسیر assertion policy، HMAC، recovery، cookie، status، message و realtime را پوشش می‌دهد. fixtureها synthetic هستند و secret تولید یا private signing key ندارند.

## پذیرش محلی بین‌مخزنی — ۲۰۲۶-۱۱-۲۱

اولین درخواست به Image قدیمی Web پاسخ قدیمی `400 IDENTITY_REFERENCE_INVALID` داد. سپس Web از سورس هم‌راستا rebuild شد؛ Chat بدنه frozen یعنی `{subject,tokenIssuedAt,jti}` را با credential اختصاصی Bearer فرستاد و HTTP 200 با subject تخت، policy فعال role/support، دستور cache برابر ۶۰ ثانیه، timestamp و correlation ID بازتاب‌شده گرفت. Chat هیچ fallback قدیمی اضافه نکرد.

stack ایزوله Docker مشترک سپس flowهای مصنوعی زیر را پاس کرد:

- assertion واقعی guest وب و bootstrap نوع HMAC، cookie محدود `owj_support_sid`، conversation/message/history، retry همان گفتگو با `created:false`، dedupe retry دقیق و conflict نوع `409` برای body متفاوت؛
- جداسازی Guest B حتی وقتی conversation ID مربوط به Guest A به‌عنوان query اضافه ارسال شد؛
- bootstrap کارشناس، مشاهده queue، assignment و reply؛ bootstrap registered، recovery همان گفتگو و history ماندگار؛
- تغییر موقت و Web-owned فیلد `authRevokedBefore` باعث شد session موجود registered در Chat پاسخ `401 SUPPORT_SESSION_REVOKED` بگیرد؛ fixture مصنوعی بلافاصله restore شد؛
- logout پاسخ 200 داد و cookie قدیمی guest سپس 401 گرفت.

این نتیجه blocker قرارداد status در Sprint 2.5 را برای revision محلی تست‌شده می‌بندد. این مدرک production readiness، rotation واقعی کلید تولید، browser automation واقعی، deployment، migration یا ظرفیت اندازه‌گیری‌شده نیست.
