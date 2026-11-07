# نقشهٔ فایل‌های مهم گفتگوی اوج

این راهنما ساختار همین مخزن را توضیح می‌دهد تا برای تغییر هر قابلیت، فایل مربوط را پیدا کنید. نام پوشه‌ها یا دیده‌نشدن یک فایل در صفحهٔ چت، به‌تنهایی نشانهٔ اضافه‌بودن آن نیست: فایل ممکن است ورودی CLI، تست، پردازشگر، سرویس‌ورکر، مستندات یا استقرار باشد.

## مسیر کلی اجرای برنامه

```text
client/index.html → client/src/main.jsx → App.jsx → pages/ → components/ + hooks/
                                    ↓ apiFetch
server/index.js → api/ → lib/services/ → db.js → db/mongoRepository.js → MongoDB
                         ↓
                  worker/index.js → ffmpeg + local/S3 storage
```

دادهٔ گفتگو، پیام، خواندن و واکنش متعلق به سرویس Chat است. متن و فراداده در MongoDB ذخیره می‌شوند؛ بایت فایل‌ها در storage محلی یا S3 قرار دارند و بکاپ مستقل می‌خواهند. موتور عادی برنامه MongoDB است؛ وجود migration و ابزارهای SQL تاریخی به معنی fallback زمان اجرا نیست.

**تفاوت وضعیت فعلی و هدف معماری:** این نسخه هنوز مسیرهای داخلی ورود و ثبت‌نام دارد. مرجع هویت Web در قواعد مشترک اوج، هدف یکپارچه‌سازی است؛ این پاکسازی آن یکپارچه‌سازی یا تغییر رفتار ورود را انجام نداده است.

## برای ویرایش هر بخش از کجا شروع کنم؟

| کار | نقطهٔ شروع |
| --- | --- |
| نوشتن و ارسال، پیوست و ضبط | [MessageComposer.jsx](../client/src/components/chat/messages/MessageComposer.jsx) |
| حباب، لمس طولانی و واکنش | [MessageItem.jsx](../client/src/components/chat/messages/MessageItem.jsx) و [MessageContextMenu.jsx](../client/src/components/context-menu/MessageContextMenu.jsx) |
| پخش ویس و ویدیومسیج | [VoicePlaybackControls.jsx](../client/src/components/chat/media/VoicePlaybackControls.jsx) و [VideoNotePlayer.jsx](../client/src/components/chat/media/VideoNotePlayer.jsx) |
| سایدبار و اندازهٔ پنل‌ها | [ChatLayout.jsx](../client/src/components/chat/ChatLayout.jsx) و [ChatSidebar.jsx](../client/src/components/sidebar/layout/ChatSidebar.jsx) |
| رنگ و پوسته | [DESIGN.md](../DESIGN.md) و [brand.css](../client/src/brand.css) |
| متن فارسی و انگلیسی | [locale.js](../client/src/i18n/locale.js) و فایل‌های fa در همان پوشه |
| تقویم و زمان‌بندی | [PersianDateTimeField.jsx](../client/src/components/common/PersianDateTimeField.jsx) و [ScheduleMessageForm.jsx](../client/src/components/chat/tools/ScheduleMessageForm.jsx) |
| پنل مدیریت | [AdminPanel.jsx](../client/src/components/admin/AdminPanel.jsx) و [adminPanel.js](../server/api/adminPanel.js) |
| collection و index | [mongoSchema.js](../server/db/mongoSchema.js) |
| عملیات داده | [mongoRepository.js](../server/db/mongoRepository.js) و مخزن تخصصی همان قابلیت |
| رویداد زنده و بازیابی | [sse.js](../server/lib/sse.js)، [websocketGateway.js](../server/lib/websocketGateway.js) و [useChatEvents.js](../client/src/hooks/chat/useChatEvents.js) |
| اعلان PWA | [sw.js](../client/public/sw.js)، [push.js](../server/lib/push.js) و [DevicePermissionsSetup.jsx](../client/src/components/pwa/DevicePermissionsSetup.jsx) |

## نقطه‌های ورود و پیکربندی اصلی

| فایل | مسئولیت |
| --- | --- |
| [package.json](../package.json) | فرمان‌های سطح مخزن برای توسعه، ساخت، تست و مستندات؛ اجرای dev شامل کلاینت، سرور و پردازشگر رسانه است. |
| [client/src/main.jsx](../client/src/main.jsx) | ورودی React؛ برنامه را داخل عنصر root صفحه نصب می‌کند. |
| [client/src/App.jsx](../client/src/App.jsx) | مالک مسیر‌یابی دستی، وضعیت ورود، پوسته، زبان، تم و راه‌اندازی امکانات مرورگر و PWA. |
| [client/src/pages/ChatPage.jsx](../client/src/pages/ChatPage.jsx) | هماهنگ‌کنندهٔ صفحهٔ گفتگو؛ دریافت داده، رویدادها، سایدبار، پیام‌ها، تنظیمات و مودال‌ها را کنار هم قرار می‌دهد. |
| [client/src/pages/AuthPage.jsx](../client/src/pages/AuthPage.jsx) | صفحهٔ ورود و ثبت‌نام با فرم‌ها و پیام‌های دو‌زبانه. |
| [client/src/pages/AdminPage.jsx](../client/src/pages/AdminPage.jsx) | ورودی پنل مدیریت و حالت دریافت دسترسی اولیهٔ مدیریت. |
| [client/src/pages/InvitePage.jsx](../client/src/pages/InvitePage.jsx) | نمایش و پذیرش دعوت به گروه یا کانال. |
| [server/index.js](../server/index.js) | راه‌اندازی Express، اتصال پایگاه داده، تزریق وابستگی‌ها، رویدادهای زنده، فایل‌ها و کارهای دوره‌ای. |
| [server/db.js](../server/db.js) | درگاه پایدار عملیات دیتابیس؛ اتصال زنده و مخزن MongoDB از اینجا در اختیار برنامه قرار می‌گیرد. |
| [worker/index.js](../worker/index.js) | سرور پردازش رسانه؛ دریافت کارهای تبدیل ویدیو و آینه‌سازی فایل و اعلام نتیجه به سرور چت. |
| [shared/chatAppearance.js](../shared/chatAppearance.js) | شناسه‌های مجاز والپیپر و یکسان‌سازی ساختار ترجیح ظاهر بین کلاینت و سرور. |
| [shared/package.json](../shared/package.json) | مشخص می‌کند فایل‌های مشترک، ماژول JavaScript با قالب ESM هستند. |
| [client/index.html](../client/index.html) | پوستهٔ HTML، آیکون‌ها، manifest و اعمال زبان و تم اولیه پیش از نمایش React. |
| [client/src/index.css](../client/src/index.css) | ورودی CSS، تایپوگرافی، Tailwind، اسکرول‌بارها و قواعد عمومی صفحه. |
| [client/src/brand.css](../client/src/brand.css) | مرجع اجرایی رنگ‌های اوج، تم روشن و تاریک و سطح‌های شیشه‌ای. |
| [client/src/pages/ChatPage.module.css](../client/src/pages/ChatPage.module.css) | استایل‌های اختصاصی صفحهٔ چت. |
| [client/vite.config.js](../client/vite.config.js) | تنظیم ساخت و توسعهٔ فرانت‌اند، پراکسی و تقسیم بسته‌های JavaScript. |
| [client/vitest.config.js](../client/vitest.config.js) | پیکربندی تست‌های واحد و تست مرورگر در Chromium و Firefox. |
| [client/eslint.config.js](../client/eslint.config.js) | قواعد بررسی کیفیت JavaScript و React. |
| [client/postcss.config.js](../client/postcss.config.js) | اتصال Tailwind به پردازش CSS. |
| [client/package.json](../client/package.json) | وابستگی‌ها و فرمان‌های کلاینت. |
| [server/package.json](../server/package.json) | وابستگی‌ها و فرمان‌های سرور و ابزارهای MongoDB. |
| [server/vitest.config.js](../server/vitest.config.js) | تست‌های ایزولهٔ سرور با وابستگی تزریق‌شده؛ مجموعهٔ Mongo واقعی جداست. |
| [server/vitest.mongo.config.js](../server/vitest.mongo.config.js) | پیکربندی تست تراکنش‌ها روی MongoDB آزمایشی و مستقل. |
| [server/settings/env.js](../server/settings/env.js) | خواندن و اعتبارسنجی تنظیمات سرور، پایگاه داده و محدودیت‌ها. |
| [server/settings/colors.js](../server/settings/colors.js) | رنگ‌های پیش‌فرض و اعتبارسنجی رنگ حساب و گروه. |
| [worker/package.json](../worker/package.json) | وابستگی‌ها و فرمان‌های پردازشگر رسانه. |
| [.env.example](../.env.example) | فهرست تنظیمات قابل پیکربندی؛ مقدار اتصال MongoDB باید خصوصی تنظیم شود. |
| [.nvmrc](../.nvmrc) | نسخهٔ Node برای ابزارهای مدیریت نسخه. |
| [package-lock.json](../package-lock.json) | قفل نسخه‌های ابزارهای ریشه برای نصب تکرارپذیر. |
| [client/package-lock.json](../client/package-lock.json) | قفل نسخه‌های کلاینت؛ فایل اضافه یا کش نیست. |
| [server/package-lock.json](../server/package-lock.json) | قفل نسخه‌های سرور؛ برای npm ci لازم است. |
| [worker/package-lock.json](../worker/package-lock.json) | قفل نسخه‌های پردازشگر رسانه. |
| [.gitignore](../.gitignore) | مشخص می‌کند وابستگی‌ها، اطلاعات محلی، کش‌ها و خروجی تست وارد کنترل نسخه نشوند. |
| [.dockerignore](../.dockerignore) | تست‌ها، داده‌ها، مستندات و کش‌ها را از زمینهٔ ساخت Docker کنار می‌گذارد. |

## کامپوننت‌های مشترک

مسیر پایه: `client/src/components/common/`

