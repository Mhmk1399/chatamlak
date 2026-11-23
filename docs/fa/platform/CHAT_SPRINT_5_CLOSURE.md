# صورت‌جلسهٔ اختتام اسپرینت ۵ گفتگوی اوج

تاریخ: ۲۰۲۶-۱۱-۲۳

وضعیت: **در محیط مصنوعی محافظت‌شده مختومه است.** شاهد دقیق مرورگر، سرور، MongoDB و میان‌مخزنی در ادامه و فایل ریشهٔ `CHAT_SPRINT_5_CLOSURE.md` ثبت شده است.

revision آغازین Chat برابر `0397bd32da4d653bc237d47f33f3223e393683f4` و Web برابر `825deb1dec989e390ac8048310db790c5f111e8f` بود. working tree ‏Chat تغییرات commit‌نشدهٔ اسپرینت ۵ دارد. منبع Web و Analytics ویرایش نشد.

## تصویر پذیرش

| بررسی | نتیجه در این تصویر | طبقه‌بندی |
|---|---:|---|
| مجموعهٔ کامل سرور | **۱۴۸ فایل و ۱۲۵۰ تست موفق** | موفق |
| replica set یک‌بارمصرف MongoDB | **۱۰ فایل و ۶۷ تست موفق** | موفق |
| مجموعهٔ متمرکز drag/dismiss شیت | **۱۰ از ۱۰ تست موفق** | موفق |
| مجموعهٔ کامل مؤلفه‌های Chromium | **۷۳ فایل و ۸۲۰ تست موفق** | موفق |
| پیوند تاریخچهٔ مهمان میان hostها در Chrome واقعی | موفقیت + رد replay + شاهد MongoDB | موفق |
| مسیر SSO/پیام/WebRTC/CRM در Chrome واقعی | موفقیت + restart + retry/conflict | موفق |

target ایزوله همچنان پروژهٔ `owj-sprint4-synthetic`، پورت `28088`، marker برابر `owj-sprint4-synthetic-only-v1` و databaseهای `owj_web_e2e`، `owj_chat_e2e` و `owj_analytics_e2e` است. پورت `18088`، دادهٔ production clone، Atlas، SMS واقعی، object storage زنده، Divar و ارائه‌دهندهٔ پولی خارج از این پذیرش هستند.

## مالکیت و اختتام قرارداد

Chat مالک گفتگوها، پیام‌ها، پرونده‌های پشتیبانی، رکوردهای تبدیل مهمان، نشست بومی، state ‏realtime و تماس است. Web مرجع هویت و مالک تغییرات CRM باقی می‌ماند. زیرساخت مشترک MongoDB یا هویت ارسالی مرورگر مجوز نوشتن Chat در collectionهای Web نیست.

### handoff تاریخچهٔ مهمان میان hostها

قرارداد افزایشی v1 در سمت Chat نیاز ناممکن ارسال هم‌زمان کوکی مهمان و native که روی دو host جدا هستند را جایگزین می‌کند:

1. نشست جاری `web_federated` در Chat، مسیر `POST /api/integrations/support/guest-link/start` را با `intent: "link_guest_history"` صریح آغاز می‌کند.
2. Chat تراکنش پنج‌دقیقه‌ای شامل digestهای state و browser token، ‏PKCE verifier، subject دقیق Web، کاربر Chat، redirect URI و expiry می‌سازد. مرورگر فقط کوکی تراکنش path-scoped، ‏host-only، ‏`HttpOnly` و `SameSite=Lax` و فرم authorization را می‌گیرد.
3. Chat کد یک‌بارمصرف را با service identity برابر `owj-chat-support-guest-link` به‌صورت server-to-server exchange می‌کند؛ service credential و PKCE verifier وارد JavaScript frontend نمی‌شوند.
4. Chat فقط proof ‏RS256 با audience برابر `owj-chat-support-guest-link`، token use برابر `support_guest_link` و scope دقیق `support:guest-history:link` را می‌پذیرد. JTI assertion و تراکنش مرورگر یک‌بارمصرف‌اند.
5. تکمیل به همان subject جاری Web، حساب بومی Chat، platform link فعال یک‌به‌یک، digest مهمان و conversation نیاز دارد. سپس تبدیل ثبت، authorship و تاریخچه حفظ و نشست‌های قدیمی مهمان لغو می‌شوند.

مدیریت conflict صریح است: هویت مهمانی که قبلاً به حساب دیگری وصل شده یا وجود هم‌زمان دو پروندهٔ فعال guest/registered با خطای محدود رد می‌شود و merge خودکار ندارد. تست‌های unit/API و Mongo واقعی، intent، پاک‌شدن کوکی، بررسی proof/account/ownership، ‏idempotency، حفظ authorship، شماره‌گذاری تاریخچه و conflict پروندهٔ فعال را پوشش می‌دهند. Chrome واقعی authorization وب بازسازی‌شده و exchange اثبات Chat را کامل، replay callback را رد و نشست native را حفظ کرد؛ شاهد بولی Mongo نیز binding هویت‌ها، authorship مهمان، رکورد proof/link و صفر نشست مهمان فعال را تأیید کرد.

### فرمان CRM

مرورگر مسیر محافظت‌شدهٔ `POST /api/integrations/crm/tasks` در Chat را فراخوانی می‌کند. Chat نشست فدره‌شده را force-refresh می‌کند، proof جاری actor نمایندگی را می‌خواهد، عضویت گفتگوی مبدأ را بررسی می‌کند و فرمان allowlist‌شدهٔ v1 را با service identity برابر `owj-chat-crm`، header نمایندگی، idempotency key پایدار و correlation ID محدود به Web می‌فرستد.

