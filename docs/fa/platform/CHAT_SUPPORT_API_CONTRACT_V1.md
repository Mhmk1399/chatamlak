# قرارداد API پشتیبانی Chat نسخه ۱

وضعیت: **در کد منبع پیاده‌سازی شده، به‌صورت پیش‌فرض غیرفعال است و Deploy نشده است** (Sprint 2، تاریخ 2026-11-20). این قرارداد پوشش تست محلی با Mock و Mongo واقعی دارد، اما سرویس واقعی Owj Web هنوز همراه Chat تست نشده است.

## مدل اعتماد و مسیریابی

Web مرجع عمومی هویت و BFF روبه‌مرورگر است. Chat مالک گفتگوهای پشتیبانی، پیام‌ها، تخصیص، نشست‌های پشتیبانی و مجوزدهی بلادرنگ است. Chat هرگز Collectionهای Web را نمی‌خواند.

Reverse Proxy فقط باید این مسیرهای یکپارچه‌سازی را برای وب‌سایت در دسترس بگذارد:

- `POST /internal/v1/support/bootstrap` — فقط Backend-to-Backend؛ هرگز در دسترس مرورگر نباشد.
- `/support/v1/*` — سطح پشتیبانی Same-Origin در مرورگر.

مسیرهای قدیمی `/api/login` و `/api/register`، فهرست سراسری Chat، Admin، تماس‌ها، Channelها یا مسیرهای CRM را به Widget وب‌سایت Proxy نکنید.

پاسخ‌های موفق JSON پشتیبانی شامل `version: 1` هستند. خطاهای HTTP که با Wrapper پردازش می‌شوند از Envelope پایدار و بدون Version زیر استفاده می‌کنند:

```json
{
  "error": {
    "code": "SUPPORT_REQUEST_INVALID",
    "message": "The support request is invalid.",
    "requestId": "request-or-generated-uuid"
  }
}
```

Server یک `X-Request-Id` محدودشده را می‌پذیرد و بازمی‌گرداند؛ در غیر این صورت یک شناسه می‌سازد. پاسخ مستقیم HTTP عادی روی `/support/v1/ws` یک استثنای مستند است: Object خطای 426 آن `code` و `message` دارد اما `requestId` ندارد؛ رد Upgrade بومی نیز متن ساده HTTP است. Credentialها، بدنه Assertion، متن پیام و Queryهای Presigned نباید Log شوند.

## فعال‌سازی و Environment

پشتیبانی تا وقتی `OWJ_SUPPORT_ENABLED=true` نباشد Inert است. هنگام فعال‌سازی، Startup بدون مقادیر معتبر زیر به‌صورت Fail Closed متوقف می‌شود:

| Variable | قرارداد |
|---|---|
| `OWJ_WEB_ISSUER` | Issuer مطلق و دقیق Web؛ در Production از HTTPS |
| `OWJ_WEB_JWKS_URL` | URL مطلق JWKS؛ در Production از HTTPS |
| `OWJ_WEB_STATUS_URL` | URL مطلق Identity Status؛ در Production از HTTPS |
| `OWJ_WEB_TO_CHAT_SERVICE_SECRET` | Secret جهت‌دار HMAC ورودی، حداقل ۳۲ کاراکتر |
| `OWJ_CHAT_TO_WEB_SERVICE_TOKEN` | Credential جهت‌دار Bearer خروجی، حداقل ۱۶ کاراکتر |
| `OWJ_SUPPORT_ALLOWED_ORIGINS` | Originهای دقیق مرورگر با جداکننده Comma؛ Fallback آن `APP_PUBLIC_URL` است، اما یکی از این دو الزامی است |

`OWJ_WEB_ALLOW_INSECURE_HTTP=true` فقط خارج از Production و برای توسعه محلی، Endpoint/Origin مبتنی بر HTTP را مجاز می‌کند. آن را هرگز در Production فعال نکنید.

Boundهای عملیاتی با `OWJ_IDENTITY_STATUS_CACHE_MS` (سقف سخت ۶۰ ثانیه)، `SUPPORT_SESSION_IDLE_TIMEOUT_MS`، `SUPPORT_SESSION_ABSOLUTE_TIMEOUT_MS`، `SUPPORT_REALTIME_REVALIDATE_MS`، `SUPPORT_REALTIME_MAX_REPLAY`، `SUPPORT_MAX_CONNECTIONS_PER_SESSION`، `SUPPORT_WS_MAX_CONNECTIONS_PER_IP` و `SUPPORT_BOOTSTRAP_RATE_LIMIT` قابل پیکربندی‌اند. `WS_TRUST_PROXY` بر استخراج IP قابل اعتماد Client اثر دارد و باید با Topology کنترل‌شده Proxy منطبق باشد.

