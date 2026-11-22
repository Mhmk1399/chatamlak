# تست Docker محلی Owj Chat

وضعیت: `docker-compose.local.yaml` توپولوژی یک‌بارمصرف متعلق به Chat باقی می‌ماند. در ۲۰۲۶-۱۱-۲۱ harness مشترک و Web-owned پس از rebuild وب از سورس هم‌راستا، پذیرش مصنوعی Web+Chat/proxy را پاس کرد. browser automation، deployment تولید، capacity و rotation واقعی با کلید قبلی هنوز اثبات نشده‌اند.

## مرز شواهد Sprint 2.5 — ۲۰۲۶-۱۱-۲۱

| بررسی | شاهد فعلی |
|---|---|
| checkpoint متمرکز status/session/API/fixture | ۵۵/۵۵ قبول؛ ۷ تست fixture داخل همان ۵۵ محاسبه شده است |
| suite کامل server | پس از fixture exactness و دو case regression مربوط به live `actorKind` مهمان/registered، ۱۴۱ فایل و ۱٬۲۱۵ تست قبول شد |
| suite واقعی MongoDB | ۹ فایل و ۵۸ تست قبول؛ شامل media-job با ۲/۲ و round trip متادیتای assertion پشتیبانی با ۴/۴ |
| Compose مشترک Web+Chat | Web، Chat، replica set مونگو و Nginx سالم شدند؛ named volumeها نگه داشته شدند |
| جریان واقعی registered/staff/revocation | flow مصنوعی پاس شد، شامل `401 SUPPORT_SESSION_REVOKED` پس از marker موقت و Web-owned revocation |
| reverse proxy، WS/SSE و forwarding cookie | cookie HTTP، Origin سخت‌گیرانه، SSE و WS بومی از Nginx پاس شدند؛ browser automation pending است |
| deployment/capacity تولید | اجرا نشده و مجاز نبوده است |

آمار server/Mongo/worker/client/browser در handoffهای Sprint 2 فقط سابقه مفید است و مدرک Sprint 2.5 نیست.

### پذیرش harness مشترک — ۲۰۲۶-۱۱-۲۱

harness متعلق به Web از یک replica set مونگو، credential و database منطقی جدا برای `owj_web`/`owj_chat`، یک container وب، یک container Chat و یک Nginx استفاده کرد. Image قدیمی Web ابتدا خطای قرارداد قدیمی status داد؛ rebuild فقط Web و recreate آن mismatch را رفع کرد. Nginx ابتدا پیش از قابل‌حل‌شدن DNS وب recreateشده بالا آمد و سپس با restart هدفمند proxy پاس شد. هیچ volume حذف نشد و `down --volumes` اجرا نشد.

بررسی‌های مصنوعی مشاهده‌شده: bootstrap مهمان با HMAC/RS256 و cookie محدود؛ پیام `201`، retry دقیق `200`/deduped، body متفاوت `409`؛ جداسازی Guest B؛ resume نوع WS و replay نوع SSE با Origin سخت‌گیرانه؛ queue/assign/reply کارشناس؛ resume/history کاربر registered؛ پاسخ دقیق status؛ revocation current-state؛ invalidation logout؛ و stop/start مستقل Chat درحالی‌که Web پاسخ HTTP 200 ماند و history حفظ شد. این مدرک عملکرد محلی است، نه capacity تولید یا تست اجراشده در browser.

## اعتبارسنجی محلی ثبت‌شده — 2026-11-20

اجرای نهایی محلی Sprint 2 شواهد زیر را تولید کرد:

| بررسی | نتیجه مشاهده‌شده |
|---|---|
| رندر Compose | `config --quiet` با Credentialهای مصنوعی ذخیره‌شده زیر `/tmp` موفق شد |
| Image | Rebuild نهایی Image در Docker موفق شد |
| Startup | MongoDB، Chat و Media Worker سالم بودند |
| Containerهای برنامه | بررسی‌های Non-Root و Root فقط خواندنی برای Chat/Worker موفق شدند؛ Named Data Volume مورد انتظار قابل نوشتن بود |
| Topology پایگاه‌داده MongoDB | `ouj-rs` دارای Primary بود |
| مجوز پایگاه‌داده | User مربوط به Chat دقیقاً `readWrite` روی `ouj_chat` داشت؛ خواندن `ouj_business_local` با کد 13 در MongoDB رد شد |
| Case یکپارچه‌سازی 20 | یک پیام در Repository نوشته شد، فقط Chat Restart شد و همان پیام دوباره خوانده شد: موفق |
| ماندگاری Media Job پس از Restart | اجرا نشد؛ ماندگاری پیام، بازیابی Media Job را اثبات نمی‌کند |
| Case یکپارچه‌سازی 21 | مجوز جداگانه پایگاه‌داده Chat و رد دسترسی بین پایگاه‌داده‌ها: موفق |
| Case یکپارچه‌سازی 23 | رفتار Cookie/SSE/WebSocket بومی در Reverse Proxy: اجرا نشد |
| Case یکپارچه‌سازی 24 | جزئی: Restart/Readback مربوط به Chat موفق بود، اما هیچ پردازه Web برای اثبات دسترس‌پذیری Web اجرا نمی‌شد |
| Shutdown | اجرای `down` عادی کامل شد و هر سه Named Volume را نگه داشت |

این نتیجه CHAT-S2-10 را فقط در Topology مستقل و محلی متعلق به Chat اعتبارسنجی می‌کند. این نتیجه، یکپارچه‌سازی واقعی Web+Chat، نتیجه Reverse Proxy، Benchmark کارایی، مدرک Deployment در Production یا اثبات ماندگاری Media Job نیست.

## Topology و محدودیت‌ها

```text
shared local Web/proxy harness (not in this repository)
                    │
          ouj-platform-internal
                    │
        ┌───────────┼─────────────┐
        │           │             │
   chat:5174   media-worker:8080  mongo:27017
        │                           │
        └──── chat-data       mongo-data/keyfile
```

هیچ سرویس این فایل پورتی روی Host منتشر نمی‌کند. Container مشترک Web/Proxy محلی باید به Network نام‌گذاری‌شده `ouj-platform-internal` بپیوندد و فقط مسیرهای الزامی Chat را Route کند. Nginx دوم روی Portهای 80/443 میزبان اضافه نکنید.

| سرویس | محدودیت Runtime | وضعیت امنیتی |
|---|---:|---|
| `chat` | 400 MiB، 0.75 CPU، 256 PID | uid 1000، Root فقط خواندنی، tmpfs روی `/tmp`، تمام Capabilityها Drop شده |
| `media-worker` | 600 MiB، 1 CPU، 256 PID | uid 1000، Root فقط خواندنی، tmpfs روی `/tmp`، تمام Capabilityها Drop شده |
| `mongo` | 1536 MiB، 1.25 CPU، 256 PID | Replica Set تک‌گره‌ای احرازشده `ouj-rs`، فقط Port داخلی |

این‌ها سقف‌های آزمایشی موقت‌اند. پیش از کپی یا سخت‌گیرانه‌تر کردن آن‌ها برای Production، RSS، CPU، تاخیر Event Loop، تاخیر MongoDB، مصرف Pool و p95 API را اندازه بگیرید.

Chat و Worker همه Capabilityهای Linux را Drop می‌کنند. Entrypoint رسمی MongoDB فقط `CHOWN`، `DAC_OVERRIDE`، `FOWNER`، `SETGID` و `SETUID` را برای مقداردهی Ownership روی Named Volume تازه نگه می‌دارد؛ این Capabilityها به Containerهای برنامه داده نمی‌شوند.

