# پروتکل realtime بومی Owj Chat نسخه ۱

وضعیت: قرارداد پایه HTTP/WebSocket خام/SSE مالک Chat **IMPLEMENTED TODAY — از قبل پیاده‌سازی‌شده** است و hardening پذیرش/session/media این اسپرینت در این سورس **IMPLEMENTED IN SPRINT — پیاده‌سازی‌شده در اسپرینت** است. این قرارداد هدف integration برای Owj Web است. **Owj Chat از Socket.IO استفاده نمی‌کند.** این سند اثبات deploy شدن سورس ممیزی‌شده نیست.

## نمای transport

```text
Web/browser ── command احراز‌شده HTTP ───────> Chat
            <─ پاسخ JSON command ─────────────
            <─ JSON روی WebSocket خام (/ws) ─ live ترجیحی
            <─ frameهای SSE (/api/events) ─── fallback live
             ─ cursor replay HTTP ───────────> /api/messaging/sync
```

HTTP مرجع mutation پیام و acknowledgement است. WebSocket/SSE transport اعلان هستند؛ دریافت event زنده تأیید persistence نیست. replay eventهای پشتیبانی‌شده از‌دست‌رفته را جبران می‌کند، ولی consumer پس از reconnect باید state مرجع chat/message را دوباره بگیرد.

## احراز هویت

- auth فعلی مرورگر cookie same-origin به نام `sid` است: HttpOnly، SameSite=Lax، `Path=/` و Secure روی production HTTPS.
- upgrade WebSocket خام پیش از پذیرش با همان cookie احراز می‌شود. query parameter با نام `token` یا `sid` برای جلوگیری از نشت URL/log رد می‌شود. query قدیمی `username` ممکن است باشد، ولی مرجع هویت نیست.
- SSE با `GET /api/events?username=<name>` و credentials فراخوانی می‌شود و username باید با session برابر باشد.
- HTTP از cookie استفاده می‌کند (`credentials: "include"` در client Chat) و membership/role resource را دوباره بررسی می‌کند.
- logout یا لغو session دستگاه، WebSocket خام و stream SSE همان session را می‌بندد. ban، reset password یا حذف حساب توسط ادمین همه streamهای WebSocket خام و SSE مربوط به username آسیب‌دیده Chat را می‌بندد.
- credential مهمان/platform هنوز به این routeها متصل نیست. Web نباید capability آینده را در URL قرار دهد.

## WebSocket خام

endpoint: upgrade روی `/ws` (اصلی) یا `/api/ws` (alias). زیر HTTPS از `wss:` استفاده شود.

کنترل admission در سورس اسپرینت: origin مرورگر مجاز/same-host، timeout احراز، حداکثر payload، سقف اتصال هر IP، window نرخ پیام، heartbeat و قطع صریح session. deployment Nginx باید IP client قابل اعتماد را تنظیم کند تا همه کاربران به‌اشتباه IP کانتینر proxy شمرده نشوند.

event server هرکدام یک object JSON در text frame است:

```json
{
  "type": "chat_message",
  "chatId": "uuid",
  "messageId": "uuid",
  "userId": "uuid",
  "username": "name",
  "body": "message text"
}
```

نوع‌های رایج مصرف‌شده در client:

- `chat_message`، `chat_message_updated`، `chat_message_deleted`؛
- `chat_read`، `chat_typing`، `chat_list_changed`، `chat_updated`، `chat_deleted`؛
- `presence_update`، `profile_updated`، `chat_appearance_updated`؛
- `chat_tools_updated`، `remote_channel_queue`، `video:ready`؛
- `group_call_updated`، `group_call_signal`، `call:*`؛
- `session_revoked` و `error` پروتکل.

payload با نوع event فرق دارد؛ consumer فیلد/نوع ناشناخته را نادیده بگیرد و state را refetch کند. handshake اتاق/event مربوط به Socket.IO و acknowledgement ID تحویل WebSocket وجود ندارد.

