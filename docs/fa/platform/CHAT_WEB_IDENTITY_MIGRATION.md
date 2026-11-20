# مهاجرت هویت Chat ↔ Web

وضعیت: **PROPOSED/DORMANT — پیشنهادی/غیرفعال**، **BLOCKED ON WEB — مسدود به‌خاطر Web** و پس از بازبینی **REQUIRES MIGRATION — نیازمند مهاجرت**. هیچ migration یا نوشتن در تولید اجرا نشد.

## مدل فعلی هویت و session

امروز Chat سند محلی `users` با UUID پایدار `id`، `username` یکتا، `password_hash` از bcrypt، role، banned/verified/status، اطلاعات profile و timestamp دارد. پیام‌ها و عضویت‌ها به `users.id` در Chat ارجاع می‌دهند؛ صرفاً برای پذیرش login وب نباید این ارجاع‌ها بازنویسی شوند.

collection `sessions` شامل `token` یکتا، `user_id`، `created_at` و `last_seen` است. token جدید با قالب `sha256:<64 hex>` ذخیره و cookie خام ارائه‌شده برای lookup digest می‌شود؛ خود digest ذخیره‌شده به‌عنوان credential مرورگر رد می‌شود. token plaintext قدیمی همچنان قابل خواندن است و پس از استفاده موفق به digest ارتقا می‌یابد. cookie مرورگر `sid` با `Path=/`، HttpOnly، SameSite=Lax و Secure روی production HTTPS است. HTTP انقضای idle و absolute قابل تنظیم دارد؛ لغو device رکورد را حذف و WebSocket خام متناظر را می‌بندد.

`/api/register` و `/api/login` محلی تا تصویب cutover platform فعال می‌مانند. این سند مجوز حذف آن‌ها نیست.

## اصل هدف

Web مرجع هویت انسانی است. Chat UUID داخلی فعلی را به‌عنوان کلید مالکیت پیام تاریخی، عضویت، فایل، read state و audit نگه می‌دارد. mapping تأییدشده یک subject وب را دقیقاً به یک کاربر Chat متصل می‌کند؛ federation تاریخچه Chat را merge یا بازنویسی نمی‌کند.

collection افزایشی پیشنهادی:

```json
{
  "id": "uuid",
  "provider": "owj-web",
  "web_user_id": "stable-web-subject",
  "chat_user_id": "existing-chat-uuid",
  "status": "active | revoked | deactivated",
  "revision": 1,
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "linked_by_web_user_id": null,
  "revoked_at": null,
  "revocation_reason": null
}
```

index یکتای لازم: `id`، ترکیب `(provider, web_user_id)` و `chat_user_id` است؛ `(status, updated_at)` reconciliation محدود را پشتیبانی می‌کند. indexهای یک‌به‌یک mapping تکراری/متعارض را متوقف می‌کنند. پیوند با username، nickname، نام یا تلفن ممنوع است.

`server/db/platformIdentitySchema.js` helper این schema را دارد، اما عمداً در schema/startup فعال Mongo نیست و این اسپرینت collection تولیدی ایجاد نکرد.

## مرز adapter اعتبارنامه

`createPlatformIdentityAdapter` تابع `verifyCredential` تزریقی را فقط پس از تصویب پروتکل Web می‌پذیرد. verifier claimهای نرمال و از قبل تأییدشده می‌دهد و Chat موارد زیر را اجرا می‌کند:

- issuer پیکربندی‌شده و audience مخصوص Chat؛
- scope لازم و expiry؛
- وضعیت active برای subject وب؛
- نوع registered یا guest؛
- link صریح active برای کاربر ثبت‌شده؛
- حساب تاریخی Chat فعال و non-banned؛
- capability محدود conversation برای مهمان.

adapter هیچ JWT را parse/mint نمی‌کند، الگوریتم امضا انتخاب نمی‌کند، secret امضای Web را توزیع نمی‌کند و token exchange تعریف نمی‌کند. طراحی پیشنهادی Web یک credential کوتاه‌عمر محدود به audience با verify نامتقارن یا exchange از طریق Web BFF است. issuer، کلید، transport، signal لغو، clock skew و نام scope دقیق همچنان **مسدود به بازبینی امنیت Web** است.

## برنامه migration بدون از دست‌رفتن داده