این Topology از پایگاه‌داده MongoDB با نام `ouj_chat` و User اختصاصی برنامه با دسترسی `readWrite` فقط روی همان پایگاه‌داده استفاده می‌کند. Transactionها کار می‌کنند چون MongoDB محلی به‌صورت Replica Set تک‌گره‌ای اجرا می‌شود. این همچنان یک پردازه MongoDB است و میان پایگاه‌داده‌های منطقی دیگر هیچ جداسازی CPU/I/O ایجاد نمی‌کند.

Image چندمرحله‌ای Chat از Node 24 روی Debian Bookworm slim استفاده می‌کند و Worker مستقل از Node 24 Alpine همراه ffmpeg بهره می‌برد. Image سرویس MongoDB به‌طور پیش‌فرض `${MONGO_IMAGE:-mongo:8.2.7}` است؛ Helper مربوط به Init Replica Set از Image کلاینت MongoDB 8.0 و Helperهای دیگر از Alpine 3.22 استفاده می‌کنند. این پیش‌فرض Server انتخاب شد چون `mongo:8.0.34` هنگام اعتبارسنجی محلی Kernel نسخه 7.0.0 میزبان Ubuntu فعلی را نپذیرفت. `MONGO_IMAGE` را فقط با Image دیگری از MongoDB 8 که محلی اعتبارسنجی شده است Override کنید. الزام Repository برای Commandهای Host همچنان Node `>=24.18.0` و npm `>=11.18.0` است.

## پیش‌نیازها

- Ubuntu همراه Docker Engine و Plugin نسخه ۲ Compose.
- فضای دیسک کافی برای Layerهای Build مربوط به Node 24، Image نوع MongoDB 8، Image مربوط به Worker/ffmpeg و Volumeهای نام‌گذاری‌شده.
- نبود `.env`، Credential، Database URI، Data Volume یا کلید Object Store مربوط به Production.
- Credentialهای مصنوعی که فقط برای این محیط Disposable تولید شده‌اند.

بررسی ابزارها:

```bash
docker version
docker compose version
docker system df
```

دستور `docker system prune --volumes` را اجرا نکنید؛ ممکن است داده توسعه‌دهندگان دیگر روی همان Docker Host قرار داشته باشد.

## ساخت فایل Environment فقط-محلی

فایلی خارج از Version Control، برای مثال `/tmp/ouj-chat-local.env`، بسازید و هر Placeholder را با مقدار مصنوعی محلی جایگزین کنید:

```dotenv
MONGO_REPLICA_SET_KEY=<at-least-32-random-base64-safe-characters>
MONGO_IMAGE=mongo:8.2.7
MONGO_INITDB_ROOT_USERNAME=local_root
MONGO_INITDB_ROOT_PASSWORD=<long-uri-safe-local-password>
MONGO_CHAT_USER=local_ouj_chat
MONGO_CHAT_PASSWORD=<different-long-uri-safe-local-password>
WEBHOOK_SECRET=<at-least-32-random-characters>

# Keep support disabled for the standalone smoke test.
OWJ_SUPPORT_ENABLED=false
```

خروجی Hex برای گذرواژه جاسازی‌شده MongoDB در URI ایمن است:

```bash
openssl rand -hex 48
```

برای هر Secret مقدار متفاوتی تولید کنید. دسترسی فایل را محدود کنید:

```bash
chmod 600 /tmp/ouj-chat-local.env
```

هرگز Token واقعی سرویس Web، کلید امضا، Credential پایگاه‌داده MongoDB یا داده کاربر را در این فایل کپی نکنید.

## اعتبارسنجی پیکربندی پیش از شروع Containerها

از Root مخزن:

```bash
export CHAT_LOCAL_ENV=/tmp/ouj-chat-local.env
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml config --quiet
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml config --services
```

سرویس‌های مورد انتظار `mongo-keyfile-init`، `mongo`، `mongo-rs-init`، `volume-init`، `chat` و `media-worker` هستند. Config رندرشده را به‌صورت محلی بازبینی کنید، اما چون شامل Secretهای جایگذاری‌شده است آن را در Ticket یا Log قرار ندهید.

