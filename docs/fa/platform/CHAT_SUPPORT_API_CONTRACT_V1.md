# قرارداد API پشتیبانی Chat نسخه ۱

وضعیت: **PROPOSED/DORMANT — پیشنهادی/غیرفعال** و **BLOCKED ON WEB — مسدود به‌خاطر Web**. پشتیبانی کاربر ثبت‌شده همچنین **REQUIRES MIGRATION — نیازمند مهاجرت** mapping هویت بازبینی‌شده است. هیچ‌کدام از routeهای `/api/platform/v1/...` زیر در API فعلی Chat وجود ندارد. بر پایه این سند route بدون احراز هویت منتشر نکنید.

## مدل اعتماد

Web نقطه ورود عمومی و مرجع هویت است. Chat مالک گفتگوی پشتیبانی و پیام است. Web BFF یا exchange تصویب‌شده دو مورد ارائه می‌کند:

1. هویت سرویس Web احراز‌شده و least-privilege؛
2. principal کوتاه‌عمر delegated برای کاربر ثبت‌شده یا مهمان آغازکننده.

Chat issuer پیکربندی‌شده، audience برابر `ouj-chat`، scope، expiry و وضعیت subject وب را verify می‌کند. principal ثبت‌شده باید link صریح active از `web_user_id` به `chat_user_id` داشته باشد. principal مهمان باید `support:conversation` و فهرست محدود شامل همان گفتگوی پشتیبانی را داشته باشد. `userId`، role یا مالکیت گفتگوی ارسال‌شده از مرورگر مرجع نیست.

فرمت transport/header، کشف کلید نامتقارن یا BFF exchange، بازه replay، rotation کلید و service scope نیازمند تصویب امنیت Web است. secret متقارن امضای Web داخل Chat تکرار نشود.

## resourceهای پیشنهادی

همه درخواست‌ها JSON و HTTPS و دارای request/correlation ID و برای create/mutation دارای idempotency key پایدار هستند. پاسخ هرگز capability مهمان دیگر یا directory کلی Chat را برنمی‌گرداند.

### ساخت یا ادامه گفتگوی پشتیبانی

`POST /api/platform/v1/support/conversations`

scope لازم: `support:conversation:create`. principal تأییدشده، نه body، بازدیدکننده را مشخص می‌کند.

```json
{
  "requestId": "stable-request-id",
  "idempotencyKey": "web:support:visitor-or-user:request",
  "locale": "fa-IR",
  "context": { "page": "/listing/public-safe-id" }
}
```

`context` فقط allowlist محدود تصویب‌شده دارد و نباید phone، profile CRM، credential، cookie یا داده خصوصی listing/contact داشته باشد.

```json
{
  "version": 1,
  "conversationId": "chat-conversation-uuid",
  "created": true,
  "assigned": false
}
```

retry با همان idempotency key همان conversation/result را می‌دهد. سپس Web capability محدود به همین `conversationId` صادر/تازه می‌کند؛ Chat password قابل استفاده مجدد برنمی‌گرداند.

### خواندن محدود پیام‌ها

`GET /api/platform/v1/support/conversations/:conversationId/messages?beforeId=...&limit=50`

scope لازم: `support:conversation`. Chat تابع `supportAccessService.authorizeConversation(..., operation: "read")` و سپس membership/capability فعلی را بررسی می‌کند. `limit` محدود و URL فایل محافظت‌شده Chat است.

```json
{
  "version": 1,
  "conversationId": "uuid",
  "messages": [],
  "hasMore": false
}
```

### ارسال پیام

`POST /api/platform/v1/support/conversations/:conversationId/messages`

scope لازم: `support:conversation`؛ عملیات `send`. برای idempotence از `clientRequestId` استفاده شود.

```json
{
  "clientRequestId": "uuid",
  "body": "bounded text",
  "replyToMessageId": null,
  "files": []
}
```

پیوست همان اتصال actor/chat/purpose/pending/final در Chat را دارد. مهمان storage key دلخواه متصل نمی‌کند. پاسخ persistence را تأیید می‌کند، نه تحویل به agent:

```json
{ "version": 1, "messageId": "uuid", "deduped": false }
```

### تأیید read state

`POST /api/platform/v1/support/conversations/:conversationId/read`

scope لازم: `support:conversation`؛ عملیات `acknowledge`.

```json
{ "throughMessageId": "uuid", "requestId": "stable-request-id" }
```

```json
{ "version": 1, "ok": true }
```