فرمان به type تأییدشده، title، ‏`dueAt` معتبر و دست‌کم یک step محدود نیاز دارد. referenceهای مجاز assignment/case و instructions محدود قابل ارسال‌اند. متن پیام، transcript، customer/contact/phone و فیلد ناشناخته پیش از درخواست میان‌سرویسی رد می‌شوند. Web مسئول وضعیت actor، مجوز assignment، mutation ‏idempotent و شناسه/status canonical وظیفه است. Chat پاسخ را به ۳۲ KiB محدود و timeout را شش ثانیه می‌کند. Chrome واقعی task canonical با شناسهٔ `6b043efb4cde168daf9fc042` را ساخت، پس از restart ‏Chat همان task را برای retry یکسان به‌شکل deduplicated برگرداند و payload تغییرکرده با همان key را با `409` رد کرد.

## امنیت و حریم خصوصی

- `userId`، role، consultant، agency، conversation یا case ارسالی مرورگر مرجع هویت نیست؛ سرور actor را از نشست مات Chat استخراج و عضویت/وضعیت جاری Web را بازبینی می‌کند.
- service token، ‏PKCE verifier، proof وب، transaction token، پیام خصوصی، دادهٔ تماس و credential نباید وارد browser storage، log، event یا مثال سند شوند.
- subject مهمان در state تبدیل فقط به شکل digest نام‌فضادار SHA-256 ذخیره می‌شود. نویسندهٔ مهمان پس از تبدیل customer می‌ماند و merge ضمنی نام کاربری/ایمیل/تلفن وجود ندارد.
- پاسخ‌های guest-link دارای no-store و محدود هستند. URL تولید باید HTTPS باشد؛ HTTP ناامن فقط با flag صریح غیرتولیدی مجاز است.
- `chat:admin` وب scope مجوز است، نه ارتقای owner/admin بومی Chat. مجوز بومی elevated پیش‌فرض deny می‌ماند.

## اثر داده و منابع

تغییر، documentهای تحت مالکیت Chat در `guest_link_transactions` با index یکتای state digest و TTL و مسیر موجود رکورد/index تبدیل مهمان را اضافه می‌کند. هر start یک document کوچک با عمر پنج دقیقه می‌سازد؛ completion آن را اتمیک مصرف می‌کند و در صورت پشتیبانی transactionهای کوتاه MongoDB به کار می‌برد. array نامحدود، crawler پس‌زمینه، broker، Redis یا pool جدید وجود ندارد.

handoff مهمان برای هر اقدام صریح کاربر یک مسیر authorization/exchange محدود در Web اضافه می‌کند. CRM برای هر تلاش یک درخواست داخلی با timeout شش ثانیه و پاسخ حداکثر ۳۲ KiB دارد. این مسیرها user-facing هستند و پیش از سخت‌کردن سقف منابع تولید باید latency ‏Web، latency ‏transaction MongoDB، نرخ خطا و فشار pool پایش شوند.

## دستورات تأیید

```bash
npm --prefix server run test
npm --prefix server run test:mongo
VITEST_COVERAGE=1 npm --prefix client exec vitest --project browser --run test/components/chat/ToolDialog.dragDismiss.test.jsx
VITEST_COVERAGE=1 npm --prefix client exec vitest --project browser --run --maxWorkers=1
node client/test/e2e/guest-link-platform-flow.mjs
node client/test/e2e/web-sso-crm-platform-flow.mjs
```

اجرای اولیهٔ محدود به sandbox در صورت `EPERM` برای listener یا child process شاهد پذیرش نیست؛ عدد گزارش‌شدهٔ **۱۲۵۰ از ۱۲۵۰** مربوط به اجرای کامل مجاز است. اسکریپت‌های مرورگر محافظ‌دار بدون marker، پورت و نام database دقیق محیط مصنوعی اجرا نمی‌شوند.

## استقرار و rollback

commit، push، deploy، migration مخرب یا reset ‏volume بخشی از این کار نیست. پیش از deploy باید URLهای دقیق authorize/exchange/redirect برای guest-link و service token مستقل با حداقل دسترسی تنظیم و کوکی HTTPS، routing پراکسی callback، issuer/JWKS/audience وب، endpoint ‏CRM، redaction لاگ، backup، restore و alert تأیید شوند.

rollback افزایشی است: wiring مسیر/runtime ‏guest-link را غیرفعال یا حذف کنید و UI را بدون حذف تاریخچهٔ تبدیل یا بازنویسی پیام به حالت unavailable برگردانید. نشست‌های موجود Support v1/v2 و SSO بومی مستقل ادامه می‌یابند. هنگام rollback برنامه، collectionهای `guest_link_transactions` یا تبدیل حذف نشوند؛ حفظ TTL/indexهای یکتا امن است و حذف داده rollback را مخرب می‌کند. اصلاحات سازگاری CRM بدون دست‌زدن به taskهای Web قابل rollback هستند، اما task ساخته‌شده همچنان تحت مالکیت Web می‌ماند.

## چک‌لیست نهایی‌سازی

- [x] نتیجهٔ کامل Chromium ثبت شد: ۷۳ فایل و ۸۲۰ تست موفق.
- [x] موفقیت Web + Chrome برای guest-link و replay callback ثبت شد؛ حالت‌های hostile در API/runtime/Mongo واقعی پوشش دارند.
- [x] ساخت CRM، retry یکسان و conflict payload متفاوت در Web + Chrome ثبت شد؛ actor/assignment نامعتبر در تست قرارداد سرور پوشش دارند.
- [x] restart فقط Chat برای دوام نشست/پیام و idempotency ‏CRM دوباره بررسی شد.
- [x] اعداد اسناد بدون بازنویسی شواهد تاریخی اسپرینت ۴/اوایل اسپرینت ۵ به‌روز شد.

