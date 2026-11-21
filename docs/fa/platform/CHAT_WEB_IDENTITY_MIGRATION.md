# مهاجرت هویت بین Chat و Web

وضعیت: **در کد منبع پیاده‌سازی شده، به‌صورت پیش‌فرض با Feature Flag خاموش است و Deploy نشده است** (Sprint 2، تاریخ 2026-11-20).

Owj Web مرجع اصلی هویت انسانی است. Chat همچنان مالک شناسه‌های پایدار کاربران، گفتگوها، پیام‌ها، عضویت‌ها، نشست‌های پشتیبانی و مجوزدهی بلادرنگ خود باقی می‌ماند. این پیاده‌سازی هیچ‌گاه Collectionهای پایگاه‌داده Web را نمی‌خواند یا در آن‌ها نمی‌نویسد.

## رفتار فعلی و رفتار هدف

حساب‌های موجود Chat در `users` باقی می‌مانند. پیام‌ها، فایل‌ها، عضویت‌ها، وضعیت خواندن و رکوردهای Audit همچنان به UUID اصلی Chat ارجاع می‌دهند. مسیرهای محلی `/api/login` و `/api/register` موقتاً برای سازگاری کاربران مهاجرت‌نکرده باقی مانده‌اند؛ Reverse Proxy وب‌سایت Owj باید فقط مسیرهای یکپارچه‌سازی پشتیبانی را در دسترس بگذارد، نه این مسیرهای قدیمی ورود.

وقتی `OWJ_SUPPORT_ENABLED=true` باشد، Chat یک Assertion یک‌بارمصرف Web را اعتبارسنجی می‌کند، یک پیوند صریح یک‌به‌یک هویت را می‌یابد، وضعیت جاری حساب را از API داخلی Web بررسی می‌کند و یک نشست جداگانه و محدود به پشتیبانی صادر می‌کند. Assertion وب به نشست نامحدود و قدیمی Chat تبدیل نمی‌شود.

## Federation assertion v1

Web کلیدهای عمومی را در JWKS URL پیکربندی‌شده منتشر می‌کند (هدف: `GET /.well-known/jwks.json`). Chat فقط JWT فشرده با امضای RS256 را می‌پذیرد.

JOSE header:

```json
{ "alg": "RS256", "typ": "JWT", "kid": "web-key-2026-01" }
```

شکل Payload (Claimهای Federation الزامی هستند؛ مقادیر پیش‌فرض اختیاری در ادامه مشخص شده‌اند):

```json
{
  "iss": "https://configured-web-issuer.example/",
  "sub": "stable-web-user-or-guest-subject",
  "aud": "owj-chat",
  "iat": 1795220000,
  "exp": 1795220300,
  "jti": "one-time-assertion-id",
  "token_use": "support_registered",
  "scope": "support:conversation:create",
  "account_status": "active",
  "ver": 1
}
```

`kid` در JOSE header الزامی است و در Payload تکرار نمی‌شود. `typ` اختیاری است، اما اگر وجود داشته باشد باید `JWT` باشد؛ `crit` رد می‌شود. Claimهای الزامی Payload عبارت‌اند از `iss`، `sub`، `aud`، `iat`، `exp`، `jti`، `token_use` و `scope`. اگر `account_status` حذف شود مقدار پیش‌فرض آن `active` است؛ با این حال Web باید آن را صریحاً ارسال کند. برای سازگاری قبلی، اگر `ver` حذف شود مقدار پیش‌فرض آن `1` است؛ اگر ارسال شود باید عدد `1` باشد، وگرنه Chat خطای `IDENTITY_CLAIMS_VERSION_INVALID` می‌دهد. پیکربندی Runtime ابتدا Issuer مورد انتظار را به URL مطلق نرمال می‌کند و سپس `iss` توکن باید دقیقاً با رشته حاصل برابر باشد.