## احراز هویت سرویس Web به Chat

Bootstrap از `OWJ_WEB_TO_CHAT_SERVICE_SECRET` اختصاصی (حداقل ۳۲ کاراکتر در Runtime) استفاده می‌کند، نه کلید امضای JWT متعلق به Web. Web چهار Header زیر را ارسال می‌کند:

```http
X-Ouj-Service-Auth-Version: 1
X-Ouj-Service-Auth-Timestamp: <13-digit Unix milliseconds>
X-Ouj-Service-Auth-Nonce: <16-128 base64url characters>
X-Ouj-Service-Auth-Signature: <lowercase hex HMAC-SHA256>
```

ورودی HMAC دقیقاً این متن جداشده با Newline است:

```text
ouj-service-auth-v1
<timestamp>
<nonce>
POST
/internal/v1/support/bootstrap
```

اختلاف Timestamp محدود است (پیش‌فرض پنج دقیقه). Nonceها در یک Replay Cache درون‌پردازه‌ای، محدود و ۱۰ دقیقه‌ای نگه داشته می‌شوند. Restart شدن Chat این Cache مربوط به Nonce سرویس را پاک می‌کند، اما `jti` یکتای پایدار در Assertion امضاشده همچنان Replay کردن Bootstrap میان Restartها را متوقف می‌کند. Service Auth گم‌شده یا نامعتبر خطای `SUPPORT_SERVICE_UNAUTHORIZED` می‌دهد.

## Bootstrap

`POST /internal/v1/support/bootstrap`

Headerهای الزامی: Headerهای Service Auth، مقدار `Content-Type: application/json` و `Idempotency-Key` با طول ۱ تا ۱۸۰ کاراکتر. پیاده‌سازی برای سازگاری `body.idempotencyKey` را نیز به‌عنوان Fallback می‌پذیرد، اما Web باید از Header استفاده کند. Assertion حداکثر 16 KiB است. خود Assertion وب یک‌بارمصرف است؛ برای Retry پس از نتیجه مبهم باید یک Assertion جدید با همان Subject وب گرفته شود. یکتایی هویت گفتگو باعث می‌شود این Retry همان گفتگو را ادامه دهد؛ پیاده‌سازی فعلی Credential مبهم نشست قبلی را بر اساس Idempotency Key دوباره بازنمی‌گرداند.

درخواست مشتری:

```json
{
  "assertion": "<one-time RS256 JWT>",
  "bootstrapType": "customer",
  "locale": "fa-IR",
  "context": {
    "page": "/listing/public-safe-id",
    "publicListingId": "public-token"
  }
}
```

مقدار پیش‌فرض `bootstrapType` برابر `customer` است. Assertion مشتری فقط می‌تواند `support_registered` یا `support_guest` باشد و به `support:conversation:create` نیاز دارد. Context دارای Allowlist (`page`، `locale` و `publicListingId`) است، در JSON حداکثر 2 KiB دارد و محدودیت مؤثر آن برای `page` برابر ۳۰۰ کاراکتر و برای دو فیلد دیگر برابر ۱۲۰ کاراکتر است. `locale` سطح بالا تا ۳۵ کاراکتر پذیرفته می‌شود، اما Persistence فعلی حداکثر ۲۴ کاراکتر را نگه می‌دارد؛ بنابراین Web باید بیش از ۲۴ کاراکتر نفرستد. داده CRM، مشتری یا اطلاعات تماس را ارسال نکنید.

درخواست Staff از `"bootstrapType":"staff"`، مقدار `token_use:"support_agent"` و هر دو Scope یعنی `support:agent` و `support:conversation:create` استفاده می‌کند. Staff همچنین باید پیوند صریح و فعال Web↔Chat داشته باشد و بررسی وضعیت جاری Web را با موفقیت بگذراند.

پاسخ (`201` برای ایجاد و `200` برای ادامه):

```json
{
  "version": 1,
  "conversationId": "chat-conversation-uuid",
  "supportSessionCredential": "ocs_<opaque-random-value>",
  "expiresAt": "2026-11-21T12:00:00.000Z",
  "created": true,
  "assigned": false,
  "supportAvailable": true
}
```