پیام client به server در WebSocket محدود است. کنترل پروتکل `{ "type": "ping" }` پاسخ `{ "type": "pong", "timestamp": ... }` دارد؛ signaling WebRTC از action احراز‌شده `call_signal` با chat معتبر و membership سمت server استفاده می‌کند. ارسال پیام عادی HTTP است.

payload بزرگ با code 1009 بسته می‌شود. نقض auth/rate با policy code 1008 بسته یا upgrade HTTP رد می‌شود. JSON نامعتبر `{ "type": "error", "error": "Invalid WebSocket payload." }` می‌گیرد.

## fallback با SSE

endpoint: `GET /api/events?username=<authenticated username>` همراه cookie.

پاسخ `text/event-stream` با `Cache-Control: no-cache, no-transform` و `X-Accel-Buffering: no` است. frame اول:

```text
data: {"type":"connected"}

```

هر event برابر `data: <JSON>\n\n` و heartbeat comment حدود هر ۲۵ ثانیه `: ping` است. SSE همان خانواده payload JSON WebSocket را دارد. فقط server-to-client است و commandها HTTP می‌مانند. client پس از قطع با exponential backoff محدود و jitter وصل می‌شود.

fan-out Chat اعضای فعلی را resolve می‌کند. event تغییر membership کش کوتاه‌مدت را invalidate می‌کند تا عضو حذف‌شده event محافظت‌شده بعدی را نگیرد.

هر پاسخ SSE در حافظه به شناسه مشتق‌شده از digest مربوط به `sid` بازکننده متصل است. logout/لغو device فقط stream همان session را می‌بندد؛ ban/reset-password/delete کل حساب همه streamهای آن username را می‌بندد. token خام به‌عنوان شناسه نگه‌داری نمی‌شود. WebSocket یا SSE از قبل باز صرفاً با رسیدن زمان انقضای idle/absolute هنوز دوره‌ای بازاعتبارسنجی نمی‌شود؛ بنابراین تنظیم timeout تولید و این پیگیری دفاعی بخشی از rollout باقی می‌ماند.

## قرارداد اصلی HTTP پیام

تمام عملیات خصوصی session و membership فعلی لازم دارند. UI بومی فعلی برای سازگاری قدیمی username نیز می‌فرستد؛ server آن را با session برابر می‌کند و به آن اعتماد مستقل ندارد.

| کاربرد | endpoint | رفتار اصلی درخواست/پاسخ |
|---|---|---|
| فهرست پیام | `GET /api/messages?chatId=&username=&beforeId=&beforeCreatedAt=&afterId=&afterCreatedAt=&limit=` | window/cursor محدود؛ پاسخ `{ chatId, messages, hasMore }`. |
| ارسال پیام | `POST /api/messages` | route متن JSON؛ شناسه/result پیام persist‌شده را برمی‌گرداند. برای idempotence از `clientRequestId` استفاده شود. |
| ارسال فایل | `POST /api/messages/upload` | multipart/descriptor امضاشده؛ مالکیت و membership بررسی می‌شود. |
| edit/delete/forward | `POST /api/messages/edit`، `/delete`، `/forward` | پاسخ HTTP acknowledgement است؛ event realtime viewer را به refresh هدایت می‌کند. |
| typing | `POST /api/messages/typing` | موقت و خارج replay ماندگار. |
| خواندن همه قابل مشاهده | `POST /api/messages/read` | body شامل `chatId` و username برابر session؛ `chat_read` منتشر می‌کند. |
| خواندن یکی | `POST /api/messages/read-one` | تعلق `messageId` به `chatId` را نیز بررسی و `chat_read` منتشر می‌کند. |
| تعداد خواندن | `POST /api/messages/read-counts` | membership و ID محدود را بررسی می‌کند. |
| اولین خوانده‌نشده | `GET /api/messages/first-unread` | anchor محدود به membership. |