بررسی کنید `chat`، `media-worker` و `mongo` به‌جای `ports` از `expose` استفاده کنند، Containerهای برنامه `read_only: true` داشته باشند و Docker Socket Mount نشده باشد.

## Build و Start

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml build chat media-worker
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml up -d
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml ps
```

صبر کنید تا `mongo`، `chat` و `media-worker` Healthy شوند و هر دو Init Job با موفقیت Exit کنند. اگر سرویسی Unhealthy بود فقط Tail محدود را بررسی کنید و پیش از اشتراک‌گذاری Redact کنید:

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml logs --tail=150 mongo-rs-init chat media-worker
```

ویژگی‌های مورد انتظار هنگام شروع:

- `mongo-keyfile-init` کلیدی با Mode برابر 0400 و مالکیت User کانتینری MongoDB می‌سازد؛
- `mongo-rs-init`، `ouj-rs` را به‌شکل Idempotent راه‌اندازی می‌کند و در صورت نبود User اختصاصی `ouj_chat` آن را می‌سازد؛
- `volume-init` مسیر `/app/data` را برای uid/gid برابر 1000 قابل نوشتن می‌کند؛
- Chat با User اختصاصی متصل می‌شود، Schema/Indexهای خود را بررسی/ایجاد می‌کند و روی Port داخلی 5174 شروع می‌شود. اگر Validator موجود Media Job دقیقاً یکسان باشد، `collMod` اجرا نمی‌شود؛ Validator متفاوت به Migration صریح، بازبینی‌شده، یک‌باره و Privileged با `collMod` پیش از Startup عادی Runtime نیاز دارد. مجوز مدیریت پایگاه‌داده را به User مربوط به Runtime در Chat ندهید؛
- Worker جداگانه روی Port داخلی 8080 با الزام درخواست‌های امضاشده و رد مقصد Job روی Loopback شروع می‌شود.

## بررسی Health، Replica Set و جداسازی

از داخل Network خصوصی Probe کنید:

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml exec -T chat \
  node -e "fetch('http://127.0.0.1:5174/api/health').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"

docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml exec -T chat \
  node -e "fetch('http://media-worker:8080/health').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
```

وضعیت Replica Set را بدون چاپ گذرواژه بررسی کنید:

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml exec -T mongo sh -lc \
  'mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "const s=rs.status(); printjson({set:s.set, primary:s.members.find(m=>m.stateStr===\"PRIMARY\")?.name})"'
```

نام Set مورد انتظار `ouj-rs` و Primary مورد انتظار `mongo:27017` است. در `ouj_chat` فقط نام Userها و Roleها را بررسی کنید:

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml exec -T mongo sh -lc \
  'mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin ouj_chat --eval "printjson(db.getUsers().users.map(u=>({user:u.user,roles:u.roles})))"'
```

مرز Non-Root/Write را با Probe موقت بررسی کنید:

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml exec -T chat id
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml exec -T media-worker id
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml exec -T chat \
  node -e "const f=require('fs');const p='/app/data/.permission-probe';f.writeFileSync(p,'ok',{mode:0o600});f.unlinkSync(p);console.log('data volume writable')"
```

هر دو Container برنامه باید uid برابر 1000 گزارش کنند. نوشتن روی Data Volume باید موفق شود؛ نوشتن در جای دیگری از Image فقط-خواندنی نباید به‌عنوان گام پذیرش استفاده شود، چون عمداً شکست می‌خورد.

بررسی کنید هیچ Portای روی Host منتشر نشده باشد (خروجی خالی مورد انتظار است):

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml port chat 5174
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml port media-worker 8080
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml port mongo 27017
```

## Smoke Test منابع

زیر بار مصنوعی کوچک، موارد زیر را جمع‌آوری کنید:

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml stats --no-stream
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml top
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml exec -T chat \
  node -e "console.log(process.memoryUsage())"
```