| فایل | مسئولیت |
| --- | --- |
| [AnchoredMenu.jsx](../client/src/components/common/AnchoredMenu.jsx) | منوی متصل به دکمه با درگاه نمایش مستقل، برخورد با لبهٔ صفحه و اسکرول داخلی. |
| [Avatar.jsx](../client/src/components/common/Avatar.jsx) | آواتار، تصویر جایگزین، حروف نام و وضعیت آنلاین. |
| [BrandIdentity.jsx](../client/src/components/common/BrandIdentity.jsx) | نمایش هویت و لوگوی گفتگوی اوج. |
| [ChatWallpaper.jsx](../client/src/components/common/ChatWallpaper.jsx) | سطح مشترک پس‌زمینهٔ چت و پیش‌نمایش والپیپر. |
| [LanguageSwitcher.jsx](../client/src/components/common/LanguageSwitcher.jsx) | کنترل تغییر زبان فارسی و انگلیسی. |
| [PersianDateTimeField.jsx](../client/src/components/common/PersianDateTimeField.jsx) | کنترل‌های تاریخ شمسی و ساعت تهران؛ تقویم در هر دو زبان شمسی می‌ماند. |
| [PersianDateTimeField.css](../client/src/components/common/PersianDateTimeField.css) | ظاهر تقویم، انتخاب ساعت و حالت‌های روشن و تاریک آن‌ها. |
| [ThemeSwitcher.jsx](../client/src/components/common/ThemeSwitcher.jsx) | کنترل تغییر پوستهٔ روشن و تاریک. |
| [Tooltip.jsx](../client/src/components/common/Tooltip.jsx) | راهنمای کوتاه برای کنترل‌ها و متن‌های کوتاه‌شده. |
| [UserRoleBadge.jsx](../client/src/components/common/UserRoleBadge.jsx) | نشان نقش کاربر در کنار نام. |
| [VerifiedBadge.jsx](../client/src/components/common/VerifiedBadge.jsx) | نشان تأیید حساب یا گفتگو. |

## ورود و دسترسی دستگاه

مسیر پایه: `client/src/components/`

| فایل | مسئولیت |
| --- | --- |
| [auth/AuthHeader.jsx](../client/src/components/auth/AuthHeader.jsx) | عنوان و کنترل‌های بالای بخش ورود. |
| [auth/AuthFormFields.jsx](../client/src/components/auth/AuthFormFields.jsx) | فیلدهای مشترک ورود و ثبت‌نام و نمایش محدودیت‌ها. |
| [auth/AuthStatusBanner.jsx](../client/src/components/auth/AuthStatusBanner.jsx) | پیام وضعیت و خطاهای فرم ورود. |
| [auth/AuthOverlay.jsx](../client/src/components/auth/AuthOverlay.jsx) | لایهٔ وضعیت و انتظار در جریان احراز هویت. |
| [auth/AuthFooter.jsx](../client/src/components/auth/AuthFooter.jsx) | لینک‌ها و اطلاعات پایین صفحهٔ ورود. |
| [pwa/DevicePermissionsSetup.jsx](../client/src/components/pwa/DevicePermissionsSetup.jsx) | راهنمای فعال‌سازی اعلان و مجوزهای دستگاه با انتخاب صریح کاربر. |
| [pwa/InstallBar.jsx](../client/src/components/pwa/InstallBar.jsx) | نوار پیشنهاد نصب نسخهٔ PWA. |
| [pwa/InstallGuideModal.jsx](../client/src/components/pwa/InstallGuideModal.jsx) | راهنمای نصب متناسب با مرورگر و سیستم‌عامل. |

## چیدمان چت و فهرست گفتگوها

مسیر پایه: `client/src/components/`

| فایل | مسئولیت |
| --- | --- |
| [chat/ChatLayout.jsx](../client/src/components/chat/ChatLayout.jsx) | چیدمان واکنش‌گرا، ریل پوشه‌ها و تغییر عرض فهرست چت در دسکتاپ. |
| [chat/ChatHeaderActions.jsx](../client/src/components/chat/ChatHeaderActions.jsx) | جست‌وجو، تماس و منوی گزینه‌های بالای گفتگو. |
| [chat/ChatWindowPanel.jsx](../client/src/components/chat/ChatWindowPanel.jsx) | ترکیب سربرگ، تاریخچه، ارسال پیام و نمایش رسانهٔ بازشده. |
| [chat/index.js](../client/src/components/chat/index.js) | مسیر صادرات مشترک برای بخش‌های چت و هوک‌های مرتبط. |
| [sidebar/layout/ChatSidebar.jsx](../client/src/components/sidebar/layout/ChatSidebar.jsx) | پوسته و هماهنگی بخش‌های سایدبار گفتگوها. |
| [sidebar/layout/chat-sidebar-polish.css](../client/src/components/sidebar/layout/chat-sidebar-polish.css) | جزئیات ظاهری سایدبار و کارت‌های گفتگو. |
| [sidebar/header/SidebarHeader.jsx](../client/src/components/sidebar/header/SidebarHeader.jsx) | سربرگ فهرست گفتگو، جست‌وجو و ساخت گفتگوی جدید. |
| [sidebar/header/UserMenuButton.jsx](../client/src/components/sidebar/header/UserMenuButton.jsx) | دکمه و منوی حساب کاربری. |
| [sidebar/list/ChatsListPanel.jsx](../client/src/components/sidebar/list/ChatsListPanel.jsx) | ردیف گفتگوها، پیش‌نمایش آخرین پیام، وضعیت خواندن و نتایج کشف کاربران و گروه‌ها. |
| [sidebar/navigation/ConversationFilters.jsx](../client/src/components/sidebar/navigation/ConversationFilters.jsx) | پوشه‌ها و فیلتر گفتگو؛ ریل عمودی دسکتاپ و ردیف افقی موبایل. |
| [sidebar/footer/SidebarFooter.jsx](../client/src/components/sidebar/footer/SidebarFooter.jsx) | کنترل‌ها و وضعیت‌های پایین سایدبار. |
| [sidebar/index.js](../client/src/components/sidebar/index.js) | صادرات مشترک اجزای سایدبار. |
| [navigation/MobileTabMenu.jsx](../client/src/components/navigation/MobileTabMenu.jsx) | ناوبری تب‌های برنامه در موبایل. |

## پیام، واکنش، ویس و ویدیو

مسیر پایه: `client/src/components/`

| فایل | مسئولیت |
| --- | --- |
| [chat/messages/MessageComposer.jsx](../client/src/components/chat/messages/MessageComposer.jsx) | نوشتن، ویرایش و ارسال؛ پیوست، ایموجی، ضبط با نگه‌داشتن و ورود به زمان‌بندی ارسال. |
| [chat/messages/MessageTimeline.jsx](../client/src/components/chat/messages/MessageTimeline.jsx) | ترکیب تاریخچه، ردیف‌های پیام و وضعیت‌های بارگیری. |
| [chat/messages/MessageList.jsx](../client/src/components/chat/messages/MessageList.jsx) | نمایش فهرست پیام‌ها و هماهنگی ردیف‌ها با پیمایش. |
| [chat/messages/MessageItem.jsx](../client/src/components/chat/messages/MessageItem.jsx) | حباب هر پیام، فرستنده، زمان، وضعیت ارسال، پاسخ و تعامل لمسی. |
| [chat/messages/EmojiPickerPopover.jsx](../client/src/components/chat/messages/EmojiPickerPopover.jsx) | انتخابگر ایموجی با جست‌وجو، رنگ پوست و انتخاب‌های اخیر؛ هنگام نیاز بارگذاری می‌شود. |
| [chat/messages/emoji-picker.css](../client/src/components/chat/messages/emoji-picker.css) | ظاهر انتخابگر ایموجی و هماهنگی آن با اوج. |
| [context-menu/ContextMenuSurface.jsx](../client/src/components/context-menu/ContextMenuSurface.jsx) | سطح مشترک دریافت راست‌کلیک، لمس طولانی و میان‌بر صفحه‌کلید. |
| [context-menu/useAppContextMenu.js](../client/src/components/context-menu/useAppContextMenu.js) | تولید گزینه‌های منو و اتصال آن‌ها به اقدام‌های مجاز پیام، کاربر یا چت. |
| [context-menu/AppContextMenu.jsx](../client/src/components/context-menu/AppContextMenu.jsx) | درگاه منوهای برنامه و بارگذاری منوی ویژهٔ پیام. |
| [context-menu/MessageContextMenu.jsx](../client/src/components/context-menu/MessageContextMenu.jsx) | واکنش سریع، پین و گزینه‌های پیام؛ جای‌گذاری بالا یا پایین پیام، فوکوس، خطا و تلاش مجدد. |
| [context-menu/message-context-menu.css](../client/src/components/context-menu/message-context-menu.css) | شیشه، سایه، محوشدن پس‌زمینه و حرکت منوی پیام. |
| [chat/media/VoicePlaybackControls.jsx](../client/src/components/chat/media/VoicePlaybackControls.jsx) | پخش و توقف ویس، تغییر سرعت و جابه‌جایی نقطهٔ پخش. |
| [chat/media/VideoNotePlayer.jsx](../client/src/components/chat/media/VideoNotePlayer.jsx) | پخش ویدیومسیج دایره‌ای. |
| [chat/media/VideoMessageRecorder.jsx](../client/src/components/chat/media/VideoMessageRecorder.jsx) | پیش‌نمایش دوربین و ضبط ویدیومسیج در نمای مرکزی. |
| [chat/media/RecordingButton.jsx](../client/src/components/chat/media/RecordingButton.jsx) | کنترل ضبط و نمایش وضعیت نگه‌داشتن، قفل و ارسال. |
| [chat/media/MessageFiles.jsx](../client/src/components/chat/media/MessageFiles.jsx) | نمایش پیوست‌های عکس، ویدیو، ویس و فایل در پیام. |
| [chat/media/FocusedMediaModal.jsx](../client/src/components/chat/media/FocusedMediaModal.jsx) | نمایش بزرگ رسانه و کنترل‌های آن. |
| [forward/ForwardChatGridItem.jsx](../client/src/components/forward/ForwardChatGridItem.jsx) | کارت انتخاب مقصد فوروارد. |
| [forward/forwardChatUtils.js](../client/src/components/forward/forwardChatUtils.js) | یکسان‌سازی و آماده‌سازی مقصدهای فوروارد. |