| `token_use` | Principal | حداکثر عمر | Scopeهای الزامی/مجاز |
|---|---|---:|---|
| `support_registered` | مشتری ثبت‌شده و پیوندخورده | ۵ دقیقه | دقیقاً `support:conversation:create` |
| `support_guest` | مهمان ناشناس صادرشده توسط Web | ۱۰ دقیقه | دقیقاً `support:conversation:create` |
| `support_agent` | عامل پشتیبانی پیوندخورده | ۵ دقیقه | `support:agent` الزامی است؛ می‌تواند `support:conversation:create` را نیز داشته باشد |

Policy پایه Verifier در بالا Scope دوم Agent را مجاز می‌کند، اما مسیر واقعی Bootstrap کارکنان **هر دو** Scope یعنی `support:agent` و `support:conversation:create` را الزامی می‌داند.

Credential فشرده حداکثر 16 KiB است. `aud` می‌تواند یک String یا Array شامل حداکثر چهار Entry باشد. `scope` می‌تواند String جداشده با Space یا Array باشد و پیش از Normalization/Deduplication حداکثر ۱۶ Entry ورودی داشته باشد؛ قرارداد مشترک Web باید از شکل String نمایش‌داده‌شده در بالا استفاده کند. `kid` و `jti` حداکثر ۱۲۸ کاراکتر و مقادیر Issuer/Subject حداکثر ۲۰۰ کاراکتر هستند.

Chat موارد زیر را رد می‌کند: Token بدون امضا یا بدساخت، الگوریتمی غیر از RS256، Headerهای `crit`، Issuer/Audience نادرست، `kid` ناشناخته، امضای نامعتبر، زمان آینده یا منقضی، عمر یا Scope بیش از حد، نوع Token پشتیبانی‌نشده، وضعیت غیرفعال و Replay. تحمل اختلاف ساعت پیش‌فرض پنج ثانیه و سقف آن ۳۰ ثانیه است.

پاسخ JWKS به 128 KiB و هشت کلید محدود است. کلید پذیرفته‌شده باید RSA باشد، `kid` یکتا و غیرخالی داشته باشد و در صورت وجود، `alg:RS256` و `use:sig` را اعلام کند. مدت Cache از `Cache-Control: max-age` و در بازه ۱ ثانیه تا ۱۵ دقیقه پیروی می‌کند (Fallback پنج دقیقه). `kid` ناشناخته یک Refresh محدودشده را فعال می‌کند که بیش از یک بار در ثانیه انجام نمی‌شود. Redirect رد می‌شود. JWKS روی HTTP فقط خارج از Production و با `OWJ_WEB_ALLOW_INSECURE_HTTP=true` مجاز است.

هر `(issuer, jti)` پذیرفته‌شده در `platform_identity_assertion_jtis` درج می‌شود؛ Index یکتا Replay را میان Restartهای Chat متوقف می‌کند و Index نوع TTL روی BSON Date رکورد را پس از انقضای Assertion حذف می‌کند. خرابی یا در دسترس نبودن Replay Store به‌صورت Fail Closed عمل می‌کند.

JWT قدیمی و بلندمدت HMAC متعلق به Web و `JWT_SECRET` پذیرفته یا مشترک نمی‌شوند.

## ذخیره‌سازی افزایشی هویت

`platform_identity_links` یک Subject وب را به یک حساب موجود Chat نگاشت می‌کند:

```json
{
  "id": "uuid",
  "provider": "owj-web",
  "web_user_id": "stable-web-subject",
  "chat_user_id": "existing-chat-uuid",
  "status": "active",
  "revision": 1,
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "linked_by_web_user_id": "operator-or-user-subject",
  "revoked_at": null,
  "revocation_reason": null
}
```

Indexهای یکتا روی `id`، ترکیب `(provider, web_user_id)` و `chat_user_id` قرار دارند. درخواست‌های هم‌زمان و یکسان Idempotent هستند؛ تداخل ناسازگار در سمت Web یا Chat خطای `IDENTITY_LINK_CONFLICT` می‌دهد. غیرفعال‌سازی، وضعیت و Revision پیوند را تغییر می‌دهد و دسترسی را بدون حذف حساب Chat یا بازنویسی تاریخچه لغو می‌کند.

