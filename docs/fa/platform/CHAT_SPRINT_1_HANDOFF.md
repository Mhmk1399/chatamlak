# تحویل اسپرینت اول Owj Chat

تاریخ این تصویر وضعیت: ۲۰ نوامبر ۲۰۲۶. مخزن: Owj Chat. این سند تحویل سورس است، نه گزارش استقرار. هیچ کانتینر، پایگاه‌داده، پیام، پیوست، مهاجرت، commit یا push در محیط تولید تغییر نکرد.

## واژه‌های وضعیت

- **IMPLEMENTED TODAY — پیاده‌سازی‌شده از قبل**: رفتاری که پیش از این اسپرینت وجود داشت.
- **IMPLEMENTED IN SPRINT — پیاده‌سازی‌شده در اسپرینت**: سورس و پوشش رگرسیون به این مخزن افزوده شده، اما تا استقرار هماهنگ‌شده در تولید فعال نیست.
- **بخشی**: محافظت مفید وجود دارد، ولی یک معیار پذیرش یا مرحله عملیاتی باقی مانده است.
- **PROPOSED/DORMANT — پیشنهادی/غیرفعال**: آماده‌سازی کد بدون route، رابط کاربری، اتصال startup یا تغییر schema زنده.
- **BLOCKED ON WEB — مسدود به‌خاطر Web**: Owj Web باید قرارداد هویت یا سرویس را تأیید یا پیاده‌سازی کند.
- **REQUIRES MIGRATION/ROLLOUT — نیازمند مهاجرت/راه‌اندازی**: پشتیبان، بررسی سازگاری، استقرار یا عملیات داده صریح لازم است؛ هیچ‌کدام در این کار اجرا نشد.

## گزارش کار و مالکیت

Chat همچنان مالک گفتگوها، عضویت، پیام‌ها، وضعیت خواندن/تحویل، پیوست‌ها و انتقال WebSocket/SSE خام است. Web مالک هویت انسانی مرجع و کارهای CRM باقی می‌ماند. Analytics تغییر نکرد.

