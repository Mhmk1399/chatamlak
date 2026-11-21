# تحویل Sprint 2 در Owj Chat

تاریخ: 2026-11-20

Repository/Service: سامانه Owj Chat (`chatamlak`) مالک گفتگوها، پیام‌ها، نشست‌های پشتیبانی، تخصیص، تحویل بلادرنگ و پردازش Media در Chat است. Owj Web همچنان مالک هویت مرجع انسانی، Login/OTP، Roleهای سراسری و وضعیت حساب است.

## وضعیت اجرایی

Sprint 2 در این درخت منبع، Backend هویت و پشتیبانی سمت Chat را به‌شکل پیاده‌سازی‌شده و دارای Feature Flag دارد. این **ادعای آمادگی Production یا تکمیل Rollout بین Repositoryها نیست**.

- مقدار پیش‌فرض `OWJ_SUPPORT_ENABLED` برابر `false` است.
- در این Sprint هیچ سرویس Production، پایگاه‌داده، پیکربندی Nginx، Image Registry، Deployment، Commit یا Push عمداً تغییر نکرد.
- صدور Assertion واقعی توسط Owj Web، Rotation کلید JWKS، مجوزدهی Status، تنظیم Cookie توسط BFF و رفتار سرتاسری رابط Web هنوز همراه Chat اثبات نشده‌اند.
- Topology محلی Docker متعلق به Chat، بررسی‌های Runtime محدود ثبت‌شده در ادامه را با موفقیت گذراند. این نتیجه، Owj Web، Reverse Proxy مشترک، Deployment در Production یا Capacity در Production را اعتبارسنجی نمی‌کند.
- شناسه‌ها، پیام‌ها، عضویت‌ها و Attachmentهای موجود Chat همچنان مرجع‌اند. مدل هویت Sprint 2 افزایشی است.

## دفتر Milestoneها