`createPlatformIdentityLinkService` به یک Proof جداگانه و Injectشده از Web نیاز دارد که دقیقاً `webUserId` و `chatUserId` را به هم متصل کند. Assertion معمولی Bootstrap پشتیبانی نمی‌تواند یک حساب تاریخی و دلخواه Chat را مطالبه کند. Endpoint/Credential دقیق Proof در Web همچنان یک وابستگی بین‌Repository است؛ در حال حاضر Chat هیچ مسیر عمومی HTTP برای پیوند حساب ارائه نمی‌کند.

Subjectهای مهمان حساب دارای گذرواژه نیستند. Chat یک Digest نام‌گذاری‌شده SHA-256 و Actor مستعار `support-guest:<hex>` ذخیره می‌کند. `support_guest_identity_links` تبدیل مهمان مبتنی بر Proof را با Subject مهمان Digestشده ثبت می‌کند. سرویس Proof و Repositoryهای Idempotent پیاده‌سازی شده‌اند، اما Endpoint سرتاسری تبدیل در Web هنوز Compose نشده است؛ Production نباید Repository سطح پایین را مستقیماً فراخوانی کند.

## وضعیت جاری حساب Web

برای مشتریان ثبت‌شده و Agentها، Chat این مسیر را فراخوانی می‌کند:

`POST /api/internal/v1/identity/status`

با Credential اختصاصی سرویس خروجی:

```http
Authorization: Bearer <OWJ_CHAT_TO_WEB_SERVICE_TOKEN>
X-Owj-Service: ouj-chat
X-Request-Id: <uuid>
Content-Type: application/json
```

```json
{
  "version": 1,
  "subject": { "provider": "owj-web", "webUserId": "stable-web-subject" },
  "operation": "support:session"
}
```

پاسخ مورد انتظار:

```json
{
  "version": 1,
  "subject": { "webUserId": "stable-web-subject", "status": "active" },
  "authorized": true,
  "revision": 7
}
```

Chat مقدارهای دقیق زیر را برای `operation` می‌فرستد:

| Context | `operation` |
|---|---|
| Bootstrap مشتری ثبت‌شده | `support:bootstrap` |
| Bootstrap عامل پشتیبانی | `support:agent:bootstrap` |
| اعتبارسنجی دوباره نشست/Realtime مشتری ثبت‌شده | `support:session` |
| اعتبارسنجی دوباره نشست/Realtime عامل | `support:agent` |

وضعیت‌های مجاز `active`، `disabled`، `revoked` و `deleted` هستند. نتیجه بر اساس Subject و Operation حداکثر ۶۰ ثانیه Cache می‌شود (`OWJ_IDENTITY_STATUS_CACHE_MS`) و Cache پیش‌فرض حداکثر ۵٬۰۰۰ Entry دارد. Timeout پیش‌فرض Request سه ثانیه است، Redirect رد می‌شود و پاسخ بزرگ‌تر از 32 KiB پذیرفته نمی‌شود. هر پاسخ `authorized:false` یا Status غیر `active` عملیات را رد می‌کند و تمام نشست‌های فعال پشتیبانی محلی آن Subject وب را لغو می‌کند. خطاهای Upstream، پاسخ غیر 2xx، Payload بدساخت و عدم تطابق Subject، پس از انقضای هر Cache هنوز معتبر، Fail Closed می‌شوند. مهمان‌ها هرگز به Endpoint کاربران ثبت‌شده ارسال نمی‌شوند.

این Client پیاده‌سازی شده و با Mock سخت‌گیرانه تست شده است؛ Endpoint و Credential واقعی Web هنوز همراه Chat تست نشده‌اند.

## ابزار مهاجرت ایمن

ورودی می‌تواند Array سطح بالا یا `{ "links": [...] }` باشد و فقط شناسه‌های صریح و بازبینی‌شده را در بر می‌گیرد:

```json
{
  "links": [
    {
      "provider": "owj-web",
      "webUserId": "web-user-1",
      "chatUserId": "existing-chat-uuid",
      "linkedByWebUserId": "reviewer-web-id"
    }
  ]
}
```