| کار | وضعیت سورس | تغییر انجام‌شده | مورد باقی‌مانده |
|---|---|---|---|
| CHAT-001 رسانه خصوصی | پیاده‌سازی در اسپرینت | مسیرهای شناسه فایل، نام ذخیره‌شده، thumbnail، range، دیسک محلی و object storage زنجیره فایل ← پیام ← گفتگو را resolve کرده و عضویت فعلی را لازم می‌دانند. payload پیام/event جدید به‌جای URL قابل‌استفاده مجدد provider از `/api/uploads/file/:id` و `/api/uploads/thumbs/:id` محافظت‌شده استفاده می‌کند. فقط کانال صریحاً عمومی اجازه رسانه پیام بدون session دارد؛ پاسخ خصوصی `private, no-store` است. | استقرار فقط با bucket خصوصی و عمر کوتاه لینک دانلود امضاشده؛ redirect مجاز تا زمان انقضای URL provider قابل اشتراک است. |
| CHAT-002 مالکیت upload | پیاده‌سازی در اسپرینت | presign از `id` واقعی session استفاده می‌کند. presign پیش از پیام `clientRequestId` محدودشده می‌خواهد؛ upload معلق به actor، گفتگو، کاربرد، پیام/client request و storage key متصل است. انتشار/completion مالک پیام و عضویت فعلی را دوباره بررسی می‌کند. completion مقدار `upload_completed_at` را ثبت می‌کند، persistence/پذیرش صف را await می‌کند، claim را هنگام overload نگه می‌دارد، پس از موفقیت مصرف می‌کند و retry idempotent با بررسی مالکیت می‌پذیرد. | server و client با هم rollout شوند چون client قدیمی فیلدهای binding سخت‌گیرانه را نمی‌فرستد. orphan cleanup و retry با provider واقعی پایش شود. |
| CHAT-003 لاگ حساس | پیاده‌سازی در اسپرینت | مسیرهای HTTP debug، رسانه، worker، storage، push، maintenance، admin و remote-channel از فیلدهای allowlist شده و error code پایدار استفاده می‌کنند. body درخواست/پاسخ، cookie، Authorization، پیام خصوصی، URL/body provider، object key و raw error در مسیرهای سخت‌شده serialize نمی‌شوند. | در rollout، sink لاگ و dependencyها بازبینی شوند؛ redaction query string/provider باید بیرون این process نیز اعمال شود. |
| CHAT-004 دسترسی کانتینر | در سورس پیاده‌سازی شده؛ rollout هماهنگ لازم است | image نهایی با کاربر `node` اجرا می‌شود؛ Compose همه capabilityها را حذف و `no-new-privileges` را فعال کرده و دیگر `/var/run/docker.sock` را mount نمی‌کند. کنترل سرویس/Nginx داخل برنامه اعلام می‌کند مالک آن زیرساخت است. | مالکیت volume موجود باید برای uid/gid 1000 آماده و image دوباره ساخته شود. سورس هنوز deploy نشده است. |
| CHAT-005 احراز هویت worker/callback | بخشی | نبود secret برای worker/callback موجب fail-closed می‌شود؛ مقایسه زمان‌ثابت است؛ اندازه body، عمق صف، concurrency، byte ورودی، timeout دریافت، scheme/نشانی خصوصی و metadata و storage key محدود شده‌اند. | secret مشترک فعلی credential تاریخ‌دار نیست. پیش از ادعای پوشش credential منقضی، قرارداد service-auth زمان‌دار/rotation تصویب شود. سیاست DNS rebinding نیز در استقرار بازبینی شود. |
| CHAT-006 عملیات مدیریتی حساس | بخشی | backup/reset/vacuum/clear/restore، نمایش secret، دسترسی به لاگ زیرساخت و کنترل‌های غیرفعال host به نقش owner به‌علاوه operator token جداگانه نیاز دارند. restore/delete MongoDB آفلاین باقی می‌ماند. کنترل Docker/Nginx در process غیرفعال است. | operator token ایستا راهکار موقت step-up است. rotation و هویت operator ممیزی‌شده پیش از تأیید تولید تعریف شوند. |
| CHAT-007 session | پیاده‌سازی در اسپرینت، با cutover هماهنگ | token جدید session به‌صورت SHA-256 ذخیره می‌شود و digest ذخیره‌شده به‌عنوان bearer credential مرورگر پذیرفته نمی‌شود؛ رکورد plaintext قدیمی قابل خواندن است و هنگام استفاده ارتقا می‌یابد. انقضای idle/absolute برای HTTP و upgrade وب‌سوکت اعمال می‌شود. logout/لغو device وب‌سوکت و SSE همان session را می‌بندد؛ ban/reset-password/delete ادمین همه streamهای WebSocket و SSE آن username را می‌بندد. cookie روی production HTTPS دارای HttpOnly، SameSite=Lax و Secure است. | مقدار timeout تولید تنظیم و cutover دوخوانشی پایش شود. sessionها یک‌جا حذف نشوند. بازاعتبارسنجی دوره‌ای انقضا برای WebSocket/SSE از قبل باز، پیگیری دفاعی بعدی است. |
| CHAT-008 پذیرش WebSocket | بخشی | `/ws` و `/api/ws` خام هنگام upgrade با cookie `sid` احراز می‌شوند؛ `token`/`sid` در query رد می‌شود. origin، payload، اتصال هر IP، timeout احراز، نرخ پیام، heartbeat، payload نامعتبر و لغو صریح session محدودند. با invalidation کش عضویت، عضو حذف‌شده fan-out بعدی را دریافت نمی‌کند؛ لغو صریح حساب/session stream fallback SSE را نیز می‌بندد. | trusted proxy/IP برای Nginx و originهای مجاز پیکربندی شود. WebSocket/SSE از قبل باز صرفاً با رسیدن زمان انقضای idle/absolute هنوز دوره‌ای بازاعتبارسنجی نمی‌شود. |
| CHAT-009 قراردادهای شکسته | پیاده‌سازی در اسپرینت | بستن topic mutation repository را await می‌کند؛ افزودن خودکار عضو عملیات async repository را await می‌کند؛ persistence/save در upload، save callback، پذیرش صف و حذف claim معلق await می‌شوند. خروجی upload نرمال است و regression مالکیت/URL محافظت‌شده قراردادهای اصلاح‌شده را می‌پوشاند. | رفتار Mongo/provider واقعی در rollout مرحله‌ای مشاهده شود؛ migration زنده یا تست provider واقعی در این کار انجام نشد. |
| CHAT-010 حدود پردازش رسانه | طبق طراحی بخشی | صف fallback داخل process و صف worker عمق و concurrency محدود دارند؛ overload worker پاسخ 503 با `Retry-After` می‌دهد؛ request/input/time محدود است. | کار حافظه‌ای پس از restart ماندگار نیست. حالت Redis/BullMQ موجود در صورت پیکربندی صریح می‌تواند ماندگار باشد، اما broker جدیدی افزوده نشد. reconciliation ماندگار فقط پس از تصمیم ظرفیت تصویب‌شده اضافه شود. |