پاسخ Bootstrap دارای `Cache-Control: private, no-store` است. فقط Backend احرازهویت‌شده Web این Credential مات را دریافت می‌کند. Issuer فعلی از ۳۲ Byte تصادفی استفاده می‌کند (`ocs_` به‌علاوه ۴۳ کاراکتر base64url). Chat فقط Digest نوع SHA-256 و متصل به Namespace آن را ذخیره می‌کند و مقدار خام را نگه نمی‌دارد. Web باید آن را در Cookie هم‌مبدأ قرار دهد:

```http
Set-Cookie: owj_support_sid=<credential>; Path=/support/v1; HttpOnly; SameSite=Lax; Secure
```

روی HTTPS از `Secure` استفاده کنید و زمان انقضای Cookie نباید دیرتر از `expiresAt` باشد. درخواست‌های API و Realtime مرورگر فقط این Cookie را می‌پذیرند؛ Credential نوع Bearer یا Query پشتیبانی نمی‌شود.

محدودیت‌های پیش‌فرض نشست پشتیبانی شامل ۳۰ دقیقه Idle و ۱۲ ساعت Absolute است (`SUPPORT_SESSION_IDLE_TIMEOUT_MS` و `SUPPORT_SESSION_ABSOLUTE_TIMEOUT_MS`). هر نشست فقط Actionهای صریح مشتری (`read`، `send`، `events` و `logout`) یا Actionهای Staff (به‌علاوه `staff:list`، `staff:assign` و `staff:resolve`) را دارد. این یک نشست قدیمی Chat نیست.

## API مشتری در مرورگر

### `GET /support/v1/session`

فقط وضعیت Widget را بازمی‌گرداند:

```json
{
  "version": 1,
  "conversationId": "uuid",
  "status": "active",
  "identityKind": "guest",
  "allowedActions": ["read", "send", "events", "logout"],
  "expiresAt": "ISO-8601",
  "supportAvailable": true
}
```

این پاسخ هرگز UUID مربوط به Actor در Chat، Subject وب، Digest توکن، Role یا فیلدهای Admin را بازنمی‌گرداند.

### `GET /support/v1/messages?cursor=<base64url>&limit=50`

گفتگو از نشست پشتیبانی به‌دست می‌آید و Caller نمی‌تواند آن را انتخاب کند. مقدار پیش‌فرض `limit` برابر ۵۰ و سقف آن ۱۰۰ است. Cursor مات، JSON نوع Base64URL شامل قدیمی‌ترین `{ "id", "createdAt" }` برگشتی است. پیام‌ها در هر صفحه به ترتیب زمانی هستند:

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

ورودی‌های File فقط فیلدهای عمومی محدود و URLهای محافظت‌شده Chat را ارائه می‌کنند. نسخه ۱ هیچ Mutation مربوط به Upload در Widget پشتیبانی ندارد؛ ساخت پیام فقط متنی است، هرچند Attachmentهای تاریخی/بومی Chat در Read قابل نمایش‌اند.

### `POST /support/v1/messages`

```json
{ "body": "bounded text", "clientRequestId": "widget-request-uuid" }
```

متن الزامی است و سقف آن ۴٬۰۰۰ کاراکتر/16 KiB است. `clientRequestId` باید ۱ تا ۱۲۰ کاراکتر از مجموعه `[A-Za-z0-9._:-]` باشد. Chat گفتگوی متصل به نشست و Lifecycle باز/تخصیص‌یافته را بررسی می‌کند، سپس Repository تراکنشی و Idempotent موجود پیام را فراخوانی می‌کند. برای Retry درخواست دقیقاً یکسان، از همان شناسه استفاده کنید.

Idempotency پیام به `(conversation, actor, clientRequestId)` متصل است. Retry دقیقاً یکسان، پیام ذخیره‌شده اول را با HTTP 200 و `deduped:true` برمی‌گرداند. استفاده دوباره از همان Key با Body متفاوت خطای `409 SUPPORT_IDEMPOTENCY_CONFLICT` می‌دهد و هرگز پیام اول را جایگزین نمی‌کند. Client باید برای هر پیام عمدی یک Key تازه بسازد.

```json
{
  "version": 1,
  "conversationId": "uuid",
  "messageId": "uuid",
  "deduped": false
}
```