| Milestone | وضعیت کد منبع | مورد پیاده‌سازی‌شده | Gate باقی‌مانده برای پذیرش |
|---|---|---|---|
| CHAT-S2-01 | محلی پیاده‌سازی شده | Verifier نوع RS256/JWKS، Claimهای دقیق، Policyهای Token-Use/Scope، ماندگاری JTI یک‌بارمصرف، Cache محدود کلید | تست در برابر Issuer/JWKS واقعی Web و رفتار Rotation |
| CHAT-S2-02 | بخشی یکپارچه شده | Link افزایشی یک‌به‌یک، یکتایی، سرویس Link مبتنی بر Proof، مدیریت Conflict/Idempotency، CLI مهاجرت فقط-محلی | Endpoint/Workflow متعلق به Web برای Link Proof و نگاشت/مهاجرت بازبینی‌شده Production |
| CHAT-S2-03 | محلی پیاده‌سازی شده | Bootstrap داخلی احرازشده، اعتبارسنجی Assertion، انتخاب Idempotent گفتگو، نشست پشتیبانی مات و Digestشده | یکپارچه‌سازی واقعی Web BFF برای Service Auth و Cookie |
| CHAT-S2-04 | جزئی | Bootstrap مهمان، Conversation/Session/Actionهای ایزوله، اتصال مجدد/Logout، Persistence آماده و Idempotent تبدیل | Compose و ارائه Workflow سرتاسری تبدیل مهمان با Proof متعلق به Web |
| CHAT-S2-05 | محلی پیاده‌سازی شده | Routeهای HTTP نسخه‌دار Customer/Staff با Pagination محدود و پیام Idempotent | Contract Test با Widget واقعی Web و Client کارکنان |
| CHAT-S2-06 | محلی پیاده‌سازی شده | WS/SSE بومی پشتیبانی، Origin سخت‌گیرانه، Replay/Deduplication، محدودیت‌ها، انقضا/لغو؛ اعتبارسنجی مجدد نشست باز Chat بومی | تست واقعی Reverse Proxy، Reconnect، Rolling Version و مرورگر |
| CHAT-S2-07 | در برابر قرارداد Mock پیاده‌سازی شده | Client وضعیت Chat→Web، Token جهت‌دار سرویس، Cache حداکثر ۶۰ ثانیه، Writeهای Fail-Closed، لغو نشست | سازگاری واقعی Endpoint/Credential وب و تمرین Outage |
| CHAT-S2-08 | Backend پیاده‌سازی شده | APIهای Queue/Detail/Reply، اتصال Transactional تخصیص+عضویت، Resolve/Close نوع Idempotent و اعلان‌های Inbox بدون تکرار | UI کارکنان و یکپارچه‌سازی واقعی Eligibility نقش Web |
| CHAT-S2-09 | با محدودیت‌های ثبت‌شده پیاده‌سازی شده | Callهای HMAC به Worker، جلوگیری از Replay، اعتبارسنجی مقصد، انقضای نشست باز، Runner مبتنی بر MongoDB برای Jobهای Media با Memory Fallback | تست Runtime/Restart مربوط به Media؛ محدودیت باقیمانده DNS TOCTOU |
| CHAT-S2-10 | محلی اعتبارسنجی شده | Build نهایی Image، سلامت Chat/Worker/MongoDB، Containerهای برنامه Non-Root و با Root فقط خواندنی، Replica Set احرازشده، User اختصاصی DB، Portهای داخلی، Named Volume قابل نوشتن و ماندگاری پیام پس از Restart فقط-Chat | Capacity در Production و Topology مشترک Web/Proxy همچنان کار پذیرش جداگانه‌اند |
| CHAT-S2-11 | جزئی | اجرای کامل Server/MongoDB واقعی/Worker/Client Unit به‌علاوه Caseهای محلی 20 و 21؛ Mockهای سخت‌گیرانه قراردادهای هویت/پشتیبانی سمت Chat را پوشش می‌دهند | Case 23 اجرا نشد؛ Case 24 جزئی است؛ Web+Chat واقعی، رفتار Reverse Proxy/Browser و ماندگاری Media Job پس از Restart هنوز اثبات نشده‌اند |

Sprint کلی باید تا تکمیل Milestoneهای جزئی و Gateهای پذیرش خارجی باز بماند.

## تغییرات Identity Adapter

فایل‌های اصلی:

- `server/lib/webIdentityVerifier.js`
- `server/lib/platformIdentityAdapter.js`
- `server/lib/webIdentityStatusClient.js`
- `server/lib/platformIdentityLinkService.js`
- `server/db/platformIdentitySchema.js`
- `server/db/platformIdentityRepository.js`
- `server/db/mongoSchema.js`
- `server/db/mongoRepository.js`

قرارداد پیاده‌سازی‌شده:

- JWT فشرده با `alg=RS256`، مقدار الزامی `kid`، مقدار دقیق پیکربندی‌شده `iss` و `aud=owj-chat`؛
- Claimهای الزامی `sub`، `iat`، `exp`، `jti`، `token_use` و `scope`؛
- حداکثر عمر پنج دقیقه برای `support_registered` و `support_agent`؛
- حداکثر عمر ده دقیقه برای `support_guest`؛
- Allowlist دقیق Scopeها؛ Bootstrap عامل به `support:agent` به‌علاوه `support:conversation:create` نیاز دارد؛
- مصرف پایدار Assertion یک‌بارمصرف با ترکیب یکتای `(issuer, jti)` و TTL در MongoDB؛
- اندازه/تعداد کلید/عمر Cache محدود برای پاسخ JWKS، Throttle شدن Refresh در `kid` ناشناخته و نبود Redirect؛
- رد HMAC/JWT قدیمی Web، الگوریتم ناشناخته، Header بحرانی، Assertion بدساخت/آینده/منقضی، Scope اضافه و Replay؛
- `platform_identity_links` افزایشی و یک‌به‌یک؛ بدون Auto-Merge بر اساس Username، Phone یا Display Name؛
- مجوزدهی Current-State از طریق API احرازشده Status متعلق به Web، نه Claim مرورگر.

