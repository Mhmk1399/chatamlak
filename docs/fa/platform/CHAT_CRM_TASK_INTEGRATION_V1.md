# یکپارچه‌سازی وظیفهٔ Chat → Web CRM نسخه ۱

وضعیت: **به‌صورت فرمان سروربه‌سرور احرازشده پیاده‌سازی شده است**. Owj Web مالک وظایف CRM است؛ Chat نه storage وب را می‌نویسد و نه shadow record محلی CRM می‌سازد.

## پیکربندی و مجوز

| متغیر | کاربرد |
|---|---|
| `OWJ_CHAT_CRM_WEB_TASK_URL` | endpoint دقیق فرمان وظیفهٔ CRM وب؛ در تولید HTTPS |
| `OWJ_CHAT_CRM_TO_WEB_SERVICE_TOKEN` | Bearer اختصاصی Chat CRM → Web با حداقل ۳۲ نویسه |

مرورگر Chat مسیر `POST /api/integrations/crm/tasks` را فراخوانی می‌کند. Chat نشست جاری `web_federated`، refresh اجباری status وب، `crm_actor_authorization` نمایندگی، عضویت کاربر در گفتگوی مبدأ و `Idempotency-Key` مطابق `[A-Za-z0-9._:-]{8,180}` را لازم می‌داند. correlation ID ورودی محدود می‌شود و در نبود آن Chat مقدار جدید می‌سازد.

## قرارداد خروجی تثبیت‌شده

Chat این headerها را به Web می‌فرستد:

```http
Authorization: Bearer <server-only-crm-token>
X-Owj-Service: owj-chat-crm
X-Owj-Actor-Authorization: <delegated-server-only-proof>
Idempotency-Key: chat:create:synthetic-001
X-Correlation-Id: correlation-synthetic-001
Content-Type: application/json
```

```json
{
  "version": 1,
  "source": { "conversationId": "conversation_synthetic_001" },
  "task": {
    "type": "follow_up",
    "title": "Review the synthetic request",
    "priority": "normal",
    "steps": [{ "title": "Contact through the approved CRM channel", "required": true }],
    "assignedUserId": "web_user_synthetic_001",
    "assignedConsultantId": "consultant_synthetic_001",
    "sellerPropertyCaseId": "seller_case_synthetic_001",
    "buyerCaseId": "buyer_case_synthetic_001",
    "dueAt": "2026-11-24T12:00:00.000Z",
    "instructions": "Use the approved CRM record."
  }
}
```

فقط `type`، `title`، `priority`، `steps`، `assignedUserId`، `assignedConsultantId`، `sellerPropertyCaseId`، `buyerCaseId`، `dueAt` و `instructions` پذیرفته می‌شوند. `title` الزامی است؛ priority یکی از `low`، `normal`، `high` یا `urgent` است و steps/متن/تاریخ محدودند.

Chat فیلدهای `message`، `messageBody`، `privateMessage`، `customer`، `customerName`، `customerPhone`، `contact`، `phone`، `transcript`، `messages` و هر فیلد ناشناخته را صریح رد می‌کند. transcript گفتگو خوانده نمی‌شود و محتوای پیام، دادهٔ مشتری/تماس یا تلفن فرستاده نمی‌شود.

Web باید برگرداند:

```json
{
  "version": 1,
  "task": { "id": "task_synthetic_001", "status": "open", "dueAt": "2026-11-24T12:00:00.000Z", "createdAt": "2026-11-23T08:00:00.000Z" },
  "deduped": false,
  "correlationId": "correlation-synthetic-001"
}
```

کلاینت فقط پس از پاسخ موفق شناسهٔ وظیفهٔ Web را نمایش می‌دهد. retry مبهم باید همان idempotency key فراخواننده را استفاده کند و deduplication متعلق به Web است. Chat timeout شش‌ثانیه‌ای دارد، redirect را رد می‌کند، پاسخ را به ۳۲ KiB محدود و شکل نتیجه را دقیق اعتبارسنجی می‌کند، خطای upstream را محدود map می‌کند و هیچ اعتبارنامهٔ سروری را به مرورگر نمی‌دهد.

نمونه‌های مصنوعی پذیرفته/ردشده در [`fixtures/chat-sprint4-v1/crm-task-v1.json`](../../platform/fixtures/chat-sprint4-v1/crm-task-v1.json) هستند.

