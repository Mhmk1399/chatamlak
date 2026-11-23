# SSO بومی Chat ↔ Web نسخه ۱

وضعیت: **در سمت Chat پیاده‌سازی و محلی آزمایش شده است**. Owj Web مرجع هویت است و Chat نشست مات خودش را صادر و مالک می‌شود.

## حالت‌ها و پیکربندی

`OWJ_CHAT_NATIVE_AUTH_MODE` یکی از `federated` یا `local_test` است. پیش‌فرض runtime در تست `local_test` و در غیر آن `federated` است. `.env.example` حالت `federated` را انتخاب می‌کند و `docker-compose.local.yaml` با `APP_ENV=development` صریحاً `local_test` را فعال می‌کند. startup در `APP_ENV=production` حالت `local_test` را رد می‌کند.

حالت فدره‌شده نیاز دارد:

| متغیر | کاربرد |
|---|---|
| `OWJ_CHAT_NATIVE_WEB_AUTHORIZE_URL` | مقصد POST فرم مرورگر، معمولاً `/api/v1/chat/authorize` وب |
| `OWJ_CHAT_NATIVE_WEB_EXCHANGE_URL` | endpoint تبادل سرور، `/api/internal/v1/chat/exchange` وب |
| `OWJ_CHAT_NATIVE_WEB_STATUS_URL` | endpoint وضعیت جاری سرور، `/api/internal/v1/chat/identity/status` وب |
| `OWJ_CHAT_NATIVE_REDIRECT_URI` | URI دقیق callback؛ اگر از `APP_PUBLIC_URL` به‌شکل `/auth/web/callback` قابل استخراج باشد اختیاری است |
| `OWJ_CHAT_NATIVE_TO_WEB_SERVICE_TOKEN` | Bearer اختصاصی Chat-native → Web با حداقل ۳۲ نویسه |

URLها باید HTTPS باشند. HTTP فقط خارج تولید با `OWJ_WEB_ALLOW_INSECURE_HTTP=true` مجاز است.

## جریان مرورگر و سرور

1. `POST /api/auth/web/start` یک تراکنش پنج‌دقیقه‌ای می‌سازد. Chat، state، verifier/challenge از نوع PKCE (`S256`) و browser token جداگانه تولید می‌کند. فقط digestهای state/browser به‌همراه verifier و redirect URI دقیق در `native_web_auth_transactions` ذخیره می‌شوند.
2. Chat آدرس authorization وب و فیلدهای فرم `version=1`، `redirectUri` دقیق، `state`، `codeChallenge` و `codeChallengeMethod=S256` را برمی‌گرداند. SPA یک POST فرم cross-origin انجام می‌دهد و از bearer token API استفاده نمی‌کند.
3. Chat کوکی host-only به نام `owj_chat_auth_tx` با `HttpOnly`، `SameSite=Lax`، مسیر `/api/auth/web` و در HTTPS تولید با `Secure` تنظیم می‌کند.
4. وب مرورگر را به `/auth/web/callback` برمی‌گرداند. SPA فقط `code` و `state` را به `POST /api/auth/web/callback` می‌فرستد؛ کوکی تراکنش مرورگر را مقید می‌کند. Chat تراکنش را اتمیک و یک‌بار مصرف می‌کند.
5. Chat کد را سروربه‌سرور با `Authorization: Bearer <server-only>`، هدر `X-Owj-Service: owj-chat-native` و بدنهٔ `{version:1,code,redirectUri,codeVerifier,state}` تبادل می‌کند.
6. پس از پاسخ فعال، Chat پیوند دقیق را resolve/provision کرده و کوکی مات `sid` خودش را صادر می‌کند. authorization code، service credential و پاسخ authorization وب هرگز اعتبارنامهٔ مرورگر نمی‌شوند.

پاسخ موفق exchange/status نسخهٔ ۱، شامل `subject` دقیق، `accountStatus:"active"`، `scopes`، زمان‌های مجوز/نشست، دستور cache بین ۰ تا ۶۰ ثانیه و `crmActorAuthorization` کوتاه‌عمر اختیاری است. scopeهای مجاز `chat:access`، `chat:call`، `chat:staff` و `chat:admin` هستند و `chat:access` الزامی است.

## بازاعتبارسنجی نشست و مجوز

نشست Chat فدره‌شده `auth_kind=web_federated`، subject/scopeهای وب، زمان‌های ایجاد/بررسی مجوز، انقضای نشست وب، سقف cache و اثبات اختیاری CRM را نگه می‌دارد. Chat برای status این بدنه را می‌فرستد:

```json
{
  "version": 1,
  "subject": "507f1f77bcf86cd799439011",
  "authorizationEstablishedAt": "2026-11-23T08:00:00.000Z",
  "crmActorAuthorization": "<optional-server-only-proof>"
}
```

cache مجوز محلی هرگز بیش از ۶۰ ثانیه نیست. عملیات حساس می‌تواند refresh اجباری کند. رد قطعی با `401`، `403`، `404` یا `410` نشست Chat را حذف می‌کند. timeout، پاسخ خراب و خطای گذرای upstream درخواست را fail-closed می‌کند ولی نشست را به‌اشتباه لغوشده ثبت نمی‌کند.

تماس فدره‌شده نیازمند `chat:call` است. scope وب فقط مجوز وب را توصیف می‌کند؛ `chat:admin` کاربر پیوندخورده را به admin یا owner بومی Chat ارتقا نمی‌دهد.

## سیاست صریح پیوند هویت

- رکورد فعال و دقیق `platform_identity_links` دوباره استفاده می‌شود.
- برای subject تأییدشدهٔ بدون پیوند، یک حساب جدا و پیوند یک‌به‌یک ساخته می‌شود؛ نام داخلی ضدتصادم است و از دادهٔ پروفایل match نمی‌شود.
- Chat هرگز براساس نام کاربری، ایمیل، nickname، تلفن یا متن پیام پیوند/ادغام خودکار نمی‌کند.
- حساب بومی مستقل و تاریخی UUID و تاریخچهٔ خود را نگه می‌دارد. پیوند آن نیازمند جریان صریح، تأییدشده و مصوب جداگانه است؛ SSO عادی آن را ضمنی تصاحب نمی‌کند.
- پیوند متعارض، لغوشده یا غیرفعال fail-closed است. نگاشت subject وب و کاربر Chat یک‌به‌یک و auditشده است.

## سازگاری local-test و رابط

در `local_test` مسیرهای `/api/login` و `/api/register` موجودند و شروع SSO پاسخ `WEB_FEDERATION_DISABLED` می‌دهد. اطلاعات برنامه auth mode را نشان می‌دهد و ثبت‌نام در federation غیرفعال است. رابط «ورود با اوج» را از «حالت آزمایشی بومی» جدا می‌کند و حالت‌های loading، access denied، expired، unavailable، linked و account-link required را با RTL/dark mode، semantics هشدار/وضعیت و کنترل‌های حداقل ۴۴ پیکسل ارائه می‌دهد.

نمونه‌های مصنوعی start/exchange/status در [`fixtures/chat-sprint4-v1/native-web-sso.json`](../../platform/fixtures/chat-sprint4-v1/native-web-sso.json) هستند.