1. **ابتدا قرارداد.** claimهای versioned، audience، scope، guest capability، service identity، status/revocation، خطا، timeout، rotation کلید و audit field تصویب و contract test تولیدکننده/مصرف‌کننده افزوده شود.
2. **موجودی و backup.** از `ouj_chat` خارج میزبان backup و restore آزموده شود. تعداد user، session، membership، author پیام، ارجاع orphan، mapping candidate تکراری و حساب banned/deactivated شمارش شود. متن پیام تولید برای تطبیق هویت خوانده نشود.
3. **فقط schema افزوده شود.** در release بازبینی‌شده maintenance، `ensurePlatformIdentityLinkSchema(db, { enabled: true })` فراخوانی شود. فقط collection و index جدید می‌سازد و `users`، `sessions`، پیام یا membership را تغییر نمی‌دهد. نسخه migration برگشت‌پذیر ثبت شود.
4. **پیوند تأییدشده.** link فقط با proof کنترل‌شده و authenticated وب یا import بازبینی‌شده operator همراه evidence تغییرناپذیر پر شود. conflict متوقف شود؛ username/phone مشابه ملاک نباشد. کاربر Chat بدون link محلی بماند.
5. **اعتبارسنجی shadow.** در حالی که federation runtime خاموش است، verify وب و resolve link فقط در metric/audit مقایسه شود. شناسه فقط به شکل pseudonymous تصویب‌شده لاگ شود و credential هرگز لاگ نشود.
6. **cutover گروه کوچک.** verify تزریقی و login لینک‌شده برای cohort کوچک فعال شود. پس از verify وب، session عادی Chat برای UUID نگاشت‌شده ساخته شود تا مجوز عضویت فعلی حفظ شود. login محلی طی مشاهده به‌عنوان fallback feature flag باقی بماند.
7. **همگام‌سازی وضعیت.** کاربر disabled/revoked وب session جدید Chat نگیرد؛ session فعال مرتبط با command احراز‌شده و idempotent Web→Chat لغو شود. لغو mapping تاریخچه را حذف نمی‌کند.
8. **گسترش و سپس بازنشستگی.** فقط پس از قبولی auth، WebSocket، SSE، support، upload و rollback گسترش یابد. حذف registration/password محلی تغییر جداگانه با اطلاع‌رسانی و بازیابی است.

## هویت مهمان

مهمان حساب password مستقل Chat ندارد. Web capability مهمان کوتاه‌عمر صادر یا exchange می‌کند که audience آن Chat، scope آن `support:conversation` و فهرست conversation فقط شامل گفتگوی پشتیبانی همان بازدیدکننده است. Chat در هر درخواست adapter آن را verify می‌کند. capability مهمان دسترسی directory، کانال عمومی، مدیریت، CRM یا گفتگوی دلخواه نمی‌دهد.

اینکه گفتگوی پشتیبانی از actor موقت Chat یا guest-subject اختصاصی استفاده کند هنوز تصمیم schema است. باید author پیام، retention، moderation و deletion را بدون ساخت identity store دوم برای Web حفظ کند.

## rollback

- feature flagهای federation/support خاموش و login محلی و session فعلی Chat حفظ شوند.
- ساخت mapping متوقف شود؛ user، message، membership یا تاریخچه session Chat حذف نشود.
- فقط credential/session اثبات‌شده مرتبط با rollout خراب لغو شود.
- collection افزایشی می‌تواند غیرفعال بماند. حذف آن اختیاری و فقط پس از backup، reconciliation و تأیید نبود مصرف‌کننده است.
- image برنامه مستقل از داده rollback شود. `users` rename/drop، author ID بازنویسی یا merge گروهی ممنوع است.

## دروازه‌های پذیرش

- تست index یکتا و idempotence migration روی replica set اختصاصی Mongo قبول شود.
- تست link، conflict، revoked/deactivated، issuer/audience/scope اشتباه، expired، حساب banned Chat و guest capability قبول شود.
- پیام و membership قدیمی پیش و پس از cutover به همان UUID Chat resolve شود.
- rollback session محلی، reconnect WebSocket/SSE، revocation و رفتار چند device قبول شود.
- قرارداد Web، rotation کلید، rollback رخداد، monitoring و مالکیت support پیش از فعال‌سازی تولید امضا شود.