ذخیره جدید `201` و Retry شناسایی‌شده به‌عنوان تکراری `200` برمی‌گرداند. پیام و رکورد Journal پایدار در یک Transaction مشترک‌اند؛ Broadcast زنده، ورودی دوم Journal ایجاد نمی‌کند.

### `GET /support/v1/events` و `GET /support/v1/ws`

قراردادهای SSE و WebSocket بومی در [پروتکل بلادرنگ نسخه ۱](./CHAT_REALTIME_PROTOCOL_V1.md) تعریف شده‌اند. درخواست عادی HTTP GET به مسیر WS پاسخ `426 SUPPORT_WEBSOCKET_UPGRADE_REQUIRED` می‌گیرد.

### `POST /support/v1/logout`

نشست محلی پشتیبانی را لغو می‌کند، Streamهای شناخته‌شده را قطع می‌کند، فقط `owj_support_sid` را پاک می‌کند و `{ "version":1, "ok":true }` بازمی‌گرداند. Logout حتی هنگام در دسترس نبودن وضعیت Web یا منقضی‌شدن نشست، همچنان به‌صورت محلی قابل استفاده است.

## API کارکنان پشتیبانی

همه مسیرهای Staff به `actorKind:"agent"`، Scope نوع `support:agent`، پیوند فعال Web↔Chat/وضعیت جاری Web و Action مربوطه در نشست پشتیبانی نیاز دارند.

| Method/Path | رفتار |
|---|---|
| `GET /support/v1/staff/conversations?status=available|assigned|open|resolved|closed&limit=` | وضعیت Available/Open یعنی بدون تخصیص؛ Assigned/Resolved/Closed به Agent جاری محدود است. اندازه صفحه حداکثر ۱۰۰. |
| `GET /support/v1/staff/conversations/:conversationId?cursor=&limit=` | فقط Agent تخصیص‌یافته که عضو Chat نیز هست می‌تواند بخواند؛ پیام‌ها از Schema ایمن Customer/Agent استفاده می‌کنند. |
| `POST /support/v1/staff/conversations/:conversationId/assign` | به `Idempotency-Key` نیاز دارد؛ یک Transaction در Mongo، Claim اتمی تخصیص را با عضویت Chat همراه می‌کند. فقط یک Agent برنده می‌شود و کار Resolved/Closed هرگز باز نمی‌شود. |
| `POST /support/v1/staff/conversations/:conversationId/reply` | همان Schema متن/Idempotency؛ فقط وقتی Status برابر `assigned` است مجاز است. |
| `POST /support/v1/staff/conversations/:conversationId/resolve` | به `Idempotency-Key` نیاز دارد؛ بدنه `{ "resolution":"resolved" }` یا `closed`؛ فقط Agent تخصیص‌یافته. Transitionهای مجاز assigned→resolved/closed و resolved→closed هستند. |

Keyهای Command کارکنان فقط به‌صورت Digest ذخیره می‌شوند. تکرار Assignment/Transition وضعیت، State مرجع جاری را برمی‌گرداند و Event بلادرنگ دیگری منتشر نمی‌کند. استفاده دوباره از Key مربوط به Resolution برای Outcome متفاوت خطای `409 SUPPORT_IDEMPOTENCY_CONFLICT` می‌دهد؛ Transition نامعتبر یا هم‌زمان Lifecycle یک Conflict پایدار 409 برمی‌گرداند.

پیاده‌سازی فقط Routeهای Backend را فراهم می‌کند؛ Frontend جدید Staff اضافه نمی‌کند و Admin Panel مربوط به Chat را به Agentها نمی‌دهد.

## قواعد مجوزدهی و وضعیت جاری

- نشست ثبت‌شده به هویت دقیق گفتگو، پیوند فعال، عضویت جاری، حساب فعال Chat و وضعیت Web نیاز دارد.
- نشست مهمان، Subject مهمان Web را به‌شکل Digestشده دقیقاً با یک گفتگوی پشتیبانی مقایسه می‌کند. مهمان‌ها در `users` درج نمی‌شوند و به APIهای قدیمی/سراسری دسترسی ندارند.
- تخصیص Agent و عضویت به‌صورت Transactional به هم متصل‌اند. خواندن/پاسخ‌دادن علاوه بر آن به تخصیص جاری و عضویت Chat نیاز دارد.
- وضعیت Web برای هر Operation حداکثر ۶۰ ثانیه Cache می‌شود. پس از Stale شدن، قطعی Web عملیات ثبت‌شده/Agent را Fail Closed می‌کند؛ عملیات مهمان محلی باقی می‌ماند.
- گفتگوهای Resolved/Closed برای Agent تخصیص‌یافته قابل خواندن باقی می‌مانند، اما ارسال مشتری/Staff متوقف می‌شود. Bootstrap بعدی همان گفتگوی بسته را با `supportAvailable:false` ادامه می‌دهد؛ ساخت Case دوم یا Reopen هنوز پیاده‌سازی نشده است.
- نشست‌های منقضی/لغوشده رد می‌شوند و به‌صورت دوره‌ای پاک‌سازی می‌گردند؛ اتصال‌های باز Realtime به‌طور مستقل دوباره اعتبارسنجی می‌شوند.