API ابزار گسترده زیر `/api/messaging` است: preference، search، reaction، pin، scheduled message، poll، topic، policy/role گروه، call state، media list، device، changes و replay. هر route actor را از session می‌گیرد.

## reconnect و replay

`GET /api/messaging/sync?after=<non-negative integer>` احراز هویت می‌خواهد و حداکثر ۲۰۰ journal entry محدود به membership را به ترتیب sequence می‌دهد:

```json
{
  "events": [
    { "type": "chat_message_updated", "chatId": "uuid", "messageId": "uuid", "sequence": 42 }
  ],
  "cursor": 42,
  "hasMore": false
}
```

تا وقتی `hasMore` درست است ادامه و cursor برای هر حساب ذخیره شود. client بومی حدود هر ۱۵ ثانیه و در رخداد online/visibility poll می‌کند. replay hint برای invalidation است؛ برای محتوای مرجع `/api/chats`، `/api/messages` یا `/api/messaging/chats/:chatId/changes?ids=...` فراخوانی شود.

`chat_typing` و `chat_read` عمداً journal نمی‌شوند. تضمین نشده تمام producerهای تاریخی event رکورد journal متصل به همان transaction داشته باشند؛ پس Web بعد از gap، reset cursor، ارتقای schema یا sequence مشکوک state را refresh کند.

## فایل و رسانه

پاسخ پیام URL محافظت‌شده می‌دهد:

- `GET /api/uploads/file/:fileId`: فایل ← پیام ← chat؛ مجوز membership فعلی یا visibility صریح کانال عمومی؛ stream/decrypt یا redirect کوتاه‌عمر object store.
- `GET /api/uploads/thumbs/:fileId`: همان مجوز برای thumbnail.
- `GET /api/uploads/messages/:storedName`: همان مجوز، range محلی یا redirect remote پس از احراز.

پاسخ خصوصی `Cache-Control: private, no-store` و رسانه کانال صریحاً عمومی می‌تواند cache عمومی باشد. route avatar دارایی profile عمومی جداست و مجوز attachment پیام نیست.

جریان presign:

1. `POST /api/uploads/presign` با `chatId` متصل به actor، purpose و `messageId` هدف یا `clientRequestId` پیام آینده.
2. مرورگر byte را به URL provider می‌فرستد.
3. انتشار پیام descriptor معلق را مصرف می‌کند یا `POST /api/uploads/complete` upload پیام موجود را کامل می‌کند. completion مقدار `upload_completed_at` را ثبت می‌کند، persistence و پذیرش صف را await می‌کند، claim معلق را هنگام overload نگه می‌دارد، در موفقیت مصرف می‌کند و retry با بررسی مالکیت را idempotent می‌داند.
4. callback پردازش `POST /api/uploads/webhook/processed` داخلی است و بدون secret fail closed می‌شود.
5. `chat_message_updated`/`video:ready` client را به refetch هدایت می‌کند و URL محافظت‌شده فایل ثابت می‌ماند.

storage key، user ID یا MIME ارسالی مرورگر هرگز proof مالکیت نیست.

## قواعد integration وب

- widget قدیمی Socket.IO وب با قرارداد HTTP/WebSocket خام/SSE تطبیق داده شود؛ Socket.IO به Chat افزوده نشود.
- پیش از بازکردن realtime یک session Chat یا exchange غیر-URL تصویب‌شده برقرار شود.
- `clientRequestId` و idempotency key در retry پس از timeout دوباره استفاده شود.
- HTTP 401/403 شکست نهایی هویت/مجوز، 409 conflict state و 429/503 retry محدود با backoff است؛ reconnect با jitter باشد.
- متن پیام خصوصی، cookie، bearer/capability token یا query URL امضاشده در log/telemetry قرار نگیرد.
- پیش از rollout برای WS بومی و fallback SSE، replay، حذف membership، revocation session، مجوز file/range و سازگاری rolling-version contract test اجرا شود.