Schema دقیق Token و Request/Response وضعیت در [CHAT_WEB_IDENTITY_MIGRATION.md](./CHAT_WEB_IDENTITY_MIGRATION.md) است.

## راهبرد مهاجرت حساب‌های موجود

فایل‌ها:

- `server/lib/platformIdentityMigration.js`
- `server/scripts/platform-identity-migrate.js`

CLI فعلی فقط Array صریح JSON شامل `provider`، `webUserId`، `chatUserId` و `linkedByWebUserId` اختیاری را می‌پذیرد. هویت را هرگز از Username، شماره تلفن یا محتوای پیام حدس نمی‌زند.

اجرای پیش‌فرض Validation/Dry Run بدون پایگاه‌داده است. `--apply` عمداً به URI صریح و محلی MongoDB روی Loopback، نام پایگاه‌داده‌ای که Disposable به‌نظر می‌رسد و تایید اضافی `--disposable-local` محدود است. Userهای مقصد Chat و تداخل‌های موجود یک‌به‌یک را بررسی و سپس درج‌های افزایشی Idempotent انجام می‌دهد. پیام یا عضویت تاریخی را ویرایش نمی‌کند.

این یک ابزار اعتبارسنجی محلی است، **نه Runner مهاجرت Production**. فاز Production آینده به منبع نگاشت تاییدشده، تمرین Backup و Restore، بازبینی Conflict، مسیر Apply با مجوز جداگانه، Batchهای قابل مشاهده، Export مربوط به Rollback و تصمیم درباره Compatibility Window نیاز دارد. Rollback یعنی پس از اثبات نبود نشست فعال وابسته، Link افزایشی را غیرفعال/حذف کنید؛ هرگز شناسه‌های تاریخی Chat را بازنویسی نمی‌کند.

ورود محلی موجود Chat موقتاً مسیر سازگاری برای حساب‌های بومی مهاجرت‌نکرده است. نباید مسیر احراز هویت بازدیدکننده وب‌سایت شود.

## Backend پشتیبانی

فایل‌های اصلی:

- `server/api/support.js`
- `server/lib/supportRuntime.js`
- `server/lib/supportSessions.js`
- `server/lib/supportSessionStore.js`
- `server/lib/supportRealtime.js`
- `server/db/mongoSupport.js`
- `server/index.js`
- `server/api/index.js`

Chat موارد زیر را ارائه می‌دهد:

- فقط Backend وب: `POST /internal/v1/support/bootstrap`؛
- مشتری: `GET /support/v1/session`، `GET/POST /support/v1/messages`، `GET /support/v1/events`، Upgrade بومی `/support/v1/ws` و `POST /support/v1/logout`؛
- Staff: List/Detail/Reply/Assign/Resolve زیر `/support/v1/staff/conversations`.

Bootstrap از Service Auth نوع HMAC متصل به Timestamp/Nonce/Request، یک `Idempotency-Key` و Assertion یک‌بارمصرف Web استفاده می‌کند. Credential مات `ocs_*` را فقط به Web برمی‌گرداند. Chat فقط Digest آن را ذخیره می‌کند. انتظار می‌رود Web، `owj_support_sid` را با `Path=/support/v1`، `HttpOnly`، `SameSite=Lax` و در Production با `Secure` تنظیم کند.

نشست پشتیبانی یک کلاس محدود مجوزدهی است. عمر پیش‌فرض Idle و Absolute به‌ترتیب ۳۰ دقیقه و ۱۲ ساعت است. Actionهای مشتری به Session/Messages/Events/Logout محدودند. Agent به Assertion واقعی `support_agent` و Scope نوع `support:agent` نیاز دارد؛ Chat همچنان Assignment و Lifecycle گفتگو را Enforce می‌کند.

