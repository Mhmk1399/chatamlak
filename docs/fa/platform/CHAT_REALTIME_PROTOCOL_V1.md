# پروتکل بلادرنگ Owj Chat نسخه ۱

وضعیت: Stack بلادرنگ بومی Chat و Stack بلادرنگ پشتیبانی Sprint 2 در این درخت منبع پیاده‌سازی شده‌اند. پشتیبانی تا زمانی که `OWJ_SUPPORT_ENABLED=true` نباشد غیرفعال می‌ماند. این سند قرارداد کد منبع است، نه مدرک یکپارچه‌سازی با Owj Web، اعتبارسنجی Reverse Proxy، اجرای Docker یا Deploy در Production.

Owj Chat از WebSocket بومی و Server-Sent Events (SSE) استفاده می‌کند و Socket.IO را پیاده‌سازی **نمی‌کند**.

## خانواده‌های پروتکل

| مخاطب | WebSocket | SSE | API مربوط به Mutation/Replay | Credential |
|---|---|---|---|---|
| Client بومی Chat | `/ws` (نام مستعار `/api/ws`) | `/api/events` | مسیرهای موجود `/api/*` و `/api/messaging/sync` | Cookie نوع `sid` متعلق به Chat |
| Widget/Staff پشتیبانی Owj Web | `/support/v1/ws` | `/support/v1/events` | مسیرهای `/support/v1/*` و `/internal/v1/support/*` | Cookie نوع `owj_support_sid` |

پاسخ‌های HTTP دستورها را تایید می‌کنند. Event زنده فقط یک اعلان است؛ Clientها باید برای ترمیم State پس از اتصال مجدد از قراردادهای HTTP/Replay استفاده کنند.

## پذیرش اتصال بلادرنگ پشتیبانی

هر دو Transport پشتیبانی به تمام موارد زیر نیاز دارند:

- Cookie معتبر `owj_support_sid` که قرارداد Bootstrap صادر کرده است؛
- نشستی که Action نوع `events` را دارد؛
- مقدار `Origin` درخواست که دقیقاً با یکی از Originهای `OWJ_SUPPORT_ALLOWED_ORIGINS` مطابقت دارد (یا وقتی فهرست صریح وجود ندارد، `APP_PUBLIC_URL`)؛
- ادامه مجوز دسترسی به همان گفتگو.

نبودن `Origin` رد می‌شود. پارامترهای Query وب‌سوکت با نام `token`، `sid` یا `supportSession` رد می‌شوند. Credential یا Secret مربوط به Replay را در URL نفرستید. تنها مقدار Query پشتیبانی‌شده SSE، `cursor` غیرمحرمانه Replay است.

نشست پشتیبانی به‌صورت دوره‌ای دوباره اعتبارسنجی می‌شود؛ پیش‌فرض هر ۱۵ ثانیه است (`SUPPORT_REALTIME_REVALIDATE_MS`). اتصال در زمان انقضای موثر نشست نیز بسته می‌شود. لغو، Logout، انقضا، شکست بررسی وضعیت حساب، تغییر پیوند هویت، شکست مجوز گفتگو یا Shutdown دسترسی زنده را پایان می‌دهد.

## Envelope رویداد پشتیبانی

رویدادهای پشتیبانی Objectهای JSON هستند. Notification زنده پیام تازه‌منتشرشده شکل نمونه زیر را دارد:

```json
{
  "version": 1,
  "type": "chat_message",
  "conversationId": "conversation-uuid",
  "chatId": "conversation-uuid",
  "messageId": "message-uuid",
  "userId": "chat-user-uuid",
  "actorKind": "customer",
  "cursor": "message-uuid",
  "eventId": "message:message-uuid",
  "occurredAt": "2026-11-21T09:00:00.000Z"
}
```

فیلدهای مشترک:

| فیلد | قرارداد |
|---|---|
| `version` | در Eventهای زنده، Replayشده و تولیدشده توسط پروتکل Sprint 2 برابر `1` است. |
| `type` | تفکیک‌کننده Event؛ Type ناشناخته را با ایمنی نادیده بگیرید. |
| `conversationId` | مرز گفتگو برای مجوزدهی و Fan-out. |
| `cursor` | موقعیت مات Replay با حداکثر ۲۵۶ کاراکتر؛ آن را دقیقاً ذخیره کنید و Parse نکنید. |
| `eventId` | شناسه پایدار حذف تکرار، هرگاه موجود باشد. |
| `occurredAt` | Timestamp نوع ISO در Eventهای زنده/Journal؛ Eventهای کنترل پروتکل ممکن است آن را نداشته باشند. |

انواع Event پیاده‌سازی‌شده شامل موارد زیر هستند:

- `chat_message`؛
- `support_request_created` و `support_queue_updated`؛
- `support_assigned`، `support_resolved` و `support_closed`؛
- Eventهای پروتکل `connected`، `replay_complete`، `session_revoked`، `error` و `pong`.

Cursor/شناسه Event پیام پایدارند (`<messageId>` و `message:<messageId>`). Replay پایدار پیام از Journal رویداد Chat در MongoDB می‌آید. نرمال‌سازی Replay به ردیف‌های قدیمی Journal مقادیر `version:1`، `conversationId`، `chatId`، `cursor`/`eventId` پایدار، `occurredAt` و `sequence` عددی را اضافه می‌کند. برای پیامی که هنوز وجود دارد، نویسنده ذخیره‌شده نیز بارگذاری می‌شود و `userId`/`actorKind` با توجه به گفتگوی پشتیبانی به‌دست می‌آید. خواندن پیام از HTTP، به‌ویژه اگر پیام زیرین حذف شده باشد، همچنان مرجع Body، طبقه‌بندی نویسنده، Timestampها و فایل‌ها است.

سایر Eventهای زنده پشتیبانی از Cursor درون‌پردازه‌ای `sr_*` استفاده می‌کنند، مگر Caller یک Cursor معتبر بدهد. Fan-out صندوق Staff فقط در حافظه است؛ پس از Restart پردازه، Staff باید فهرست مرجع HTTP را دوباره Fetch کند.

## SSE پشتیبانی

باز کردن اتصال:

```http
GET /support/v1/events
Cookie: owj_support_sid=...
Origin: https://web.example
Last-Event-ID: <opaque cursor>   # optional
```

به‌جای آن می‌توان از `?cursor=<opaque cursor>` استفاده کرد. اگر هر دو موجود باشند، `Last-Event-ID` اولویت دارد. پاسخ شامل موارد زیر است:

```text
Content-Type: text/event-stream; charset=utf-8
Cache-Control: private, no-store, no-transform
X-Accel-Buffering: no
```

هر Event فیلدهای `id`، `event` و `data` نوع JSON دارد. Heartbeat از نوع Comment با مقدار `: ping` هر ۲۵ ثانیه ارسال می‌شود. Server پیش از بارگذاری Replay، Subscribe می‌کند؛ Eventهای زنده را هنگام Replay با حد مشخص Buffer می‌کند و شناسه‌های Event/Cursor تکراری را حذف می‌کند. Replay به ۲۰۰ Event محدود است.

پس از Replay، SSE رویداد `connected` را با `cursor`، `hasMore` و `gap` ارسال می‌کند. اگر `hasMore` مقدار true دارد، با Cursor بازگشتی دوباره متصل شوید (یا به Replay وب‌سوکت بروید) تا Backlog پایدار مصرف شود و هر Redelivery را Deduplicate کنید. اگر `gap` مقدار true دارد، پیش از سالم تلقی‌کردن Stream، State مرجع HTTP را دوباره Fetch کنید.