## آماده‌سازی بین‌مخزنی

ماژول‌های زیر **پیشنهادی/غیرفعال** هستند و startup آن‌ها را import نمی‌کند:

- `server/db/platformIdentitySchema.js`: helper افزایشی collection/index به نام `platform_identity_links`؛ فقط با `enabled: true` اجرا می‌شود. در `COLLECTION_KEYS` نیست، از `server/db.js` فراخوانی نمی‌شود و هیچ migration اجرا نشد.
- `server/lib/platformIdentityAdapter.js`: verifier تأییدشده تزریقی را می‌پذیرد و issuer، audience، scope، expiry، وضعیت subject، capability مهمان، پیوند صریح حساب و وضعیت فعلی Chat را بررسی می‌کند. JWT، signing key یا token exchange تعریف نمی‌کند.
- `server/lib/supportAccessService.js`: عملیات `read`، `send` یا `acknowledge` را برای principal از قبل تأییدشده مجاز می‌کند. مهمان فقط conversation ID داخل capability و کاربر ثبت‌شده فقط همراه عضویت فعلی Chat مجاز است. هیچ HTTP route ارائه نمی‌کند.
- `server/lib/crmTaskCommand.js`: فرمان حداقلی و versioned متعلق به Web شامل actor، ارجاع گفتگو، request ID، idempotency key و فیلدهای allowlist شده می‌سازد. body پیام/contact/transcript را رد می‌کند و هیچ درخواست شبکه‌ای ندارد.

بنابراین ID-005 تا ID-007، CTR-003 تا CTR-006، SUP-003/SUP-004/SUP-006/SUP-008/SUP-010 و CRM-004 تا CRM-007 هرجا به Web وابسته‌اند فقط آماده‌سازی هستند. login مرکزی، پشتیبانی مهمان و ساخت task CRM زنده نیستند.

## مرز امنیت و داده

- `userId`، role، username یا consultant ID مرورگر مرجع federation نیست. session فعلی Chat actor محلی را می‌دهد؛ عملیات platform آینده باید principal تأییدشده Web داشته باشد.
- مجوز رسانه خصوصی از فایل ← پیام ← گفتگو ← عضویت فعلی به‌دست می‌آید. visibility کانال عمومی قانون صریح جداگانه است.
- Chat هرگز collectionهای CRM متعلق به Web را نمی‌نویسد. پیشنهاد CRM متن پیام خصوصی را خودکار ارسال نمی‌کند.
- هیچ customer record، پیام تولید، secret تولید یا پایگاه‌داده تولیدی دسترسی نشد.