هویت مهمان به‌صورت Subject Binding مشتق‌شده از Digest ذخیره می‌شود. مهمان نمی‌تواند گفتگوی دلخواه انتخاب کند یا به APIهای بومی Chat برای Discovery/Admin/CRM/Analytics دسترسی داشته باشد. Primitiveهای تبدیل Guest به Registered گفتگو را حفظ می‌کنند، به شناسه Proof نیاز دارند و Idempotent هستند، اما Web Proof Verifier و Endpoint هماهنگ‌کننده عمومی/داخلی هنوز Compose نشده‌اند. Retry پیام برای `(conversation, actor, clientRequestId)` استفاده‌شده به Body یکسان نیاز دارد؛ Body متفاوت خطای `409 SUPPORT_IDEMPOTENCY_CONFLICT` می‌دهد.

شکاف شناخته‌شده محصول: هویت Resolved/Closed در حال حاضر همان گفتگوی موجود و غیرقابل‌دسترس را Resume می‌کند؛ Policy مربوط به Reopen/New Case پیاده‌سازی نشده است.

قرارداد کامل Request، Response، Cookie، Error و Rate Limit در [CHAT_SUPPORT_API_CONTRACT_V1.md](./CHAT_SUPPORT_API_CONTRACT_V1.md) است.

## امنیت Realtime و نشست

فایل‌های مرتبط Transport عبارت‌اند از `server/lib/supportRealtime.js`، `server/lib/sse.js` و `server/lib/websocketGateway.js`.

WebSocket و SSE پشتیبانی از همان Cookie و Action Check استفاده می‌کنند، `Origin` موجود در Allowlist را الزامی می‌دانند، Fan-out را به یک گفتگو متصل می‌کنند و مجوز را به‌صورت پیش‌فرض هر ۱۵ ثانیه دوباره اعتبارسنجی می‌کنند. پیش‌فرض‌های WS شامل سقف Payload برابر 16 KiB، ۲۰ اتصال برای هر IP، چهار Subscription در Hub برای هر نشست پشتیبانی، مهلت پنج‌ثانیه‌ای احراز هویت و Liveness از طریق Ping/Pong است.

Replay پایدار `chat_message` از Journal رویداد Chat در MongoDB خوانده می‌شود، به Envelope نسخه ۱ پشتیبانی نرمال می‌شود و از Cursor پایدار پیام استفاده می‌کند. اعلان‌های Queue/Assignment/Lifecycle شامل Eventهای درون‌پردازه‌ای هستند؛ Staff باید پس از Restart، Queue مربوط به HTTP را دوباره Fetch کند. Replay به ۲۰۰ رکورد محدود است و `hasMore`/`gap` را هم هنگام تکمیل اتصال SSE و هم Resume وب‌سوکت گزارش می‌کند. Clientها باید صفحه‌ها را مصرف و Deduplicate کنند و هنگام گزارش Gap، State مرجع را دوباره Fetch کنند.

مسیرهای WebSocket/SSE بومی Chat با Cookie نوع `sid` نیز اکنون نشست‌های از قبل باز را دوره‌ای دوباره اعتبارسنجی می‌کنند و بدون افزودن Socket.IO یا Broker دیگر، Gap انقضای Sprint 1 را برطرف می‌کنند. احراز هویت پشتیبانی همیشه انقضا را اعمال می‌کند، یک Task محدود ساعتی رکوردهای منقضی نشست پشتیبانی را پاک می‌کند و هنگام Shutdown برنامه، Runtime مربوط به WS/SSE پشتیبانی و Timerهای آن بسته می‌شوند.

[CHAT_REALTIME_PROTOCOL_V1.md](./CHAT_REALTIME_PROTOCOL_V1.md) را ببینید.

## قابلیت اطمینان Media و Worker

فایل‌های اصلی:

- `shared/serviceAuth.js`
- `server/api/remoteMirror.js`
- `server/api/uploadsRemote.js`
- `worker/index.js`
- `server/db/mongoMediaJobs.js`
- `server/lib/durableMediaQueue.js`
- `server/lib/mediaWorker.js`
- `server/db.js`
- `server/index.js`

مسیرهای Dispatch و Callback مربوط به Worker از احراز هویت HMAC متصل به Timestamp/Nonce با Replay Cache محدود پشتیبانی می‌کنند. اعتبارسنجی سخت‌گیرانه با `WORKER_REQUIRE_SIGNED_REQUESTS` کنترل می‌شود و در Topology محلی Compose ارائه‌شده فعال است. Worker مستقل به‌طور پیش‌فرض `WORKER_ALLOW_LOOPBACK_URLS` را false می‌گذارد، Redirect را رد می‌کند و آدرس‌های حل‌شده مقصد را در برابر Rangeهای Private/Reserved و Allowlist صریح Origin اعتبارسنجی می‌کند. فقط Manager قدیمی Child Worker که عمداً Co-located است، Loopback را صریحاً فعال می‌کند.

Repository نوع `media_processing_jobs` در MongoDB و Runner محدود آن، وقتی Queue قدیمی در حالت دیگری In-Memory می‌شد، Wire شده‌اند. Schema Initializer برای Collection جدید Validator سخت‌گیرانه می‌سازد و اگر Validator نصب‌شده دقیقاً یکسان باشد، `collMod` را اجرا نمی‌کند. Validator متفاوت موجود به Migration صریح، یک‌باره و Privileged با `collMod` نیاز دارد؛ این مجوز مدیریت پایگاه‌داده را به User عادی Runtime مربوط به Chat ندهید. Jobها به‌صورت یکتا Deduplicate می‌شوند، با بازیابی Lock قدیمی Claim می‌شوند، با Backoff/Attempt محدود Retry می‌شوند و رکوردهای Complete از BSON `Date` سازگار با Index نوع TTL هفت‌روزه استفاده می‌کنند. Concurrency پیش‌فرض یک است؛ Shutdown برنامه منتظر بسته‌شدن Runner و Media Manager می‌ماند.

محدودیت باقی‌مانده: Validation و اتصال HTTP بعدی همان آدرس حل‌شده را Pin نمی‌کنند و یک پنجره DNS Rebinding/Time-of-Check-to-Time-of-Use باقی می‌گذارند. از Allowlist محدود Origin مربوط به Worker و Network خصوصی استفاده کنید؛ مقصد دلخواه User را قابل اعتماد تلقی نکنید.

## Topology محلی Docker

فایل‌ها:

- `docker-compose.local.yaml`
- `docker-compose.yaml`
- `worker/docker-compose.yaml`
- `scripts/local-mongo-init.sh`
- `Dockerfile`
- `worker/Dockerfile`
- `.env.example`

Topology محلی یک Replica Set تک‌گره‌ای و احرازشده MongoDB 8 (`ouj-rs`)، User اختصاصی Read/Write محدود به `ouj_chat`، Chat و Media Worker جداگانه دارد. Mongo Server به‌طور پیش‌فرض `${MONGO_IMAGE:-mongo:8.2.7}` است، زیرا `mongo:8.0.34` هنگام اعتبارسنجی Kernel نسخه 7.0.0 میزبان Ubuntu فعلی را رد کرد. Portهای سرویس فقط در Network داخلی `ouj-platform-internal` در دسترس‌اند. Containerهای برنامه با uid/gid برابر 1000، Root فقط خواندنی، Data Volume نام‌گذاری‌شده و قابل نوشتن، tmpfs، Capabilityهای Dropشده، سقف PID/منابع و بدون Docker Socket اجرا می‌شوند.