## ابزارهای گفتگو و تماس

مسیر پایه: `client/src/components/`

| فایل | مسئولیت |
| --- | --- |
| [chat/tools/ChatToolsDialog.jsx](../client/src/components/chat/tools/ChatToolsDialog.jsx) | پنجرهٔ ابزارهای گفتگو و جابه‌جایی بین بخش‌های آن. |
| [chat/tools/ToolsPanels.jsx](../client/src/components/chat/tools/ToolsPanels.jsx) | پنل‌های جست‌وجو، رسانه، دستگاه‌ها، صف، زمان‌بندی، گروه و نظرسنجی. |
| [chat/tools/MessagingToolbar.jsx](../client/src/components/chat/tools/MessagingToolbar.jsx) | دسترسی‌های کوتاه به امکانات گفتگو. |
| [chat/tools/MessageEngagement.jsx](../client/src/components/chat/tools/MessageEngagement.jsx) | نمایش واکنش‌های ثبت‌شده، وضعیت پین، نظرسنجی و کنترل پیام‌های صف‌شده. |
| [chat/tools/ScheduleMessageForm.jsx](../client/src/components/chat/tools/ScheduleMessageForm.jsx) | فرم مشترک متن و زمان ارسال با اعتبارسنجی. |
| [chat/tools/ScheduleMessageDialog.jsx](../client/src/components/chat/tools/ScheduleMessageDialog.jsx) | ورود به زمان‌بندی برای پیش‌نویس جاری از دکمهٔ ارسال. |
| [chat/tools/PerformancePanel.jsx](../client/src/components/chat/tools/PerformancePanel.jsx) | نمایش داده‌های سنجش عملکرد چت. |
| [chat/tools/GroupCallPanel.jsx](../client/src/components/chat/tools/GroupCallPanel.jsx) | نمایش اتاق تماس گروهی و کنترل شرکت‌کنندگان. |
| [chat/tools/ToolDialog.jsx](../client/src/components/chat/tools/ToolDialog.jsx) | پوستهٔ مشترک پنجره‌های ابزارهای گفتگو. |
| [chat/tools/toolStyles.js](../client/src/components/chat/tools/toolStyles.js) | کلاس‌های مشترک کنترل‌ها و فرم‌های ابزارها. |
| [call/CallsPanel.jsx](../client/src/components/call/CallsPanel.jsx) | فهرست و تاریخچهٔ تماس‌ها. |
| [call/CallScreen.jsx](../client/src/components/call/CallScreen.jsx) | نمای تمام‌صفحه و شناور تماس صوتی یا تصویری، وضعیت اتصال و کنترل میکروفون و دوربین. |

## پنجره‌ها و تأیید اقدام‌ها

مسیر پایه: `client/src/components/modals/`

| فایل | مسئولیت |
| --- | --- |
| [NewChatModal.jsx](../client/src/components/modals/NewChatModal.jsx) | جست‌وجو و آغاز گفتگوی خصوصی. |
| [NewGroupModal.jsx](../client/src/components/modals/NewGroupModal.jsx) | ساخت گروه یا کانال و انتخاب اعضا. |
| [NewCallModal.jsx](../client/src/components/modals/NewCallModal.jsx) | انتخاب مخاطب و شروع تماس. |
| [ChatProfileModal.jsx](../client/src/components/modals/ChatProfileModal.jsx) | مشخصات، اعضا و مدیریت اطلاعات گفتگو. |
| [GroupInviteLinkModal.jsx](../client/src/components/modals/GroupInviteLinkModal.jsx) | نمایش و مدیریت لینک دعوت گروه. |
| [ForwardMessageModal.jsx](../client/src/components/modals/ForwardMessageModal.jsx) | انتخاب مقصد و فوروارد پیام. |
| [DeleteMessageScopeModal.jsx](../client/src/components/modals/DeleteMessageScopeModal.jsx) | تعیین دامنهٔ حذف پیام با رعایت دسترسی و آفلاین‌بودن. |
| [DeleteChatsModal.jsx](../client/src/components/modals/DeleteChatsModal.jsx) | تأیید حذف گفتگوهای انتخاب‌شده. |
| [LeaveGroupModal.jsx](../client/src/components/modals/LeaveGroupModal.jsx) | تأیید خروج از گروه. |
| [ConfirmModal.jsx](../client/src/components/modals/ConfirmModal.jsx) | پنجرهٔ تأیید عمومی. |
| [ConfirmPasswordModal.jsx](../client/src/components/modals/ConfirmPasswordModal.jsx) | دریافت رمز برای اقدام حساس. |
| [RemoteChannelQueueStatus.jsx](../client/src/components/modals/RemoteChannelQueueStatus.jsx) | وضعیت صف محتوای کانال متصل. |
| [WhatsNewModal.jsx](../client/src/components/modals/WhatsNewModal.jsx) | نمایش تغییرات نسخه و اطلاعات انتشار. |

## تنظیمات کاربر

مسیر پایه: `client/src/components/settings/`

| فایل | مسئولیت |
| --- | --- |
| [modals/DesktopSettingsModal.jsx](../client/src/components/settings/modals/DesktopSettingsModal.jsx) | نمای تنظیمات در دسکتاپ. |
| [modals/NotificationsSettingsModal.jsx](../client/src/components/settings/modals/NotificationsSettingsModal.jsx) | پنجرهٔ تنظیمات اعلان. |
| [panels/MobileSettingsPanel.jsx](../client/src/components/settings/panels/MobileSettingsPanel.jsx) | نمای تنظیمات در موبایل. |
| [panels/NotificationsSettingsPanel.jsx](../client/src/components/settings/panels/NotificationsSettingsPanel.jsx) | تنظیم فعال‌بودن و جزئیات اعلان‌ها. |
| [panels/DataSettingsPanel.jsx](../client/src/components/settings/panels/DataSettingsPanel.jsx) | اطلاعات و کنترل مصرف داده و کش محلی. |
| [panels/ChatBackgroundSettingsPanel.jsx](../client/src/components/settings/panels/ChatBackgroundSettingsPanel.jsx) | انتخاب و پیش‌نمایش پس‌زمینه و ذخیرهٔ ترجیح حساب. |
| [panels/AboutSettingsPanel.jsx](../client/src/components/settings/panels/AboutSettingsPanel.jsx) | اطلاعات برنامه، نسخه و پیوندهای مربوط. |
| [menus/SettingsMenuActions.jsx](../client/src/components/settings/menus/SettingsMenuActions.jsx) | اقدام‌های مشترک منوی تنظیمات. |
| [common/CategoryButton.jsx](../client/src/components/settings/common/CategoryButton.jsx) | دکمهٔ انتخاب دستهٔ تنظیمات. |
| [common/InlineError.jsx](../client/src/components/settings/common/InlineError.jsx) | نمایش خطا کنار بخش مرتبط در تنظیمات. |
| [common/ThemeButton.jsx](../client/src/components/settings/common/ThemeButton.jsx) | انتخاب حالت تم در تنظیمات. |
| [index.js](../client/src/components/settings/index.js) | صادرات مشترک نماهای تنظیمات. |

## پنل مدیریت

مسیر پایه: `client/src/components/admin/`

| فایل | مسئولیت |
| --- | --- |
| [AdminPanel.jsx](../client/src/components/admin/AdminPanel.jsx) | پوستهٔ پنل مدیریت و تب‌های آن. |
| [AdminClaimCard.jsx](../client/src/components/admin/AdminClaimCard.jsx) | جریان دریافت دسترسی مدیریت اولیه در حالت مجاز. |
| [DashboardTab.jsx](../client/src/components/admin/DashboardTab.jsx) | شاخص‌ها و اطلاعات کلی وضعیت سیستم. |
| [UsersTab.jsx](../client/src/components/admin/UsersTab.jsx) | فهرست، جست‌وجو و اقدام‌های کاربران. |
| [ChatsTab.jsx](../client/src/components/admin/ChatsTab.jsx) | فهرست و مدیریت گفتگوها. |
| [ActionsTab.jsx](../client/src/components/admin/ActionsTab.jsx) | ابزارها و عملیات مدیریتی. |
| [SettingsTab.jsx](../client/src/components/admin/SettingsTab.jsx) | تنظیمات سامانه و ورودی‌های پیکربندی خدمات. |
| [ServicesTab.jsx](../client/src/components/admin/ServicesTab.jsx) | وضعیت خدمات و سرویس‌های وابسته. |
| [LogsTab.jsx](../client/src/components/admin/LogsTab.jsx) | نمایش و دریافت گزارش‌های عملیاتی. |
| [AdminUserModal.jsx](../client/src/components/admin/AdminUserModal.jsx) | ساخت یا ویرایش کاربر از پنل مدیریت. |
| [ContactNameImport.jsx](../client/src/components/admin/ContactNameImport.jsx) | پرکردن اختیاری نام از مخاطب انتخاب‌شده یا فایل vCard؛ ایجاد کاربر همچنان صریح است. |
| [AdminGroupModal.jsx](../client/src/components/admin/AdminGroupModal.jsx) | ساخت یا ویرایش مشخصات گروه و کانال. |
| [RemoteChannelSetupModal.jsx](../client/src/components/admin/RemoteChannelSetupModal.jsx) | تنظیم اتصال ارائه‌دهندهٔ کانال خارجی. |
| [AdminCommon.jsx](../client/src/components/admin/AdminCommon.jsx) | اجزای نمایشی مشترک پنل مدیریت. |
| [adminShared.js](../client/src/components/admin/adminShared.js) | تابع‌ها و ثابت‌های مشترک تب‌های مدیریت. |
| [index.js](../client/src/components/admin/index.js) | صادرات مشترک پنل مدیریت. |