هنگام لغو، Server تلاش می‌کند `session_revoked` را ارسال کند و سپس Stream را می‌بندد. مرورگر ممکن است خودکار دوباره متصل شود؛ Widget باید در خطاهای نهایی هویت/مجوز، Retry را متوقف کند و Bootstrap تازه‌ای از طریق Web بگیرد.

## WebSocket پشتیبانی

یک Upgrade بومی `wss:` به `/support/v1/ws` باز کنید. درخواست عادی HTTP GET پاسخ `426 SUPPORT_WEBSOCKET_UPGRADE_REQUIRED` می‌گیرد.

محدودیت‌های پیش‌فرض پذیرش و Lifecycle:

| کنترل | پیش‌فرض |
|---|---:|
| حداکثر Frame | 16 KiB |
| اتصال برای هر IP کلاینت | ۲۰ (`SUPPORT_WS_MAX_CONNECTIONS_PER_IP`) |
| اتصال برای هر نشست پشتیبانی در Subscriptionهای Hub مربوط به SSE/WS | ۴ (`SUPPORT_MAX_CONNECTIONS_PER_SESSION`) |
| مهلت احراز هویت | ۵ ثانیه |
| فاصله Ping سرور | ۳۰ ثانیه |
| مهلت Pong | ۱۰ ثانیه |
| اعتبارسنجی مجدد نشست | ۱۵ ثانیه |
| صفحه Replay | ۲۰۰ Event |

پیش از اعتماد به `X-Forwarded-For`، مقدار `WS_TRUST_PROXY` باید با Topology کنترل‌شده Proxy مطابقت داشته باشد. پیکربندی نادرست Proxy می‌تواند همه کاربران را یک IP تلقی کند یا آدرس‌های ارسال‌شده توسط Caller را بپذیرد.

Frame کنترلی Client:

```json
{ "type": "ping" }
```

پاسخ `pong` می‌دهد. برای Replay:

```json
{ "type": "resume", "cursor": "opaque-cursor-or-empty-string" }
```

Server رویدادهای Replayشده و سپس پاسخ زیر را می‌فرستد:

```json
{
  "version": 1,
  "type": "replay_complete",
  "conversationId": "conversation-uuid",
  "cursor": "latest-opaque-cursor",
  "hasMore": false,
  "gap": false
}
```

اگر `hasMore` برابر True بود، `resume` دیگری با Cursor برگشتی ارسال کنید. اگر `gap` برابر True بود، پیش از ادامه State را از HTTP دوباره Fetch کنید. روی هر Socket فقط یک Replay هم‌زمان اجرا می‌شود. کدهای خطا شامل `INVALID_PAYLOAD`، `INVALID_REPLAY_CURSOR`، `REPLAY_IN_PROGRESS`، `REPLAY_UNAVAILABLE` و `UNSUPPORTED_ACTION` هستند.

Frame بیش از حد بزرگ با کد WebSocket شماره 1009 بسته می‌شود. شکست Policy نشست با 1008 بسته می‌شود. شکست سقف اتصال ممکن است با 1013 بسته شود یا Upgrade با HTTP 429 رد گردد. ارسال `session_revoked` پیش از بستن Policy به‌صورت Best-Effort است و نباید تنها سیگنال لغو تلقی شود.

## مرز Replay و دوام پشتیبانی

`chat_message` از مسیر موجود تراکنشی/Idempotent پیام در Chat ایجاد می‌شود. Mutation پیام و Hint مربوط به Journal آن با هم نوشته می‌شوند؛ انتشار زنده غنی‌تر عمداً آن را بار دوم در Journal نمی‌نویسد. Replay پشتیبانی Journal را با Filterهای گفتگو و قابلیت مشاهده Viewer می‌خواند و نرمال می‌کند. Read مرجع پیام روی HTTP، Body، طبقه‌بندی Author، Timestampها و Fileها را تامین می‌کند.

