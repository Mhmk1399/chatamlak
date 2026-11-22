# مهاجرت هویت بین Chat و Web

وضعیت: **سورس Chat پیاده‌سازی شده، Feature Flag خاموش است و integration مصنوعی و محلی Web پذیرفته شده است** (تصویر Sprint 2.5 در ۲۰۲۶-۱۱-۲۱). هیچ migration تولید، deployment یا acceptance ظرفیت ادعا نمی‌شود.

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

## قرارداد frozen وضعیت جاری Web

برای مشتری ثبت‌شده و agent، Chat مسیر `POST /api/internal/v1/identity/status` را با credential جهت‌دار و اختصاصی `OWJ_CHAT_TO_WEB_SERVICE_TOKEN` فراخوانی می‌کند. این credential خروجی و `OWJ_WEB_TO_CHAT_SERVICE_SECRET` ورودی هر دو حداقل ۳۲ کاراکتر و مستقل از هم هستند.

```http
Authorization: Bearer <OWJ_CHAT_TO_WEB_SERVICE_TOKEN>
X-Owj-Service: ouj-chat
X-Correlation-Id: <request-id>
Content-Type: application/json
```

درخواست frozen در Sprint 2.5:

```json
{
  "subject": "stable-web-subject",
  "tokenIssuedAt": 1795161600,
  "jti": "verified-assertion-jti"
}
```

پاسخ موفق frozen:

```json
{
  "version": 1,
  "subject": "stable-web-subject",
  "status": "active",
  "role": "user",
  "support": { "allowed": true, "staff": false },
  "authorizationCacheMaxAgeSeconds": 60,
  "checkedAt": "2026-11-20T08:00:00.000Z",
  "requestId": "fixture-chat-correlation-1"
}
```

`tokenIssuedAt` و `jti` فقط از assertion تأییدشده با امضا کپی می‌شوند تا Web صدور را با `authRevokedBefore` مقایسه کند؛ Chat به مقدار مرورگر اعتماد نمی‌کند. statusهای مجاز `active`، `disabled`، `revoked` و `deleted` هستند. پاسخ باید subject دقیق، role محدود، هر دو boolean پشتیبانی، timestamp معتبر و cache instruction صحیح بین ۰ تا ۶۰ داشته باشد.

عمر cache معمول کمترین مقدار بین دستور Web، `OWJ_IDENTITY_STATUS_CACHE_MS` و ۶۰ ثانیه است. concurrency پیش‌فرض status برابر ۱۶ و سقف runtime برابر ۶۴ است. بررسی‌های همسان درحال‌اجرا coalesce می‌شوند. bootstrap و reply/assign/resolve کارشناس refresh اجباری دارند؛ read/session/realtime passive می‌توانند cache معتبر را مصرف کنند. رد role staff فقط sessionهای `agent` همان subject را revoke می‌کند؛ disabled/revoked/deleted یا رد کلی support گسترده‌تر است. outage، timeout، پاسخ نامعتبر یا cache منقضی fail closed هستند. guest هرگز از status registered استفاده نمی‌کند.

### متادیتای افزایشی assertion در session پشتیبانی

session جدید registered و agent فیلدهای اختیاری `identity_issued_at` و `bootstrap_jti` را ذخیره می‌کند. اولی `iat` تأییدشده به Unix seconds و دومی `jti` یک‌بارمصرف تأییدشده است. validator مونگو این دو را مجاز می‌کند ولی در required قرار نمی‌دهد؛ در نتیجه سند موجود به migration مخرب یا بازنویسی نیاز ندارد.

session مهمان قدیمی این فیلدها را لازم ندارد. session غیرمهمان قدیمی که یکی از آن‌ها را ندارد نمی‌تواند در برابر revocation جاری Web بررسی شود؛ fail closed می‌شود و باید با assertion/session تازه re-bootstrap شود. rollback نباید برای رکورد قدیمی متادیتا جعل کند.

### پذیرش واقعی Web در محیط محلی

درخواست اول به Image قدیمی Web، mismatch قبلی را با `400 IDENTITY_REFERENCE_INVALID` آشکار کرد؛ Chat client خود را ضعیف نکرد. بعد از rebuild وب از سورس هم‌راستا، container واقعی Chat بدنه `{subject,tokenIssuedAt,jti}` را فرستاد و پاسخ تخت HTTP 200 شامل role حروف‌کوچک Web، policy پشتیبانی، سقف cache برابر ۶۰ ثانیه، timestamp و correlation ID بازتاب‌شده گرفت.

پذیرش مصنوعی محلی سپس bootstrap/resume/history کاربر registered، bootstrap/queue/assignment/reply کارشناس و revocation وضعیت جاری را پاس کرد. تغییر موقت و Web-owned فیلد `authRevokedBefore` باعث شد session موجود registered پاسخ `401 SUPPORT_SESSION_REVOKED` بگیرد؛ سپس fixture اختصاصی restore و active/non-revoked بودن آن تأیید شد. این نتیجه request/response دقیق را برای revision محلی تست‌شده ثابت می‌کند، نه migration تولید، همه transitionهای disabled/deleted/role یا window واقعی rotation با کلید قبلی.

fixture مرجع از `docs/platform/fixtures/support-v1/manifest.json` شروع می‌شود و `identity-status.json` این مرز request/response را freeze می‌کند.

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
- مسیر `POST /api/internal/v1/identity/status` مطابق درخواست frozen `{subject,tokenIssuedAt,jti}` و پاسخ role/support/cache، همراه credential خروجی ۳۲ کاراکتری Chat.
- قرارداد بازبینی‌شده Proof برای پیوند حساب با شناسه‌های دقیق.
- قرارداد بازبینی‌شده Proof برای تبدیل مهمان به کاربر ثبت‌شده.
- یکپارچه‌سازی Same-Origin مربوط به Reverse Proxy/Cookie و Contract Test واقعی بین Web و Chat.

endpoint واقعی محلی Web اکنون مرز status مشترک و flowهای مصنوعی registered/staff/revocation را پاس کرده است. cohort تولید را تا عبور browser automation، rotation با کلید قبلی، TLS/proxy شبیه تولید، restore/rollback، اندازه‌گیری منابع و gate مهاجرت identity-link بازبینی‌شده فعال نکنید.