سقف‌های موقت Chat برابر 400 MiB/0.75 CPU، Worker برابر 600 MiB/1 CPU و MongoDB برابر 1536 MiB/1.25 CPU هستند. این سقف‌های تست‌اند و مدرک Capacity اندازه‌گیری‌شده Production نیستند. پیش‌فرض Pool/Concurrency محدود است (`MONGODB_MAX_POOL_SIZE=10` در Compose محلی و Concurrency مربوط به Worker برابر 1).

دستورها و هشدارهای Reset مخرب در [CHAT_LOCAL_DOCKER_TESTING.md](./CHAT_LOCAL_DOCKER_TESTING.md) مستند شده‌اند.

## مالکیت داده، حریم خصوصی و اثر منابع

- Collectionهای جدید/گسترش‌یافته متعلق به Chat: `platform_identity_links`، `platform_identity_assertion_jtis`، `support_guest_identity_links`، `support_conversations`، `support_sessions` و `media_processing_jobs`.
- Chat هرگز Collectionهای Web را نمی‌خواند یا نمی‌نویسد. فقط Assertion/پاسخ Status حداقلی را از قراردادهای احرازشده دریافت می‌کند.
- هیچ داده عمومی Analytics/Divar یا پروفایل مشتری CRM توسط این موارد پشتیبانی ذخیره نمی‌شود. پیام پشتیبانی محتوای خصوصی Chat باقی می‌ماند و نباید وارد Log/Event عمومی شود.
- هزینه درخواست جدید شامل Callهای HTTP محدود JWKS/Status، Lookup/Writeهای MongoDB پشتیبانی و Queryهای محدود Replay است. هر صفحه Durable Replay حداکثر ۲۰۱ ردیف Journal، یک رکورد گفتگوی پشتیبانی و Metadata پروجکت‌شده Author/Timestamp برای حداکثر ۲۰۰ شناسه پیام می‌خواند. عمر Cache وضعیت حداکثر ۶۰ ثانیه است؛ Cache مربوط به JWKS محدود است؛ Poolهای Mongo مشترک و محدود باقی می‌مانند.
- Realtime برای هر Transport مرورگر یک اتصال مجاز اضافه می‌کند که بر اساس IP/Session سقف دارد. صفحه Replay حداکثر ۲۰۰، صفحه پیام حداکثر ۱۰۰ و متن حداکثر ۴٬۰۰۰ کاراکتر/16 KiB است.
- دوام Media یک Collection کوچک و Indexشده Job و یک Polling Runner در پیکربندی Memory-Fallback اضافه می‌کند. Redis، Kafka، Socket.IO یا پردازه MongoDB دیگری اضافه نمی‌کند.

## رکورد اعتبارسنجی

سطح مستقیم تست Sprint 2 در فایل‌های زیر نمایندگی می‌شود:

- هویت/Link/Migration: `server/test/lib/webIdentityVerifier.test.js`، `platformIdentityAdapter.test.js`، `webIdentityStatusClient.test.js`، `platformIdentityLinkService.test.js`، `platformIdentityMigration.test.js`، `server/test/db/platformIdentityRepository.test.js`، `platformIdentitySchema.test.js`، `server/test/scripts/platformIdentityMigrationCli.test.js` و `server/test/mongo/platformIdentity.test.js`؛
- پشتیبانی/Session/Realtime: `server/test/api/support.test.js`، `server/test/lib/supportRuntime.test.js`، `supportSessions.test.js`، `supportSessionStore.test.js`، `supportRealtime.test.js`، `server/test/mongo/support.test.js` و نیز پوشش بومی `sse.sessionRevocation.test.js` و `websocketGateway.test.js`؛
- قابلیت اطمینان/Deployment: `server/test/lib/serviceAuth.test.js`، `mediaWorker.test.js`، `durableMediaQueue.test.js`، `server/test/db/mongoMediaJobs.test.js`، `server/test/deploymentSecurity.test.js`، `worker/test/server.test.js` و `worker/test/mirror.test.js`.

این فقط فهرست سطح تست است، نه ادعای اینکه همه فایل‌ها پس از هر ویرایش نهایی دوباره اجرا شده‌اند. نتایج دستورهای زیر مرز شواهد هستند.