## هوک‌های عمومی و چت

مسیر پایه: `client/src/hooks/`

| فایل | مسئولیت |
| --- | --- |
| [useFocusTrap.js](../client/src/hooks/useFocusTrap.js) | نگه‌داشتن فوکوس داخل پنجره و بازگرداندن آن بعد از بسته‌شدن. |
| [useContextMenuTrigger.js](../client/src/hooks/useContextMenuTrigger.js) | تشخیص نگه‌داشتن و راست‌کلیک؛ لغو حرکت در اثر اسکرول، رهاکردن یا تغییر هدف. |
| [useHoldToRecord.js](../client/src/hooks/useHoldToRecord.js) | چرخهٔ لمس یا فشار برای ضبط و قفل‌کردن رکورد. |
| [useAppReleaseInfo.js](../client/src/hooks/useAppReleaseInfo.js) | دریافت و نگه‌داری اطلاعات انتشار برنامه. |
| [useAdminCache.js](../client/src/hooks/useAdminCache.js) | کش داده‌های پنل مدیریت. |
| [chat/useActiveChatState.js](../client/src/hooks/chat/useActiveChatState.js) | وضعیت‌های وابسته به گفتگوی انتخاب‌شده. |
| [chat/useAppActivity.js](../client/src/hooks/chat/useAppActivity.js) | تشخیص فعال‌بودن و بازگشت کاربر به برنامه. |
| [chat/useChatAppearance.js](../client/src/hooks/chat/useChatAppearance.js) | بازیابی و ذخیرهٔ والپیپر حساب و همگام‌سازی نسخهٔ کش آن. |
| [chat/useChatCacheStats.js](../client/src/hooks/chat/useChatCacheStats.js) | اندازه‌گیری و اطلاعات کش چت. |
| [chat/useChatEvents.js](../client/src/hooks/chat/useChatEvents.js) | دریافت رویدادهای زنده و اعمال آن‌ها روی وضعیت گفتگو. |
| [chat/useChatNotifications.js](../client/src/hooks/chat/useChatNotifications.js) | هماهنگی اعلان‌های چت با وضعیت برنامه و کاربر. |
| [chat/useChatScroll.js](../client/src/hooks/chat/useChatScroll.js) | مدیریت پیمایش تاریخچه و رسیدن به انتهای گفتگو. |
| [chat/useDiscoverSearch.js](../client/src/hooks/chat/useDiscoverSearch.js) | جست‌وجوی کاربران، گروه‌ها و کانال‌ها. |
| [chat/useDmUsernames.js](../client/src/hooks/chat/useDmUsernames.js) | کمک به تشخیص و نگه‌داری نام‌های کاربران گفتگوی خصوصی. |
| [chat/useFloatingDayChip.js](../client/src/hooks/chat/useFloatingDayChip.js) | نمایش نشان شناور روز هنگام پیمایش تاریخچه. |
| [chat/useFocusedMedia.js](../client/src/hooks/chat/useFocusedMedia.js) | انتخاب رسانه و وضعیت نمایش بزرگ آن. |
| [chat/useGroupCall.js](../client/src/hooks/chat/useGroupCall.js) | اتصال و مدیریت جریان تماس گروهی مرورگر. |
| [chat/useHealthCheck.js](../client/src/hooks/chat/useHealthCheck.js) | بررسی وضعیت اتصال به سرور. |
| [chat/useMessageActions.js](../client/src/hooks/chat/useMessageActions.js) | منطق مشترک واکنش، پین و موضوع پیام با استفاده از API موجود. |
| [chat/useMessageVisibility.js](../client/src/hooks/chat/useMessageVisibility.js) | تشخیص پیام‌های داخل محدودهٔ دید. |
| [chat/useMessagesLoader.js](../client/src/hooks/chat/useMessagesLoader.js) | بارگیری اولیه و صفحه‌بندی تاریخچهٔ پیام‌ها. |
| [chat/useMessagingTools.js](../client/src/hooks/chat/useMessagingTools.js) | Context و اقدام‌های ابزارهای گفتگو، دریافت داده‌ها و وضعیت انتظار و خطا. |
| [chat/useMobileViewport.js](../client/src/hooks/chat/useMobileViewport.js) | تشخیص اندازه و حالت موبایل صفحه. |
| [chat/useNewChatSearch.js](../client/src/hooks/chat/useNewChatSearch.js) | جست‌وجوی مخاطب برای شروع گفتگو. |
| [chat/useNewGroupModal.js](../client/src/hooks/chat/useNewGroupModal.js) | وضعیت و اقدام‌های ساخت گروه یا کانال. |
| [chat/usePerfTelemetry.js](../client/src/hooks/chat/usePerfTelemetry.js) | ثبت محدود سنجه‌های عملکرد چت برای بررسی در رابط. |
| [chat/useResumeRefresh.js](../client/src/hooks/chat/useResumeRefresh.js) | تازه‌سازی داده‌ها هنگام بازگشت اتصال یا برنامه. |
| [chat/useToolData.js](../client/src/hooks/chat/useToolData.js) | دریافت و نگه‌داری دادهٔ پنل ابزارها. |
| [chat/useVoiceRecording.js](../client/src/hooks/chat/useVoiceRecording.js) | دسترسی به میکروفون، ضبط و آماده‌سازی ویس. |
| [chat/useWebRTCCall.js](../client/src/hooks/chat/useWebRTCCall.js) | سیگنالینگ و رسانهٔ تماس مستقیم صوتی و تصویری. |

## ابزارهای داده و رسانهٔ کلاینت

مسیر پایه: `client/src/utils/`

| فایل | مسئولیت |
| --- | --- |
| [cacheDb.js](../client/src/utils/cacheDb.js) | زیرساخت مشترک IndexedDB برای داده‌های محلی. |
| [chatCache.js](../client/src/utils/chatCache.js) | کش گفتگو و تاریخچه برای بارگیری و کار آفلاین. |
| [chatDrafts.js](../client/src/utils/chatDrafts.js) | ذخیره و بازیابی پیش‌نویس هر گفتگو. |
| [chatOutbox.js](../client/src/utils/chatOutbox.js) | صف ماندگار ارسال پیام و بازیابی پس از قطع اتصال یا بارگذاری مجدد. |
| [chatWallpapers.js](../client/src/utils/chatWallpapers.js) | نگاشت والپیپرهای مجاز به دارایی‌های داخلی و اطلاعات پیش‌نمایش. |
| [chatPageConstants.js](../client/src/utils/chatPageConstants.js) | ثابت‌های مورد استفادهٔ صفحهٔ گفتگو. |
| [chatFormat.js](../client/src/utils/chatFormat.js) | قالب نمایش شمارنده‌ها و اطلاعات خلاصهٔ گفتگو. |
| [avatarColor.js](../client/src/utils/avatarColor.js) | تولید رنگ و استایل آواتار جایگزین. |
| [avatarInitials.js](../client/src/utils/avatarInitials.js) | محاسبهٔ حروف نام برای آواتار. |
| [callCapabilities.js](../client/src/utils/callCapabilities.js) | تشخیص قابلیت‌های تماس در مرورگر. |
| [clipboard.js](../client/src/utils/clipboard.js) | کپی متن از مسیر مشترک برنامه. |
| [contactImport.js](../client/src/utils/contactImport.js) | اعتبارسنجی و استخراج محدود نام مخاطب از انتخاب دستگاه یا vCard. |
| [devicePermissions.js](../client/src/utils/devicePermissions.js) | تشخیص پشتیبانی و وضعیت مجوزهای مرورگر. |
| [emojiLocale.js](../client/src/utils/emojiLocale.js) | محلی‌سازی داده‌ها و برچسب‌های انتخابگر ایموجی. |
| [emojiPreferences.js](../client/src/utils/emojiPreferences.js) | ذخیرهٔ انتخاب‌های اخیر و رنگ پوست ایموجی برای حساب. |
| [fileDownload.js](../client/src/utils/fileDownload.js) | دانلود فایل با مسیرها و رفتار مشترک. |
| [fontUtils.js](../client/src/utils/fontUtils.js) | تشخیص متن فارسی برای انتخاب فونت مناسب. |
| [forwardOrigin.js](../client/src/utils/forwardOrigin.js) | اطلاعات مبدأ پیام فورواردشده. |
| [groupCallSession.js](../client/src/utils/groupCallSession.js) | ساختار و وضعیت جلسهٔ تماس گروهی. |
| [markdown.js](../client/src/utils/markdown.js) | پردازش و پاک‌سازی نمایش Markdown پیام. |
| [mediaPreprocess.js](../client/src/utils/mediaPreprocess.js) | آماده‌سازی رسانهٔ انتخاب‌شده پیش از بارگذاری. |
| [mentions.js](../client/src/utils/mentions.js) | تشخیص و درج پیشنهاد منشن. |
| [messageContent.js](../client/src/utils/messageContent.js) | تفسیر متن پیام، پیام سیستمی، سابقهٔ تماس و پیوست‌ها. |
| [messageOwnership.js](../client/src/utils/messageOwnership.js) | تشخیص نویسندهٔ پیام و پیام محلیِ متعلق به حساب. |
| [messagePreview.js](../client/src/utils/messagePreview.js) | خلاصهٔ پیوست‌ها برای پیش‌نمایش آخرین پیام. |
| [nameLimits.js](../client/src/utils/nameLimits.js) | محدودیت‌ها و اعتبارسنجی نام. |
| [persianDateTime.js](../client/src/utils/persianDateTime.js) | تبدیل و اعتبارسنجی تاریخ شمسی و ساعت تهران. |
| [sessionStorage.js](../client/src/utils/sessionStorage.js) | کمک به نگه‌داری وضعیت نشست در مرورگر. |
| [uuidUtils.js](../client/src/utils/uuidUtils.js) | اعتبارسنجی شناسه‌های UUID. |
| [versioning.js](../client/src/utils/versioning.js) | مقایسه و تشخیص نسخه‌های برنامه. |
| [videoNote.js](../client/src/utils/videoNote.js) | تشخیص و آماده‌سازی ویدیومسیج دایره‌ای. |
| [voicePlayback.js](../client/src/utils/voicePlayback.js) | کمک به زمان، سرعت و موقعیت پخش ویس. |