## خانواده‌های پایدار خطا

| HTTP | کد نمونه | معنی |
|---:|---|---|
| 400 | `SUPPORT_REQUEST_INVALID` | فیلد، Cursor، Context یا UUID گفتگو نامعتبر/بیش از حد |
| 401 | `SUPPORT_SERVICE_UNAUTHORIZED` | احراز هویت سرویس Web→Chat نامعتبر |
| 401 | `SUPPORT_SESSION_REQUIRED` | Cookie پشتیبانی گم‌شده/بدساخت/ناشناخته |
| 401 | `SUPPORT_SESSION_EXPIRED` / `SUPPORT_SESSION_REVOKED` | نشست محلی پشتیبانی دیگر فعال نیست |
| 401/403 | `IDENTITY_*` | رد Signature/Claim/Replay/Link/Current-State |
| 403 | `SUPPORT_ACTION_DENIED` | کلاس نشست Action مورد نیاز را ندارد |
| 403 | `SUPPORT_CONVERSATION_DENIED` | گفتگو، Lifecycle، عضویت یا تخصیص مجاز نیست |
| 403 | `SUPPORT_AGENT_REQUIRED` | مشتری مسیر Staff را فراخوانده است |
| 403 | `SUPPORT_SCOPE_DENIED` / `SUPPORT_ORIGIN_DENIED` | کلاس/Scope مربوط به Assertion یا Origin بلادرنگ رد شده |
| 409 | `SUPPORT_IDEMPOTENCY_CONFLICT` / `SUPPORT_ASSIGNMENT_CONFLICT` / `SUPPORT_ASSIGNMENT_CLOSED` / `SUPPORT_RESOLUTION_CONFLICT` | تداخل ورودی Retry، تخصیص یا Lifecycle |
| 426 | `SUPPORT_WEBSOCKET_UPGRADE_REQUIRED` | به‌جای Upgrade بومی WS از درخواست عادی HTTP استفاده شده |
| 429 | `SUPPORT_RATE_LIMITED` / `SUPPORT_CONNECTION_LIMIT` | سقف محدودشده سوءاستفاده/اتصال |
| 500 | `SUPPORT_INTERNAL_ERROR` | Fallback پاک‌سازی‌شده برای خطای پیش‌بینی‌نشده Server |
| 503 | `SUPPORT_PROVIDER_UNAVAILABLE` | Web/Store/Provider الزامی در دسترس نیست؛ Fail Closed |

محدودیت پیش‌فرض HTTP برابر ۳٬۰۰۰ درخواست Bootstrap در هر ۱۵ دقیقه برای هر IP حل‌شده Client (قابل پیکربندی) و ۶۰ نوشتن پیام در دقیقه است. `trust proxy` باید با Topology کنترل‌شده Reverse Proxy مطابقت داشته باشد؛ در غیر این صورت محدودیت‌های مبتنی بر IP می‌توانند گمراه‌کننده باشند.

## وابستگی‌های شناخته‌شده بین Repositoryها

- Issuer/JWKS واقعی نوع RS256 و Fixtureهای Assertion از Web.
- Endpoint واقعی Identity Status و Credential جهت‌دار Chat→Web.
- امضای Headerهای Service Auth ورودی توسط Web BFF و تنظیم Cookie دقیق.
- تست Reverse Proxy برای Cookie Path، Origin، بافرینگ SSE و Upgrade وب‌سوکت.
- Endpointهای تاییدشده Proof برای پیوند حساب و تبدیل مهمان.
- تصمیم محصول و پیاده‌سازی Reopen/ساخت Case جدید پس از Resolution.

تا زمانی که تست‌های واقعی Web+Chat موفق نشده‌اند، این یکپارچه‌سازی را Production-Complete توصیف نکنید.