شواهد نهایی دستورها از وضعیت کد منبع Sprint 2:

| بررسی | نتیجه |
|---|---|
| `npm --prefix server test` | **موفق:** ۱۴۰ فایل و ۱٬۱۸۹/۱٬۱۸۹ تست |
| `npm --prefix server run test:mongo` | **موفق:** ۸ فایل و ۵۶/۵۶ تست در Suite واقعی و Disposable مربوط به Replica Set |
| Suite کامل Worker | **موفق:** ۶ فایل و ۴۶/۴۶ تست |
| `npm --prefix client run test:unit` | **موفق:** ۴۸ فایل و ۴۵۷/۴۵۷ تست |
| Build مربوط به Production در Client | **موفق؛** دو Warning موجود درباره Dynamic Import بی‌اثر باقی ماند |
| Lint مربوط به Client | **ناموفق:** کلید تکراری `Ouj Chat` از قبل موجود در `client/src/i18n/fa-ui.js` به‌علاوه پنج Warning. این فایل پیش از Sprint 2 وجود داشت و در این کار تغییر نکرد |
| اجرای Browser در Client | **جزئی/ناموفق:** ۶۶ فایل موفق و ۵ فایل ناموفق؛ Chromium در ۸۰۸/۸۱۵ تست موفق شد و ۷ شکست داشت؛ Binary مرورگر Firefox نیز موجود نبود. شکست‌های گزارش‌شده تست‌های UI موجود و نامرتبط با Sprint 2 هستند؛ این ردیف ادعای سبزبودن Suite مرورگر نیست |
| `npm run docs:build` | **موفق** در اجرای نهایی پس از تطبیق شواهد انگلیسی/فارسی |
| `docker compose ... config --quiet` | **موفق** با Credentialهای مصنوعی زیر `/tmp` |
| Rebuild نهایی Image در Docker | **موفق** |
| Startup محلی Compose | **موفق:** MongoDB، Chat و Worker سالم بودند |
| بررسی مرز Containerها | **موفق:** Chat و Worker به‌صورت Non-Root، با Root فقط خواندنی و Named Volume قابل نوشتن مورد انتظار اجرا شدند |
| Replica/User/Isolation | **موفق:** MongoDB در `ouj-rs` حالت Primary داشت؛ User مربوط به Chat دقیقاً `readWrite` روی `ouj_chat` داشت؛ خواندن `ouj_business_local` با کد 13 در MongoDB رد شد |
| ماندگاری پیام پس از Restart شدن Chat | **موفق:** پس از Write پیام در Repository و Restart فقط Chat، همان پیام دوباره خوانده شد |
| ماندگاری Media Job پس از Restart | **اجرا/اثبات نشد؛** این مورد مستقل از ماندگاری پیام است |
| Issuer/Status/Bootstrap/Widget واقعی Web+Chat | **اجرا نشد** |
| Cookie/SSE/Upgrade وب‌سوکت در Reverse Proxy واقعی | **اجرا نشد** |

Stack با `down` عادی متوقف شد و سه Named Volume آن نگه داشته شدند. هیچ داده یا Deployment مربوط به Production درگیر نبود.

مرز شواهد Caseهای یکپارچه‌سازی Sprint 2 به‌شکل زیر است:

| Case | نتیجه |
|---|---|
| 20 — ماندگاری پیام پس از Restart فقط-Chat | **موفق** |
| 21 — Credential جداگانه پایگاه‌داده Chat و رد دسترسی بین پایگاه‌داده‌ها | **موفق** |
| 23 — رفتار Cookie/SSE/WebSocket بومی در Reverse Proxy | **اجرا نشد** |
| 24 — در دسترس ماندن Web هنگام Restart شدن Chat | **جزئی:** Restart/Readback مربوط به Chat موفق بود، اما هیچ پردازه Web اجرا نمی‌شد |