## اثر منابع

تغییرات برای خواندن رسانه lookup محدود عضویت/فایل، برای token session یک digest و برای صف‌ها/counterها حافظه محدود اضافه می‌کند. سقف کد حتی با تنظیم بزرگ‌تر: concurrency worker برابر 4، عمق صف worker برابر 256، concurrency رسانه server برابر 4 و عمق صف server برابر 1000 است. روی میزبان مشترک 4-vCPU و حدود 8-GiB با مقادیر پایین شروع و فقط با اندازه‌گیری RSS، CPU، event-loop delay، p95 MongoDB، queue lag و p95 Web/Chat تغییر داده شود.

## مرز راستی‌آزمایی

suite نهایی و ایزوله server، **1092 از 1092 تست در 125 فایل** را گذراند؛ ماتریس یکپارچه رسانه خصوصی/upload برابر 75 از 75، suite worker برابر 43 از 43، تست unit کلاینت برابر 457 از 457 و تست component مرورگر Chromium برابر 334 از 334 بود. lint کلاینت، build تولید کلاینت، build مستندات VitePress، بررسی syntax فایل‌های JavaScript تغییرکرده، اعتبارسنجی Docker Compose و syntax اسکریپت entrypoint موفق بود. تست HTTP به listener محلی موقت نیاز دارد؛ اجرای sandbox محدود پیش از assertion خطای `listen EPERM` داد و با دسترسی loopback محلی موفق شد. Bats در دسترس نبود. MongoDB واقعی، object storage زنده، build image کانتینر، بار تولید و migration تولید عمداً اجرا نشد.

## ترتیب rollout هماهنگ

1. Web و Chat قرارداد issuer/audience/scope/guest هویت و service-auth را تصویب کنند.
2. از MongoDB Chat پشتیبان گرفته و restore آزموده شود. شناسه‌های فعلی user/message/member تغییر نکنند.
3. مالکیت volume برای uid/gid 1000 آماده و وابستگی automation بیرونی به Docker socket حذف شود.
4. `WEBHOOK_SECRET` و `OPERATOR_API_TOKEN` تصادفی بلند، originهای مجاز، allowlist worker، حدود صف/ورودی، timeout session و رفتار proxy Nginx تنظیم شوند.
5. image تغییرناپذیر در CI ساخته و suiteهای server/worker/client/docs به‌علاوه قرارداد Mongo replica-set اجرا شود.
6. امنیت Chat با login محلی فعلی deploy شود؛ HTTP، `/ws`، `/api/events`، replay، upload، range download و revocation بررسی شود.
7. در release بعدی migration افزایشی identity-link بازبینی‌شده اجرا و فقط mapping تأییدشده پر شود. پیش از فعال‌سازی Web login برای cohort کوچک مشاهده شود.
8. adapter مهمان/ثبت‌شده Web فقط پس از contract test فعال شود. feature flag برای بازگشت به auth محلی حفظ شود.

## ریسک‌های باقی‌مانده

- سورس ممیزی‌شده ممکن است از image در حال اجرای `web-chat-1` جدیدتر باشد.
- secret ایستای worker/operator به rotation و برای dispatch worker به طراحی expiry/replay تصویب‌شده نیاز دارد.
- fallback حافظه‌ای رسانه محدود ولی در restart ماندگار نیست.
- خصوصی‌بودن object store و TTL لینک امضاشده باید بیرون این مخزن تأیید شود.
- federation، route مهمان و انتقال task CRM به Web وابسته‌اند؛ فعال‌سازی زودهنگام کد غیرفعال مرز هویت ناقص می‌سازد یا fail-closed می‌شود.
- VPS مشترک هنوز به سقف اندازه‌گیری‌شده CPU/RAM/disk/connection و rotation لاگ نیاز دارد.

پیام commit پیشنهادی برای اجرای کاربر: `feat(chat): harden sprint-one security boundaries`