## API، زبان، آیکون و دارایی‌های فرانت‌اند

مسیر پایه: `client/src/`

| فایل | مسئولیت |
| --- | --- |
| [api/chatApi.js](../client/src/api/chatApi.js) | درگاه مشترک درخواست HTTP و نشست؛ درخواست‌های برنامه باید از apiFetch عبور کنند. |
| [api/messagingApi.js](../client/src/api/messagingApi.js) | درخواست‌های ابزارهای پیام‌رسانی و تبدیل خطاهای پاسخ به خطای قابل‌نمایش. |
| [api/appMetaApi.js](../client/src/api/appMetaApi.js) | دریافت اطلاعات عمومی برنامه و نسخه. |
| [i18n/locale.js](../client/src/i18n/locale.js) | انتخاب زبان، ترجمه، جهت متن و اطلاع‌رسانی تغییر زبان به اجزا. |
| [i18n/fa.js](../client/src/i18n/fa.js) | تجمیع ترجمه‌های فارسی. |
| [i18n/fa-ui.js](../client/src/i18n/fa-ui.js) | ترجمهٔ کنترل‌ها، پنجره‌ها و پیام‌های رابط. |
| [i18n/fa-settings.js](../client/src/i18n/fa-settings.js) | ترجمهٔ تنظیمات. |
| [i18n/fa-errors.js](../client/src/i18n/fa-errors.js) | ترجمه و یکسان‌سازی خطاهای قابل‌نمایش. |
| [i18n/emoji-fa.json](../client/src/i18n/emoji-fa.json) | واژه‌ها و داده‌های فارسی ایموجی؛ همراه اطلاعات منبع داده. |
| [icons/lucide.js](../client/src/icons/lucide.js) | مسیر مرکزی واردکردن آیکون‌های Lucide. |
| [icons/BrandIcons.jsx](../client/src/icons/BrandIcons.jsx) | آیکون‌های برند و سرویس‌ها. |
| [icons/AnimatedIcons.jsx](../client/src/icons/AnimatedIcons.jsx) | آیکون‌های دارای بازخورد حرکتی. |
| [settings/appConfig.js](../client/src/settings/appConfig.js) | پیکربندی قابل استفاده در کلاینت. |
| [settings/chatPageConfig.js](../client/src/settings/chatPageConfig.js) | ثابت‌ها و تنظیمات صفحهٔ گفتگو. |
| [settings/aboutContent.js](../client/src/settings/aboutContent.js) | متن و پیوندهای بخش دربارهٔ برنامه و اعتبار پروژهٔ اصلی. |

## مسیرهای HTTP سرور

مسیر پایه: `server/api/`

| فایل | مسئولیت |
| --- | --- |
| [index.js](../server/api/index.js) | ثبت مسیرها و تزریق سرویس پیام‌رسانی و کار زمان‌بندی. |
| [app.js](../server/api/app.js) | اطلاعات عمومی برنامه در /api/app/info. |
| [health.js](../server/api/health.js) | سلامت سرویس و ورودی جریان رویداد /api/events. |
| [auth.js](../server/api/auth.js) | مسیرهای ورود، ثبت‌نام، خروج و شناسایی نشست جاری. |
| [chats.js](../server/api/chats.js) | فهرست و ساخت گفتگو، عضویت، دعوت و تنظیمات گروه یا کانال. |
| [messages.js](../server/api/messages.js) | ارسال، دریافت، ویرایش، حذف، خواندن و وضعیت تایپ پیام. |
| [messaging.js](../server/api/messaging.js) | جست‌وجو، ترجیح گفتگو، واکنش، پین، موضوع، نظرسنجی، زمان‌بندی، دستگاه‌ها و تماس گروهی. |
| [profile.js](../server/api/profile.js) | ویرایش پروفایل، آواتار، رمز، وضعیت و حذف حساب. |
| [appearance.js](../server/api/appearance.js) | خواندن و ذخیرهٔ پس‌زمینهٔ خصوصی حساب. |
| [presence.js](../server/api/presence.js) | نمایش وضعیت حضور کاربران. |
| [calls.js](../server/api/calls.js) | شروع و پاسخ تماس مستقیم، پایان تماس و اطلاعات ICE. |
| [push.js](../server/api/push.js) | کلید عمومی Web Push و مدیریت اشتراک اعلان دستگاه. |
| [uploadsRemote.js](../server/api/uploadsRemote.js) | بارگذاری مستقیم یا معمولی، تکمیل آپلود، تصویر بندانگشتی و callback پردازش رسانه. |
| [remoteChannels.js](../server/api/remoteChannels.js) | اتصال گفتگو به منبع خارجی و مشاهده و کنترل صف دریافت محتوا. |
| [remoteChannelTick.js](../server/api/remoteChannelTick.js) | ورودی داخلی اجرای نوبت همگام‌سازی کانال. |
| [remoteMirror.js](../server/api/remoteMirror.js) | دریافت دادهٔ کار آینه‌سازی و callback تکمیل فایل. |
| [adminPanel.js](../server/api/adminPanel.js) | API پنل مدیریت، کاربران، گفتگوها، خدمات، تنظیمات و گزارش‌ها. |
| [adminMongo.js](../server/api/adminMongo.js) | عملیات ابزارهای مدیریتی در مسیر فعال MongoDB. |
| [admin.js](../server/api/admin.js) | ثبت ورودی ابزارهای مدیریت و واگذاری به مسیر MongoDB در پیکربندی فعلی؛ بخش‌های سازگاری تاریخی نیز در این فایل هستند. |
| [adminRemoteChannel.js](../server/api/adminRemoteChannel.js) | ورود و پیکربندی اتصال کانال خارجی برای مدیر مجاز. |

## پایگاه داده و سازگاری دادهٔ قدیمی

مسیر پایه: `server/db/`

| فایل | مسئولیت |
| --- | --- |
| [mongoConnection.js](../server/db/mongoConnection.js) | ایجاد و استفادهٔ مشترک از MongoClient، تنظیم pool و بررسی پیش‌نیاز اتصال. |
| [mongoSchema.js](../server/db/mongoSchema.js) | نام collectionها، کلیدها، مقدارهای پیش‌فرض، validatorها و indexها. |
| [mongoStore.js](../server/db/mongoStore.js) | عملیات سطح پایین collectionها، شناسه‌ها و تراکنش مشترک. |
| [mongoRepository.js](../server/db/mongoRepository.js) | مخزن اصلی عملیات گفتگو، پیام، کاربر، نشست و اتصال مخزن‌های تخصصی. |
| [mongoMessaging.js](../server/db/mongoMessaging.js) | داده‌های واکنش، پین، موضوع، نظرسنجی، زمان‌بندی، دستگاه و تماس گروهی. |
| [mongoAppearance.js](../server/db/mongoAppearance.js) | ترجیح والپیپر حساب با کنترل نسخه و رویداد همگام‌سازی. |
| [mongoAdmin.js](../server/db/mongoAdmin.js) | خواندن و عملیات مورد نیاز مدیریت. |
| [mongoRemote.js](../server/db/mongoRemote.js) | اطلاعات اتصال و صف کانال‌های خارجی. |
| [mongoMaintenance.js](../server/db/mongoMaintenance.js) | پشتیبان‌گیری، بازیابی و نگه‌داری MongoDB. |
| [mongoImport.js](../server/db/mongoImport.js) | آماده‌سازی و انتقال صریح دادهٔ قدیمی به MongoDB. |
| [legacyReader.js](../server/db/legacyReader.js) | خواندن دادهٔ SQLite یا PostgreSQL برای واردکردن تاریخی؛ مسیر اجرای عادی برنامه نیست. |
| [query.js](../server/db/query.js) | واژگان سازگار فرمان‌ها برای سرویس‌های موجود؛ در مسیر فعال به عملیات MongoDB تبدیل می‌شوند. |
| [knex.js](../server/db/knex.js) | زیرساخت سازگاری SQL برای ابزارها و تست‌های تاریخی؛ با وجود نام قدیمی، نشانهٔ انتخاب SQL به‌عنوان دیتابیس فعال نیست. |

### مالکیت و کاربرد collectionهای موجود

تعریف collectionها در [mongoSchema.js](../server/db/mongoSchema.js) است و نوشتن در آن‌ها از مخزن دادهٔ Chat و ابزارهای صریح مهاجرت/نگه‌داری همین سرویس عبور می‌کند؛ سرویس‌های دیگر باید از قرارداد احرازهویت‌شدهٔ مالک استفاده کنند. جدول زیر مصرف فعلی Chat را نشان می‌دهد و به معنی اعلام تکمیل یکپارچه‌سازی با مرجع هویت Web نیست.

| نمونهٔ collectionهای موجود | کاربرد |
| --- | --- |
| `users`، `sessions`، `session_devices`، `push_subscriptions` | اطلاعات کاربر در مسیر فعلی، دسترسی نشست، عنوان دستگاه و اشتراک اعلان. |
| `chats`، `chat_members`، `chat_messages`، `chat_message_reads` | گفتگو، عضویت، متن پیام و وضعیت خواندن. |
| `chat_message_files`، `pending_presigned_uploads` | متادیتای فایل و پیگیری آپلود؛ باینری رسانه همچنان در provider محلی یا S3 است. |
| `scheduled_messages`، `message_reactions`، `chat_topics`، `chat_polls` | وضعیت ابزارهای گفتگو؛ کم‌مصرف‌بودن به معنی بی‌استفاده‌بودن نیست. |
| `chat_event_log`، `admin_audit_logs` | بازیابی رویداد پس از قطع ارتباط و ممیزی اقدام‌های مدیریتی؛ جایگزین یکدیگر یا فایل اضافه نیستند. |
| `remote_channel_sources`، `remote_channel_queue`، `remote_channel_provider_state` | اتصال، صف و وضعیت provider ویژگی اختیاری remote؛ این مدل‌ها حفظ می‌شوند. |
| `app_settings`، `meta`، `counters`، `migration_runs` | تنظیمات، نسخهٔ schema، شمارنده‌ها و ردگیری ورود داده. |