ترافیک پشتیبانی/Replay/Media محدود اجرا کنید، نه Load Generator سراسری یا نامحدود. Restart/OOMهای Container، p95 API مربوط به Chat، تاخیر Event Loop، p95/Connectionهای MongoDB، تاخیر Replay، عمق Queue مربوط به Worker و رشد Disk را ثبت کنید. زیر سقف Memory ماندن Container در حالت Idle نتیجه Capacity در Production نیست.

## یکپارچه‌سازی اختیاری پشتیبانی Web

فایل Compose سرویس Mock یا واقعی Web را فراهم نمی‌کند. برای تست پشتیبانی، Container مربوط به Web یا Strict Mock باید به `ouj-platform-internal` بپیوندد و موارد زیر را فراهم کند:

```dotenv
OWJ_SUPPORT_ENABLED=true
OWJ_WEB_ISSUER=http://<web-service>:<port>
OWJ_WEB_JWKS_URL=http://<web-service>:<port>/.well-known/jwks.json
OWJ_WEB_STATUS_URL=http://<web-service>:<port>/api/internal/v1/identity/status
OWJ_WEB_TO_CHAT_SERVICE_SECRET=<matching-inbound-hmac-secret-at-least-32-characters>
OWJ_CHAT_TO_WEB_SERVICE_TOKEN=<matching-directional-token-at-least-32-characters>
OWJ_SUPPORT_ALLOWED_ORIGINS=http://<browser-visible-web-origin>
OWJ_WEB_ALLOW_INSECURE_HTTP=true
```

HTTP ساده فقط برای توسعه محلی است. Startup در Production باید URLهای HTTPS را الزامی کند و نباید `OWJ_WEB_ALLOW_INSECURE_HTTP` را فعال کند.

Web BFF، نه JavaScript مرورگر، باید درخواست Bootstrap را امضا و Credential مات را دریافت کند. باید `owj_support_sid` را با `Path=/support/v1`، `HttpOnly`، `SameSite=Lax` و روی HTTPS با `Secure` تنظیم کند. رفتار سخت‌گیرانه Origin، Forward شدن Cookie، پاک‌شدن هنگام Logout، عدم Buffering در SSE و Upgrade بومی WebSocket را از طریق Proxy واقعی محلی تست کنید.

وقتی سرویس Issuer/Status فقط Strict Mock است، این را «یکپارچه‌سازی واقعی Web» ننامید.

قرارداد machine-readable Chat در `docs/platform/fixtures/support-v1/manifest.json` است. کانتینر Web باید درخواست frozen یعنی `{subject,tokenIssuedAt,jti}` و پاسخ موفق شامل subject تخت، `status`، `role`، `support.allowed`، `support.staff`، `authorizationCacheMaxAgeSeconds` و `checkedAt` را تطبیق دهد.

درخواست اول به Image قدیمی Web هنوز خطای schema قدیمی را برگرداند. Chat ضعیف نشد. بعد از rebuild وب، route زنده `{subject,tokenIssuedAt,jti}` را پذیرفت، role حروف‌کوچک Web و پاسخ تخت دقیق status/support/cache را برگرداند و `authRevokedBefore` را در flow مصنوعی revocation enforce کرد.

## پذیرش Restart و ماندگاری

فقط از حساب/پیام مصنوعی استفاده کنید:

1. نشست پشتیبانی مصنوعی ثبت‌شده یا مهمان را از طریق Web/Strict Mock، Bootstrap کنید.
2. پیامی با `clientRequestId` یکتا بفرستید؛ `messageId` و Cursor مربوط به Replay را ثبت کنید.
3. فقط Chat را Restart کنید:

   ```bash
   docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml restart chat
   ```