### realtime و replay

نسخه اول می‌تواند پس از ساخت session Chat توسط Web از WebSocket/SSE خام same-origin فعلی استفاده کند. اگر Web transport capability جداگانه انتخاب کند، پیش از افزودن باید تصویب شود؛ credential در query ممنوع است. event ماندگار از‌دست‌رفته با cursor محدود مطابق [پروتکل realtime نسخه ۱](./CHAT_REALTIME_PROTOCOL_V1.md) دریافت می‌شود.

## ماتریس مجوز server

| principal | ساخت/ادامه | read/send/acknowledge | directory/admin/Chat عمومی | task CRM |
|---|---:|---:|---:|---:|
| مهمان تأییدشده | با create scope | فقط گفتگوی support داخل capability | خیر | خیر |
| کاربر ثبت‌شده لینک‌شده | با create scope | فقط membership فعلی Chat | دسترسی ضمنی ندارد | فقط با delegation جداگانه Web CRM |
| agent پشتیبانی | role/scope وب به‌علاوه membership/assignment Chat | گفتگوی پشتیبانی مجاز/واگذارشده | فقط role جداگانه Chat | فقط با delegation جداگانه Web CRM |
| admin/operator Chat | جایگزین هویت visitor نیست | مطابق مجوز Chat | قرارداد مدیریتی جدا | بدون دسترسی مستقیم DB وب |

## خطاهای پایدار

فرمت JSON برابر `{ "error": { "code": "...", "message": "...", "requestId": "..." } }` باشد و credential یا متن پیام بازتاب داده نشود.

| HTTP | code | معنی |
|---:|---|---|
| 400 | `SUPPORT_REQUEST_INVALID` | request یا field محدود نامعتبر |
| 401 | `SUPPORT_IDENTITY_REQUIRED` | credential غایب/نامعتبر/منقضی |
| 403 | `SUPPORT_SCOPE_DENIED` | scope موجود نیست |
| 403 | `SUPPORT_CONVERSATION_DENIED` | capability/membership اجازه گفتگو نمی‌دهد |
| 404 | `SUPPORT_CONVERSATION_NOT_FOUND` | پس از lookup امن پیدا نشد |
| 409 | `SUPPORT_IDEMPOTENCY_CONFLICT` | استفاده همان key با input متفاوت |
| 429 | `SUPPORT_RATE_LIMITED` | کنترل abuse؛ همراه `Retry-After` |
| 503 | `SUPPORT_PROVIDER_UNAVAILABLE` | verifier/provider یا store لازم در دسترس نیست؛ fail closed |

## پیشنهاد task CRM

Chat باید command احراز‌شده متعلق به Web را فراخوانی کند و هرگز در `crmtasks` وب insert نمی‌کند. `buildCrmTaskCommandV1` فعلاً payload غیرفعال زیر را آماده می‌کند:

```json
{
  "version": 1,
  "source": {
    "service": "ouj-chat",
    "conversationId": "uuid",
    "chatUserId": "uuid"
  },
  "actor": { "provider": "owj-web", "webUserId": "web-user-id" },
  "requestId": "stable-request-id",
  "idempotencyKey": "stable-deduplication-key",
  "task": {
    "title": "Follow up",
    "dueAt": "2026-11-21T08:00:00.000Z",
    "priority": "normal",
    "assigneeWebUserId": "optional-web-user-id"
  }
}
```

Web باید actor انسانی، scope گفتگو/business، assignee و state transition را دوباره authorize و `{ "version": 1, "taskId": "canonical-web-id", "duplicate": false }` برگرداند. Chat timeout/retry محدود و همان idempotency key را استفاده کند. متن پیام، transcript، تلفن/contact و object مشتری رد می‌شود. هیچ route یا دکمه CRM زنده نیست.

## پذیرش پیش از پیاده‌سازی

- Web قرارداد versioned هویت/service و روند rotation کلید را منتشر کند.
- contract test شامل جداسازی مهمان، membership ثبت‌شده، عضو حذف‌شده، expiry/revocation، retry idempotent، مالکیت upload، rate limit و جلوگیری از ارتقا به directory/admin باشد.
- routeهای Chat از repository/service تزریقی استفاده کنند و دسترسی cross-database افزوده نشود.
- تست منابع صفحه پیام، body، capability مهمان فعال، connection و timeout درخواست بیرونی را محدود کند.
- rollback routeهای platform support را بدون حذف گفتگو یا کاربر تاریخی Chat خاموش کند.