در پیکربندی فعلی، `REMOTE_CHANNEL=false`، `REMOTE_CHANNEL_UI=false` و `REMOTE_CHANNEL_MEDIA_STREAM=false` هستند؛ دریافت خودکار، نمایش تنظیمات و stream رسانهٔ کانال خارجی خاموش‌اند. این انتخاب مستقل از پاک‌سازی داده است و کد، collectionها یا اعتبارنامه‌ها را حذف نمی‌کند؛ قابلیت با فعال‌سازی صریح دوباره قابل استفاده است و تغییر کلید اصلی `REMOTE_CHANNEL` به restart نیاز دارد. گروه‌ها و کانال‌های داخلی اوج تحت تأثیر این گزینه‌ها نیستند.

خالی یا کم‌مصرف‌بودن یک collection مجوز حذف آن نیست؛ journal بازیابی، دادهٔ هویت و دسترسی، متادیتای فایل و audit برای قراردادهای فعلی لازم‌اند. پاک‌سازی یک‌بارهٔ دادهٔ زائد قدیمی باید جداگانه، پس از بررسی رکوردها و تهیه و صحت‌سنجی پشتیبان انجام و نتیجهٔ آن بازبینی شود؛ این کار به‌معنی حذف collection یا غیرفعال‌سازی remote نیست.

در [mongoRepository.js](../server/db/mongoRepository.js)، لغو نشست و حذف حساب، برچسب‌های دستگاه متناظر را تراکنشی و با دسته‌های حداکثر ۱۰۰تایی حذف می‌کند. در [mongoMessaging.js](../server/db/mongoMessaging.js)، لغو یا پایان موفق زمان‌بندی، `body` تکراری و lease را `null` می‌کند؛ متن pending/failed برای اصلاح یا تلاش مجدد می‌ماند. پوشش این چرخه در [dataLifecycle.test.js](../server/test/mongo/dataLifecycle.test.js) است؛ این توابع در عملیات عادی از باقی‌ماندن دادهٔ فنی زائد جلوگیری می‌کنند و خودشان پیمایش سراسری دادهٔ قبلی ندارند. رسیدگی یک‌باره به رکوردهای زائد قدیمی از مسیر عملیاتی جداگانهٔ بالا انجام می‌شود.

## منطق دامنه و زیرساخت سرور

مسیر پایه: `server/lib/`

| فایل | مسئولیت |
| --- | --- |
| [services/messagingService.js](../server/lib/services/messagingService.js) | هماهنگی انتشار پیام و اجرای پیام‌های زمان‌بندی‌شده. |
| [services/messagePublicationService.js](../server/lib/services/messagePublicationService.js) | قواعد اجازهٔ انتشار و محدودیت‌های گروه یا کانال. |
| [services/membershipService.js](../server/lib/services/membershipService.js) | عملیات و قواعد عضویت در گفتگو. |
| [services/deletionService.js](../server/lib/services/deletionService.js) | هماهنگی حذف پیام، گفتگو و فایل‌های وابسته. |
| [services/appearanceService.js](../server/lib/services/appearanceService.js) | اعتبارسنجی انتخاب پس‌زمینه و همگام‌سازی ترجیح حساب. |
| [services/mongoAdminService.js](../server/lib/services/mongoAdminService.js) | اجرای مجاز اقدام‌های مدیریت روی مخزن MongoDB. |
| [sse.js](../server/lib/sse.js) | هاب رویدادهای زنده و انتشار رویدادهای گفتگو و کاربر. |
| [websocketGateway.js](../server/lib/websocketGateway.js) | درگاه WebSocket و ارتباط‌های زندهٔ کلاینت. |
| [presenceTracker.js](../server/lib/presenceTracker.js) | وضعیت آنلاین، آخرین حضور و انتشار تغییر وضعیت. |
| [callManager.js](../server/lib/callManager.js) | چرخه و وضعیت تماس‌های مستقیم. |
| [sessions.js](../server/lib/sessions.js) | ابزارهای نشست و شناسایی حساب مرتبط با درخواست. |
| [secrets.js](../server/lib/secrets.js) | مدیریت و همگام‌سازی اسرار سرویس در نقطهٔ مشترک. |
| [vapid.js](../server/lib/vapid.js) | آماده‌سازی کلیدهای مورد استفادهٔ Web Push. |
| [push.js](../server/lib/push.js) | ارسال اعلان به اشتراک‌های ثبت‌شده و مدیریت وضعیت آن‌ها. |
| [validation.js](../server/lib/validation.js) | قواعد مشترک اعتبارسنجی از جمله نام کاربری. |
| [uuidUtils.js](../server/lib/uuidUtils.js) | ساخت و بررسی UUID عمومی. |
| [uuidMiddleware.js](../server/lib/uuidMiddleware.js) | اعتبارسنجی UUID ورودی مسیر و بدنهٔ درخواست. |
| [requestUtils.js](../server/lib/requestUtils.js) | تشخیص درخواست محلی و پردازش فرادادهٔ بارگذاری. |
| [appSettings.js](../server/lib/appSettings.js) | تعریف، اعتبارسنجی، خواندن و ذخیرهٔ تنظیمات سامانه. |
| [appMeta.js](../server/lib/appMeta.js) | اطلاعات نسخه و مشخصات برنامه. |
| [inspect.js](../server/lib/inspect.js) | ساخت نمای بازرسی و خلاصهٔ داده برای مدیریت. |
| [dbToolHelpers.js](../server/lib/dbToolHelpers.js) | اعتبارسنجی و یکسان‌سازی ورودی ابزارهای مدیریت. |
| [systemLogs.js](../server/lib/systemLogs.js) | دسترسی به منابع گزارش‌های نصب، سرویس و پردازشگر. |
| [turnHealth.js](../server/lib/turnHealth.js) | بررسی دسترس‌پذیری و وضعیت سرور TURN. |
| [timeUtils.js](../server/lib/timeUtils.js) | ساخت زمان‌بندی‌ها و توالی زمان‌ها برای ابزارها. |
| [uploads.js](../server/lib/uploads.js) | کنترل مسیر و دسترسی فایل‌های محلی پیام و آواتار. |
| [mongoFileJobs.js](../server/lib/mongoFileJobs.js) | نگه‌داری و کارهای فایل متکی بر MongoDB. |
| [messageFileJobs.js](../server/lib/messageFileJobs.js) | ورودی کارهای نگه‌داری فایل و اتصال به پیاده‌سازی مربوط. |
| [mongoRetention.js](../server/lib/mongoRetention.js) | اعمال انقضای متن پیام‌ها و تکمیل زمان انقضای داده‌های قبلی. |
| [mediaQueue.js](../server/lib/mediaQueue.js) | صف و محدودیت کارهای پردازش رسانه؛ بخشی از امکانات قابل پیکربندی پردازش است. |
| [mediaWorker.js](../server/lib/mediaWorker.js) | ارسال کار پردازش رسانه به پردازشگر محلی یا بیرونی و مدیریت تلاش مجدد. |
| [localWorkerManager.js](../server/lib/localWorkerManager.js) | راه‌اندازی، بررسی سلامت و توقف پردازشگر محلی. |
| [videoTranscode.js](../server/lib/videoTranscode.js) | هماهنگی درخواست و نتیجهٔ تبدیل ویدیو. |
| [storage/StorageProvider.js](../server/lib/storage/StorageProvider.js) | قرارداد مشترک عملیات ذخیره‌سازی فایل. |
| [storage/LocalStorageProvider.js](../server/lib/storage/LocalStorageProvider.js) | ذخیره و خواندن بایت فایل‌ها در دیسک محلی. |
| [storage/RemoteStorageProvider.js](../server/lib/storage/RemoteStorageProvider.js) | ذخیره و خواندن بایت فایل‌ها در فضای S3-compatible. |
| [storage/index.js](../server/lib/storage/index.js) | انتخاب پیاده‌سازی ذخیره‌سازی از تنظیمات. |
| [storageEncryption.js](../server/lib/storageEncryption.js) | رمزنگاری بایت فایل‌های ذخیره‌شده و ابزارهای مرتبط. |
| [storageLayoutMigration.js](../server/lib/storageLayoutMigration.js) | انتقال صریح کلیدها و چیدمان تاریخی فایل‌ها. |
| [thumbUrl.js](../server/lib/thumbUrl.js) | ساخت مسیر درست تصویر بندانگشتی، از جمله برای فایل رمزنگاری‌شده. |
| [bucketCors.js](../server/lib/bucketCors.js) | تنظیم و بررسی CORS مورد نیاز بارگذاری در bucket. |
| [webhookUrl.js](../server/lib/webhookUrl.js) | تعیین نشانی callback سرور برای پردازشگر. |
| [remoteChannels.js](../server/lib/remoteChannels.js) | مدیریت اتصال ارائه‌دهنده و دریافت محتوای کانال خارجی. |
| [remoteChannelSecrets.js](../server/lib/remoteChannelSecrets.js) | مدیریت اطلاعات محرمانهٔ اتصال ارائه‌دهنده. |
| [remoteMirrorJobs.js](../server/lib/remoteMirrorJobs.js) | ثبت و پیگیری کارهای آینه‌سازی فایل. |
| [remoteMirrorDispatch.js](../server/lib/remoteMirrorDispatch.js) | ارسال کار آینه‌سازی به پردازشگر مناسب. |
| [redis.js](../server/lib/redis.js) | پشتیبانی اختیاری از اتصال Redis و ذخیرهٔ نشست؛ وجود فایل به معنی الزام استقرار Redis نیست. |
| [inviteTokens.js](../server/lib/inviteTokens.js) | ساخت توکن دعوت. |
| [workers/autoAddWorker.js](../server/lib/workers/autoAddWorker.js) | رسیدگی به رویداد ساخت کاربر برای عضویت خودکار در گروه‌های تنظیم‌شده. |
| [postgresMaintenance.js](../server/lib/postgresMaintenance.js) | ابزار نگه‌داری PostgreSQL در بخش سازگاری تاریخی؛ موتور فعال چت MongoDB است. |
| [sqlNormalizer.js](../server/lib/sqlNormalizer.js) | تبدیل عبارت‌های SQL در ابزارهای تاریخی و تست‌های مربوط به آن‌ها. |