Replay هم Sequence عددی Journal و هم شناسه پایدار Message/Event را می‌پذیرد. نتایج صعودی و محدودند و شامل `hasMore` و `gap` هستند. Consumer باید ابتدا با `eventId` و در صورت نبود آن با `cursor` تکرار را حذف کند و Redelivery را تحمل کند.

همه سیگنال‌های Assignment، Resolution، به‌روزرسانی Queue، اتصال، Presence و Heartbeat رویدادهای پایدار نیستند. ترتیب مرجع بازیابی:

1. با آخرین Cursor ذخیره‌شده دوباره متصل شوید؛
2. همه صفحات Replay را مصرف کنید؛
3. اگر `gap` برابر True بود یا State مشکوک بود، گفتگو/پیام‌ها/Queue عامل را از HTTP دوباره Fetch کنید؛
4. Cursor جدید را فقط پس از اعمال State متناظر ذخیره کنید.

## بلادرنگ Chat بومی

رابط کاربری اصلی Chat روی پروتکل جداگانه احرازشده با `sid` باقی می‌ماند:

- Upgrade خام WebSocket در `/ws` یا `/api/ws`؛
- SSE در `/api/events?username=<authenticated username>`؛
- Mutationهای HTTP و `/api/messaging/sync?after=<numeric sequence>` برای Replay محدود.

Username موجود در Query داده سازگاری قدیمی است و باید با نشست احرازشده مطابقت داشته باشد؛ مرجع هویت نیست. WebSocket بومی پارامترهای Credential در Query را رد می‌کند. Eventهای فعلی پیام، عضویت، Presence، تماس، Media و Invalidation شکل موجود خود را حفظ می‌کنند و بخشی از قرارداد Envelope پشتیبانی نیستند.

SSE و WebSocket بومی اکنون نشست‌های باز Chat را به‌صورت دوره‌ای دوباره اعتبارسنجی می‌کنند (پیش‌فرض ۶۰ ثانیه از طریق `SSE_SESSION_REVALIDATE_MS` و `WS_SESSION_REVALIDATE_MS`). Logout صریح/لغو Device نشست متناظر را قطع می‌کند؛ Ban سراسری حساب، Reset گذرواژه یا حذف حساب، تمام نشست‌های آن Username را قطع می‌کند.

## رفتار Client و خطاها

- وقتی WebSocket از Proxy مستقر عبور می‌کند آن را ترجیح دهید؛ SSE را به‌عنوان Fallback یک‌طرفه استفاده کنید. همه Writeها همچنان HTTP هستند.
- با Backoff نمایی محدود و Jitter دوباره متصل شوید. پاسخ نهایی 401/403 را بی‌نهایت Retry نکنید.
- 409 را تداخل State/Idempotency و 429/503 را Retry محدود با رعایت سلامت سرویس تلقی کنید.
- هرگز Cookie، Assertion، Credential نوع Bearer/Service، متن پیام خصوصی یا Query مربوط به Presigned URL را Log نکنید.
- برای سازگاری رو به جلو، Type و فیلدهای ناشناخته Event را نادیده بگیرید.
- پس از Replay Gap، Restart سرور، Reset شدن Cursor، تغییر Schema/Version یا احتمال از دست رفتن State، دوباره Fetch کنید.

## اعتبارسنجی‌های باقی‌مانده خارج از این Repository

پیش از Rollout، هر دو Transport را از طریق Topology واقعی Web/Nginx تست کنید: Cookie Path و رفتار Secure، Origin سخت‌گیرانه، Upgrade وب‌سوکت، بافرینگ SSE، Timeoutهای Proxy، اعتماد به IP کلاینت، اتصال مجدد/Replay، غیرفعال‌شدن حساب، لغو Link، Logout، تغییر Assignment و سازگاری نسخه‌ها هنگام Rolling Deployment. هیچ‌یک از این بررسی‌های بین‌Repository/Deployment صرفاً با کد منبع Sprint 2 و تست‌های ایزوله اثبات نمی‌شوند.