فیلدهایی مانند Username، Phone، Nickname، Display Name یا Email رد می‌شوند. Planner ورودی را به ۱۰۰٬۰۰۰ ردیف محدود می‌کند و شماره ردیف/کد خطا را بدون Log کردن مقادیر هویتی گزارش می‌دهد.

Dry Run، بدون اتصال یا نوشتن در پایگاه‌داده:

```bash
node server/scripts/platform-identity-migrate.js --input /absolute/path/synthetic-links.json
```

Apply عمداً به URI نوع `mongodb://` روی Loopback و نام پایگاه‌داده شامل `test`، `e2e`، `local`، `dev` یا `disposable` محدود شده است:

```bash
MONGODB_URI='mongodb://127.0.0.1:27017/ouj_chat_local?replicaSet=rs0' \
MONGODB_DATABASE='ouj_chat_local' \
node server/scripts/platform-identity-migrate.js \
  --input /absolute/path/synthetic-links.json \
  --apply --disposable-local
```

Apply پیش از اجرا تداخل با پیوندهای موجود را بررسی می‌کند، وجود تمام UUIDهای مقصد Chat را اعتبارسنجی می‌کند، فقط Collection/Indexهای افزایشی را می‌سازد و پیوندها را به‌شکل Idempotent درج می‌کند. این دستور مهاجرت Production نیست و هرگز نباید به Production اشاره کند. هر درج جداگانه Idempotent است، اما کل فایل یک Transaction واحد نیست؛ خطای غیرمنتظره در میانه اجرا می‌تواند Prefix جزئی و ایمنی باقی بگذارد که باید تطبیق داده و دوباره اجرا شود.

## Rollout و Rollback در Production (مرحله آینده)

پیش از Production: از `ouj_chat` Backup بگیرید، Restore را تست کنید، یکپارچگی ارجاعی را Inventory کنید، نگاشت شناسه‌های بازبینی‌شده را از Web بگیرید، Endpointهای واقعی JWKS/Status/Proof را Contract Test کنید، Benchmark بگیرید و Rollback برنامه/Image را آماده کنید. برای حدس‌زدن هویت، متن پیام‌ها را بررسی نکنید.

Rollout باید ابتدا Schema را اضافه کند، Dry Run نگاشت بازبینی‌شده را انجام دهد، با Wrapper جداگانه و بازبینی‌شده مخصوص Production اعمال کند، Status را به‌شکل Shadow بررسی کند و سپس برای Cohortهای کوچک فعال شود. ورود محلی فقط در مسیر سازگاری مستندشده باقی می‌ماند تا درباره بازنشستگی آن جداگانه تصمیم گرفته شود.

Rollback، `OWJ_SUPPORT_ENABLED` را غیرفعال می‌کند، ایجاد پیوند جدید را متوقف می‌کند، نشست‌های پشتیبانی متاثر را لغو می‌کند و به Image شناخته‌شده و سالم بازمی‌گردد. پیوندهای افزایشی می‌توانند غیرفعال باقی بمانند. هرگز به‌عنوان Rollback، `users` را Drop/Rename نکنید، نویسندگان پیام را بازنویسی نکنید، بر اساس فیلدهای پروفایل Merge نکنید یا گفتگوها را حذف نکنید.

## وابستگی‌های الزامی Web

- Issuer نوع RS256 و JWKS در URL توافق‌شده، با هم‌پوشانی برای Rotation کلید.
- قرارداد دقیق Assertion claim/token-use/scope مطابق بالا.
- مسیر `POST /api/internal/v1/identity/status` و Credential خروجی Chat.
- قرارداد بازبینی‌شده Proof برای پیوند حساب با شناسه‌های دقیق.
- قرارداد بازبینی‌شده Proof برای تبدیل مهمان به کاربر ثبت‌شده.
- یکپارچه‌سازی Same-Origin مربوط به Reverse Proxy/Cookie و Contract Test واقعی بین Web و Chat.