4. منتظر Health بمانید، اگر قرارداد Cookie/Session لازم داشت دوباره Bootstrap کنید و همان پیام را بازیابی کنید. Realtime را از Cursor ذخیره‌شده Resume کنید و نبود تکرار را بررسی کنید.
5. یک Job مصنوعی Media که برای Worker محلی ایمن است در Queue بگذارید، هنگام Pending/Processing بودن آن Chat را Restart کنید و بررسی کنید MongoDB بدون انتشار تکراری آن را Reclaim یا Complete کند.
6. MongoDB را Restart کنید، Dependencyها را دوباره Healthy کنید و بازیابی پیام را تکرار کنید:

   ```bash
   docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml restart mongo
   docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml up -d
   docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml ps
   ```

7. در Harness مشترک بررسی کنید هنگام Restart شدن Chat، Web در دسترس باقی بماند و Widget وضعیت اتصال مجدد محدود را نشان دهد.

Health پس از Restart فقط بازیابی پردازه را اثبات می‌کند، نه دوام Message/Media؛ شواهد پیام/Job بازیابی‌شده را جداگانه ثبت کنید.

در اجرای ثبت‌شده 2026-11-20، مسیر Write پیام در Repository → Restart فقط-Chat → Readback موفق شد. مرحله Restart مربوط به Media Job اجرا نشد، Resume مربوط به Realtime Cursor جداگانه ادعا نشد و هیچ پردازه Web وجود نداشت؛ بنابراین Case 24 جزئی باقی می‌ماند.

## توقف، نگهداری یا نابودی داده محلی

توقف عادی Volumeهای نام‌گذاری‌شده را نگه می‌دارد:

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml down
```

برای ادامه در آینده، `up -d` را با همان مقادیر Environment محلی اجرا کنید؛ تغییر Credentialهای MongoDB، User موجود در Volume از پیش Initializeشده را بازنویسی نمی‌کند.

فقط پس از تایید اینکه Project و همه داده‌ها Disposable هستند، Volumeهای **همین پروژه Compose** را نابود کنید:

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml down --volumes
```

دستور آخر Volumeهای محلی Chat/MongoDB/Keyfile را برای همیشه حذف می‌کند و نباید برای Reset معمول استفاده شود. هیچ کاربردی در Production ندارد.

## الگوی رکورد پذیرش

دستور دقیق، زمان، Revision منبع (توسط اپراتور انسانی) و خلاصه خروجی را ثبت کنید:

| بررسی | مدرک الزامی |
|---|---|
| رندر Compose | `config --quiet` با کد 0 Exit شود |
| Build | هر دو Image نهایی از کد منبع فعلی کامل شوند |
| Startup | Init Jobها با کد 0 خارج شوند؛ Mongo/Chat/Worker سالم باشند |
| Replica/User | `ouj-rs` در حالت Primary؛ فقط Role اختصاصی `ouj_chat` |
| جداسازی | نبود Host Port/Socket؛ موفقیت مرزهای Non-Root/Read-Only |
| مجوزها | uid 1000، Probe روی Data Volume را بنویسد و حذف کند |
| Proxy پشتیبانی | Cookie، Origin سخت‌گیرانه، SSE و Upgrade بومی WS موفق شوند |
| Restart | پیام و Cursor مربوط به Replay از Restart شدن Chat جان سالم به در ببرند |
| Media پایدار | Job در انتظار بدون تکرار/از‌دست‌رفتن بازیابی شود |
| منابع | مشاهده‌های RSS/CPU/p95/Connection/Queue/Disk ثبت شوند |

برای Revision جدید کد منبع، این نتیجه‌ها را به جلو منتقل نکنید و Checklist را دوباره اجرا کنید. gate عملکردی Web/proxy مشترک در ۲۰۲۶-۱۱-۲۱ پاس شد؛ browser automation، interruption کامل Docker worker/FFmpeg، rotation واقعی کلید قبلی، observation منابع و gate ظرفیت تولید باز هستند.