Suiteهای Server، MongoDB واقعی، Worker و Client Unit سبز هستند. نتیجه‌های شناخته‌شده Lint/Browser در Client و بررسی‌های اجرا‌نشده Web/Proxy/Media در بالا یعنی پذیرش کل Repository و بین Repositoryها هنوز کاملاً سبز نیست.

## وابستگی‌های حل‌نشده Web

1. مقدار دقیق Production برای `OWJ_WEB_ISSUER` و URLهای HTTPS مربوط به JWKS/Status.
2. Lifecycle کلید RS256 در Web، هم‌پوشانی کلید فعلی/بعدی و Fixtureهای امضاشده برای هر سه Token Use.
3. Bootstrap Signer متناظر HMAC با Canonicalization دقیق Method/Path/Timestamp/Nonce.
4. Credential جهت‌دار سرویس Bearer برای Chat→Web و مجوز Least-Privilege وضعیت.
5. تنظیم/حذف Cookie توسط BFF و Proxy Routing برای `/support/v1/*` شامل Upgrade وب‌سوکت و بافرینگ SSE.
6. Workflowهای تاییدشده متعلق به Web برای Account Link و Guest Conversion.
7. Policy مربوط به Role/Account State در Web برای Eligibility کارکنان و Userهای Disabled/Deleted.
8. رفتار محصول برای Reopen یا ساخت Case جدید پس از Resolution.

## الزامات مهاجرت و Rollout در Production

1. تست‌های باقی‌مانده Restart مربوط به Media Job، Browser/Proxy و Web+Chat واقعی را روی زیرساخت محلی Disposable کامل کنید.
2. Schemaهای مشترک را Freeze/Version کنید و Fixtureها را در هر دو Repository نگه دارید.
3. پیش از Rollout هر Schema/Data، از MongoDB مربوط به Chat و Metadata محلی/S3 لازم Backup بگیرید و Restore را تست کنید.
4. نگاشت واقعی Chat↔Web را از طریق فرایند Offline مجاز Inventory و هر Conflict را بازبینی کنید. هرگز از Phone/Name استنباط نکنید.
5. مسیر Migration جداگانه و تاییدشده Production با Dry Run، Checkpoint برای Batchها، Audit Output، Rollback Export و بدون بازنویسی مخرب ID بسازید.
6. پشتیبانی را در حالت Disabled Deploy کنید، سلامت Schema/Index و Baseline منابع را بررسی و سپس Secret/URLهای Least-Privilege را پیکربندی کنید.
7. Canary کوچک را از Reverse Proxy واقعی اجرا کنید؛ لغو Status، Conflict در Link، Replay، Reconnect، Logout و Restart را بررسی کنید.
8. پیش از اعمال/سخت‌تر کردن سقف‌ها، RSS، CPU، تاخیر Event Loop، p95/Connectionهای MongoDB، p95 API، اتصال‌های باز Realtime، Lag صف Media، Disk و Errorها را اندازه بگیرید.
9. ورود سازگاری بومی Chat را فقط برای Migration Window صریحاً تاییدشده نگه دارید؛ بازنشستگی آن را جداگانه تعریف کنید.
10. `OWJ_SUPPORT_ENABLED` را فقط پس از توافق درباره Rollback و مالک Incident فعال کنید. Rollback یعنی غیرفعال‌کردن Feature/Routing و لغو نشست‌های پشتیبانی؛ هرگز به‌عنوان میان‌بر Rollback گفتگو/پیام را حذف نکنید.

## بیانیه Git و Deployment

دستورالعمل Repository اجرای خودکار Commandهای Git، Commit و Push را ممنوع می‌کند. بنابراین این Handoff گزارش ساختگی از Working Tree در Git ارائه نمی‌کند؛ اپراتور انسانی باید آن را بررسی کند. پیام پیشنهادی Commit پس از بازبینی:

```text
feat(platform): add federated support identity and realtime backend
```