## پردازشگر رسانه

مسیر پایه: `worker/`

| فایل | مسئولیت |
| --- | --- |
| [ffmpeg.js](../worker/ffmpeg.js) | اجرای ffmpeg و استخراج مشخصات، بندانگشتی و خروجی مناسب رسانه. |
| [storage.js](../worker/storage.js) | خواندن و نوشتن فایل مورد نیاز پردازشگر در فضای ذخیره‌سازی. |
| [encryption.js](../worker/encryption.js) | رمزگشایی موقت ورودی و رمزنگاری خروجی رسانه. |
| [Dockerfile](../worker/Dockerfile) | تصویر مستقل پردازشگر رسانه. |
| [docker-compose.yaml](../worker/docker-compose.yaml) | پیکربندی استقرار مستقل پردازشگر. |

## ابزارهای عملیاتی و فرمان‌ها

مسیر پایه: `server/scripts/`

| فایل | مسئولیت |
| --- | --- |
| [mongo-cli.js](../server/scripts/mongo-cli.js) | CLI اصلی و فعلی MongoDB؛ بررسی، بازرسی، بکاپ، بازیابی، import و ابزارهای مدیریت. |
| [backfill-message-file-metadata.js](../server/scripts/backfill-message-file-metadata.js) | تکمیل فرادادهٔ فایل‌های موجود. |
| [configure-bucket-cors.js](../server/scripts/configure-bucket-cors.js) | تنظیم CORS فضای فایل از مسیر صریح عملیاتی. |
| [configure-remote-channel.js](../server/scripts/configure-remote-channel.js) | تنظیم اتصال کانال خارجی. |
| [migrate-storage-layout.js](../server/scripts/migrate-storage-layout.js) | انتقال صریح چیدمان قدیمی کلیدهای فضای فایل. |
| [_cli.js](../server/scripts/_cli.js) | پردازش آرگومان‌ها و ورودی‌های تعاملی ابزارهای خط فرمان. |
| [_db-admin.js](../server/scripts/_db-admin.js) | زیرساخت فرمان‌های تاریخی مدیریت SQL و سازگاری ابزارهای قدیمی؛ جایگزین CLI اصلی MongoDB نیست. |
| [_addChatMemberLogic.js](../server/scripts/_addChatMemberLogic.js) | منطق مشترک ابزار تاریخی افزودن عضو. |
| [create-user.js](../server/scripts/create-user.js) | فرمان تاریخی ساخت کاربر؛ برای مسیر فعلی از db:user:create استفاده شود. |
| [edit-user.js](../server/scripts/edit-user.js) | فرمان تاریخی ویرایش کاربر؛ مسیر فعلی db:user:edit است. |
| [delete-user.js](../server/scripts/delete-user.js) | فرمان تاریخی حذف کاربر؛ مسیر فعلی db:user:delete است. |
| [ban-user.js](../server/scripts/ban-user.js) | فرمان تاریخی مسدودکردن کاربر؛ مسیر فعلی db:user:ban است. |
| [verify-user.js](../server/scripts/verify-user.js) | فرمان تاریخی تأیید کاربر؛ مسیر فعلی db:user:verify است. |
| [generate-user.js](../server/scripts/generate-user.js) | ابزار تاریخی تولید کاربر؛ فرمان فعلی db:user:generate است. |
| [check-owner.js](../server/scripts/check-owner.js) | بررسی تاریخی حساب مالک؛ فرمان فعلی db:owner:check است. |
| [create-chat.js](../server/scripts/create-chat.js) | فرمان تاریخی ساخت گفتگو؛ فرمان فعلی db:chat:create است. |
| [edit-chat.js](../server/scripts/edit-chat.js) | فرمان تاریخی ویرایش گفتگو؛ فرمان فعلی db:chat:edit است. |
| [delete-chat.js](../server/scripts/delete-chat.js) | فرمان تاریخی حذف گفتگو؛ فرمان فعلی db:chat:delete است. |
| [verify-chat.js](../server/scripts/verify-chat.js) | فرمان تاریخی تأیید گفتگو؛ فرمان فعلی db:chat:verify است. |
| [add-chat-member.js](../server/scripts/add-chat-member.js) | فرمان تاریخی افزودن عضو؛ فرمان فعلی db:chat:add است. |
| [generate-chat-message.js](../server/scripts/generate-chat-message.js) | ابزار تاریخی تولید پیام؛ فرمان فعلی db:message:generate است. |
| [delete-file.js](../server/scripts/delete-file.js) | فرمان تاریخی حذف فایل؛ فرمان فعلی db:file:delete است. |
| [backup-db.js](../server/scripts/backup-db.js) | ابزار تاریخی بکاپ؛ بکاپ جاری MongoDB با db:backup اجرا می‌شود. |
| [restore-db.js](../server/scripts/restore-db.js) | ابزار تاریخی بازیابی؛ مسیر فعلی db:restore است. |
| [reset-db.js](../server/scripts/reset-db.js) | ابزار تاریخی بازنشانی؛ مسیر فعلی db:reset است. |
| [delete-db.js](../server/scripts/delete-db.js) | ابزار تاریخی حذف دیتابیس؛ مسیر فعلی db:delete است. |
| [vacuum-db.js](../server/scripts/vacuum-db.js) | ابزار تاریخی نگه‌داری؛ فرمان فعلی db:vacuum به CLI MongoDB متصل است. |
| [inspect-db.js](../server/scripts/inspect-db.js) | ابزار تاریخی بازرسی؛ مسیر فعلی db:inspect است. |
| [migrate.js](../server/scripts/migrate.js) | فرمان مهاجرت تاریخی SQL؛ آغاز عادی MongoDB از mongoSchema عبور می‌کند. |
| [db-help.js](../server/scripts/db-help.js) | راهنمای ابزارهای مدیریت دیتابیس. |

## استقرار، مستندات و قراردادهای پروژه

