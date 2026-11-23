# Chat → Web CRM task integration v1

Status: **implemented as an authenticated server-to-server command**. Owj Web owns CRM tasks; Chat neither writes Web storage nor creates a local CRM shadow record.

## Configuration and authorization

| Variable | Purpose |
|---|---|
| `OWJ_CHAT_CRM_WEB_TASK_URL` | Exact Web CRM task command endpoint; HTTPS in production |
| `OWJ_CHAT_CRM_TO_WEB_SERVICE_TOKEN` | Dedicated Chat CRM → Web Bearer credential, at least 32 characters |

The Chat browser calls `POST /api/integrations/crm/tasks`. Chat requires a current `web_federated` session, force-refreshes Web status, requires the delegated `crm_actor_authorization`, verifies the user is a member of the source conversation, and requires an `Idempotency-Key` matching `[A-Za-z0-9._:-]{8,180}`. A supplied correlation ID is bounded; otherwise Chat generates one.

## Frozen outbound contract

Chat sends Web:

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

Only `type`, `title`, `priority`, `steps`, `assignedUserId`, `assignedConsultantId`, `sellerPropertyCaseId`, `buyerCaseId`, `dueAt`, and `instructions` are accepted. `title` is required; priority is `low`, `normal`, `high`, or `urgent`; steps and text/date fields are bounded.

Chat explicitly rejects `message`, `messageBody`, `privateMessage`, `customer`, `customerName`, `customerPhone`, `contact`, `phone`, `transcript`, `messages`, and every unknown field. It does not read a conversation transcript or forward message content, customer/contact data, or phone details.

Web must return:

```json
{
  "version": 1,
  "task": { "id": "task_synthetic_001", "status": "open", "dueAt": "2026-11-24T12:00:00.000Z", "createdAt": "2026-11-23T08:00:00.000Z" },
  "deduped": false,
  "correlationId": "correlation-synthetic-001"
}
```

The client displays the Web task ID only after a successful response. Ambiguous retries must reuse the caller's same idempotency key; deduplication is Web-owned. Chat uses a six-second timeout, rejects redirects, caps the response at 32 KiB, validates the exact result shape, maps bounded upstream errors, and never exposes either server credential to the browser.

Synthetic accepted/rejected examples are in [`fixtures/chat-sprint4-v1/crm-task-v1.json`](./fixtures/chat-sprint4-v1/crm-task-v1.json).