| فایل | مسئولیت |
| --- | --- |
| [Dockerfile](../Dockerfile) | ساخت چندمرحله‌ای بستهٔ برنامه و وابستگی‌های سرور و پردازشگر. |
| [docker-compose.yaml](../docker-compose.yaml) | اتصال سرویس‌های برنامه در استقرار Compose. |
| [docker-compose.mongo.yaml](../docker-compose.mongo.yaml) | پیکربندی MongoDB و replica set مورد نیاز تراکنش‌ها. |
| [nginx/nginx.conf](../nginx/nginx.conf) | تنظیمات اصلی Nginx. |
| [nginx/proxy-settings.conf](../nginx/proxy-settings.conf) | تنظیمات مشترک پراکسی سرویس‌ها در Nginx. |
| [scripts/install.sh](../scripts/install.sh) | نصب و آماده‌سازی استقرار. |
| [scripts/gen-certs.sh](../scripts/gen-certs.sh) | ساخت گواهی‌های مورد نیاز محیط نصب. |
| [scripts/docker-entrypoint.sh](../scripts/docker-entrypoint.sh) | ورودی اجرای کانتینر و راه‌اندازی سرویس. |
| [scripts/run-data-command.sh](../scripts/run-data-command.sh) | اجرای کنترل‌شدهٔ فرمان‌های مربوط به داده در استقرار. |
| [.github/workflows/build.yml](../.github/workflows/build.yml) | اجرای تست‌های سرور، کلاینت، پردازشگر و اسکریپت‌ها در CI. |
| [.github/workflows/docker.yml](../.github/workflows/docker.yml) | ساخت و انتشار تصویر Docker. |
| [.github/workflows/docs.yml](../.github/workflows/docs.yml) | ساخت و انتشار مستندات. |
| [.github/workflows/release.yml](../.github/workflows/release.yml) | جریان انتشار نسخه. |
| [.github/workflows/codeql.yml](../.github/workflows/codeql.yml) | بررسی ایستای امنیتی در CI. |
| [release.config.mjs](../release.config.mjs) | پیکربندی انتشار خودکار و یادداشت نسخه. |
| [render.yaml](../render.yaml) | قالب اختیاری استقرار Render؛ با تنظیمات Compose فعلی یکی نیست. |
| [.railway/railway.ts](../.railway/railway.ts) | تعریف قالب و خدمات استقرار Railway. |
| [playbook.yaml](../playbook.yaml) | برنامهٔ عملیاتی نصب و استقرار با Ansible. |
| [premium-ui.json](../premium-ui.json) | دامنه و قراردادهای بررسی خودکار کیفیت رابط. |
| [opencode.json](../opencode.json) | تنظیم ابزار توسعهٔ OpenCode. |
| [.vscode/settings.json](../.vscode/settings.json) | تنظیمات محلی مشترک ویرایشگر برای مخزن. |
| [VERSION](../VERSION) | شمارهٔ نسخهٔ مورد استفاده در اطلاعات برنامه. |
| [CHANGELOG.md](../CHANGELOG.md) | تغییرات نسخه‌ها؛ در زمان اجرای برنامه نیز مصرف می‌شود. |
| [DESIGN.md](../DESIGN.md) | مرجع رنگ، تایپوگرافی، تم، دسترس‌پذیری و الگوهای رابط. |
| [UX-CONTRACT.md](../UX-CONTRACT.md) | مرجع رفتار جریان‌ها، وضعیت‌ها، خطا، زبان و بازیابی در رابط. |
| [ACCESSIBILITY.md](../ACCESSIBILITY.md) | راهنمای دسترس‌پذیری پروژه. |
| [AGENTS.md](../AGENTS.md) | قرارداد توسعه، مالکیت داده و قواعد کار با مخزن. |
| [SECURITY.md](../SECURITY.md) | راهنمای گزارش و رسیدگی به مسئلهٔ امنیتی. |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | راهنمای مشارکت در توسعه. |
| [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | قواعد مشارکت در پروژه. |
| [LICENSE](../LICENSE) | مجوز پروژهٔ اصلی؛ حفظ آن الزامی است. |
| [README.md](../README.md) | راهنمای اصلی انگلیسی و ورودی مستندات. |
| [README.fa_IR.md](../README.fa_IR.md) | راهنمای اصلی فارسی. |
| [docs/.vitepress/config.mjs](../docs/.vitepress/config.mjs) | ناوبری، زبان‌ها و تنظیمات سایت مستندات. |
| [docs/.vitepress/theme/index.js](../docs/.vitepress/theme/index.js) | ورودی تم سایت مستندات. |
| [docs/.vitepress/theme/custom.css](../docs/.vitepress/theme/custom.css) | استایل‌ها و جهت فارسی سایت مستندات. |
| [server/migrations/index.js](../server/migrations/index.js) | فهرست migrationهای تاریخی مورد نیاز ابزارهای قدیمی و تست قرارداد انتقال. |
| [docs/fa/MongoDB.md](../docs/fa/MongoDB.md) | راهنمای فارسی راه‌اندازی، import، بکاپ و تست MongoDB. |
| [docs/fa/Chat-Features.md](../docs/fa/Chat-Features.md) | راهنمای فارسی قابلیت‌های چت. |

## دارایی‌ها و پوشه‌هایی که نباید با فایل اضافه اشتباه شوند

| مسیر | چرا نگه داشته شده است؟ |
| --- | --- |
| `client/src/assets/wallpapers/` | الگوهای SVG انتخاب پس‌زمینهٔ چت؛ از نگاشت والپیپر مصرف می‌شوند. |
| `client/src/assets/fonts/` | فونت‌های محلی Vazirmatn و DM Sans؛ وابسته به سرویس فونت بیرونی نیستند. |
| `client/public/manifest*.webmanifest` | اطلاعات نصب PWA در هر دو زبان. |
| `client/public/sw.js` | دریافت Push در پس‌زمینه، اعلان، badge و کش برنامه در محدودهٔ پشتیبانی مرورگر. |
| `client/public/ouj-logo.png` و `ouj-icons/` | لوگو و آیکون‌های نصب اوج. |
| `client/public/icons/icon-192.png` | هنوز در راهنمای نصب برنامه مصرف می‌شود؛ هشت آیکون دیگر در همین پوشه مصرف‌کننده‌ای در کد و پیکربندی فعلی ندارند. |
| `client/public/songbird-logo.svg` | تصویر پروژهٔ اصلی در READMEها؛ با لوگوی جاری برنامه اشتباه نشود. |
| `client/public/sounds/` | صدای تماس و پایان تماس. |
| `client/public/licenses/` | مجوز دادهٔ Unicode و انتخابگر ایموجی. |
| `docs/public/` | دارایی‌های سایت مستقل مستندات؛ تکرار بعضی فونت‌ها با فرانت‌اند، مصرف مستقل دارد. |
| `docs/*.md` و `docs/fa/*.md` | نسخه‌های انگلیسی و فارسی موضوع‌های مستندات. |
| `server/migrations/` | تاریخچه و قراردادهای انتقال SQL؛ schema فعال MongoDB در mongoSchema تعریف می‌شود. |
| `server/settings/` | خواندن و اعتبارسنجی تنظیمات محیط و رنگ‌ها. |
| `graphify-out/` | گراف وابستگی و راهنمای پیمایش کد؛ بخشی از ابزار توسعه است. |
| `data/`، `server/data/` و `worker/data/` در صورت وجود | دادهٔ واقعی یا فایل‌های زمان اجرا؛ هدف پاکسازی فایل‌های منبع نیستند. |
| `node_modules/` | وابستگی نصب‌شدهٔ هر بخش؛ حذفش نیاز به نصب مجدد دارد. |
| `.env` و فایل‌های محیط خصوصی | تنظیمات محلی و اسرار؛ نباید وارد این راهنما یا کنترل نسخه شوند. |

## تست‌ها چه نقشی دارند؟

- `client/test/utils/` و `client/test/hooks/`: بررسی توابع، کش، پیش‌نویس، تاریخ، ایموجی و منطق مستقل.
- `client/test/components/`: تعامل اجزای واقعی در مرورگر، مانند نگه‌داشتن، ضبط، آپلود، تقویم و جای‌گذاری منو.
- `client/test/e2e/`: سناریوهای سرتاسری و بررسی ظاهری و رفتاری؛ بعضی به‌صورت دستی و با برنامهٔ آمادهٔ اجرا استفاده می‌شوند.
- `server/test/api/` و `server/test/lib/`: قراردادهای HTTP، مجوز، رویداد و منطق سرور با وابستگی تزریق‌شده.
- `server/test/helpers/makeApp.js`: ساخت سرور آزمایشی بدون واردکردن دیتابیس زنده.
- `server/test/mongo/`: بررسی MongoDB واقعی و تراکنش روی دیتابیس جداگانهٔ تست.
- `worker/test/`: بررسی پردازش، ذخیره‌سازی، رمزنگاری و درخواست‌های پردازشگر رسانه.
- `scripts/test/`: بررسی نصب و اسکریپت‌های استقرار با Bats.

این تست‌ها در اجرای عادی مرورگر بارگذاری نمی‌شوند و قواعد Docker فعلی نیز آن‌ها را از تصویر نهایی کنار می‌گذارند. تست‌هایی که فقط کد واقعاً کنارگذاشته‌شده را بررسی می‌کردند، همراه همان کد پاک شدند؛ تست فعال، فایل بلااستفاده محسوب نمی‌شود.

## خروجی‌های قابل تولید مجدد

| مسیر | نوع فایل |
| --- | --- |
| `client/.vitest/` و `.vitest-attachments/` | عکس خطا، تصویر بررسی رابط و خروجی اجرای تست. |
| `coverage/`، `test-results/` و `playwright-report/` | گزارش‌های تست و پوشش کد. |
| `docs/.vitepress/.temp/` و `cache/` | خروجی موقت ساخت مستندات. |
| `docs/.vitepress/dist/` | سایت ساخته‌شده؛ با `npm run docs:build` دوباره ساخته می‌شود. |
| `graphify-out/cache/` | کش استخراج کد؛ گراف اصلی با آن یکی نیست. |
| `client/dist/` | خروجی ساخت فرانت‌اند؛ برای سرو نسخهٔ ساخته‌شده لازم است و با `npm run build` ساخته می‌شود. |

وجود خروجی تولیدشده، به معنی نیاز به حذف فایل منبع مربوط به آن نیست.

### پاکسازی دستی خروجی‌ها و آیکون‌های بدون مصرف

کدهای بدون مصرف و تست‌های مخصوص همان کدها پاک شده‌اند. حذف مستقیم آیکون‌های باینری و پوشهٔ موقت با فرمان سیستم، در محیط اجرای دستیار با پیام `blocked by policy` رد شد؛ آیکون‌ها و پوشه‌های تولیدی زیر در این نوبت حذف نشده‌اند.

برای تکمیل این بخش، پس از بستن اجرای تست و ساخت مستندات، PowerShell را در ریشهٔ همین پروژه باز کنید و فرمان زیر را اجرا کنید. مسیر هر مورد پیش از حذف به مسیر کامل تبدیل و محدودبودن آن به همین مخزن بررسی می‌شود. دادهٔ برنامه، اسرار، وابستگی‌ها و خروجی فعال فرانت‌اند در این فهرست نیستند.

```powershell
if (!(Test-Path -LiteralPath '.\client\package.json') -or !(Test-Path -LiteralPath '.\AGENTS.md')) {
    throw 'Run this command from the chatamlak repository root.'
}
$cleanupWorkspace = (Resolve-Path -LiteralPath '.').ProviderPath
$cleanupTargets = @(
    'client/.vitest',
    'docs/.vitepress/.temp',
    'docs/.vitepress/dist',
    'graphify-out/cache',
    'client/public/icons/favicon.ico',
    'client/public/icons/icon-16.png',
    'client/public/icons/icon-180.png',
    'client/public/icons/icon-192-maskable.png',
    'client/public/icons/icon-32.png',
    'client/public/icons/icon-512-circular.png',
    'client/public/icons/icon-512-maskable.png',
    'client/public/icons/icon-512.png'
)
foreach ($relative in $cleanupTargets) {
    $candidate = Join-Path $cleanupWorkspace $relative
    if (!(Test-Path -LiteralPath $candidate)) { continue }
    $resolved = (Resolve-Path -LiteralPath $candidate).ProviderPath
    if (!$resolved.StartsWith($cleanupWorkspace + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Target is outside the repository.'
    }
    $item = Get-Item -LiteralPath $resolved -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing a linked target.' }
    if ($item.PSIsContainer) {
        $links = Get-ChildItem -LiteralPath $resolved -Force -Recurse |
            Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }
        if ($links) { throw 'Refusing a directory that contains linked paths.' }
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction Stop
}
```

## فرمان‌های پرکاربرد

```bash
npm run dev
npm run build
npm --prefix client run test:unit
npm --prefix client run test:browser
npm --prefix server run test
npm --prefix server run test:mongo
npm --prefix worker run test
npm run docs:build
```

برای اتصال و اجرای MongoDB، واردکردن داده و بکاپ به [راهنمای MongoDB فارسی](../docs/fa/MongoDB.md) مراجعه کنید. تست Mongo واقعی باید دیتابیس آزمایشی مستقل داشته باشد؛ بکاپ بایت فایل‌ها نیز جدا از بکاپ دیتابیس است.

