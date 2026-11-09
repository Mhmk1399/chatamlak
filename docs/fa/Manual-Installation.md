# نصب دستی

**پیش‌نیازها (دستورالعمل Ubuntu 22.04+):**

- یک سرور Ubuntu با دسترسی sudo
- یک نام دامنه که به IP عمومی سرور شما اشاره می‌کند (توصیه‌شده)
- replica set در MongoDB 8 یا استقرار مناسب Atlas؛ مطابق [راهنمای MongoDB](./MongoDB.md) تنظیم کنید.

## ۱. راه‌اندازی سیستم

بسته‌های موردنیاز را به‌روزرسانی و نصب کنید:

```bash
sudo apt update
sudo apt install -y git curl build-essential nginx python3-certbot-nginx ffmpeg
```

Node.js و npm را نصب کنید (یکی را انتخاب کنید):

| روش | بهترین برای | یادداشت |
|---|---|---|
| NodeSource | بیشتر نصب‌ها (توصیه‌شده) | نصب سراسری سیستم از طریق apt. |
| nvm | مدیریت نسخه Node برای هر کاربر | پس از کلون‌کردن به `nvm install` / `nvm use` نیاز دارد. |
| Volta | زنجیره ابزار پین‌شده برای هر پروژه | یک نسخه مشخص از Node/npm نصب می‌کند. |

**NodeSource (توصیه‌شده)**:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

**nvm**:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/latest/install.sh | bash
```

**Volta**:

```bash
curl https://get.volta.sh | bash
volta install node@24.22.1 npm@11.18.0
```

## ۲. کلون‌کردن مخزن

نشانی مخزن مورد اعتماد مسئول استقرار را در متغیر `OUJ_CHAT_REPOSITORY_URL` قرار دهید، یا سورس بررسی‌شده را در `/opt/ouj-chat` کپی کنید. در این راهنما مخزن عمومی مشخصی فرض نمی‌شود.

```bash
sudo mkdir -p /opt/ouj-chat
cd /opt/ouj-chat
git clone "$OUJ_CHAT_REPOSITORY_URL" .
```

:::info

اگر Node.js را با استفاده از nvm نصب کرده‌اید:

```bash
nvm install
nvm use
```

:::

## ۳. تنظیم MongoDB و نصب وابستگی‌ها

در ریشهٔ مخزن، `.env.example` را به `.env` کپی کنید و `MONGODB_URI` عمداً خالی را با URI مربوط به replica set یا Atlas تکمیل کنید. مقدار `MONGODB_DATABASE=ouj_chat` را نگه دارید. MongoDB مستقل و متغیرهای قدیمی SQL جایگزین اجرای فعلی نیستند.

```bash
cd /opt/ouj-chat
cp .env.example .env
npm install
npm --prefix client install
npm --prefix server install
npm --prefix worker install
npm run build
```

برای توسعهٔ محلی از `npm run dev` و برای اجرای API و برنامهٔ ساخته‌شده از `npm --prefix server run start` استفاده کنید. سرویس پایین به همان محیط خصوصی و primary در دسترس MongoDB نیاز دارد. نصب replica set با Docker یا محلی، Atlas، ورود داده، پشتیبان و آزمون در [MongoDB](./MongoDB.md) آمده است.

## ۴. ایجاد سرویس systemd

فایل `/etc/systemd/system/ouj-chat.service` را با محتوای زیر ایجاد کنید:

```ini
[Unit]
Description=گفتگوی اوج server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ouj-chat/server
ExecStart=/usr/bin/env node /opt/ouj-chat/server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

:::info

- اگر Node.js را با استفاده از nvm نصب کرده‌اید، این مسیر Node را در `ExecStart` تنظیم کنید:

```ini
ExecStart=/root/.nvm/versions/node/v24.22.1/bin/node index.js
```

- اگر Node.js را با استفاده از volta نصب کرده‌اید، این مسیر Node را در `ExecStart` تنظیم کنید:

```ini
ExecStart=/root/.volta/bin/node index.js
```

:::

**توصیه‌شده: ایجاد یک کاربر اختصاصی:**

:::warning

اگر Node.js را با استفاده از nvm یا volta نصب کرده‌اید، از این مرحله صرف‌نظر کنید.

:::

به‌دلیل ملاحظات امنیتی، توصیه می‌شود یک کاربر سیستمی اختصاصی ایجاد کرده و مالکیت پوشه پروژه را تغییر دهید:

1. این خطوط را به فایل سرویس systemd اضافه کنید:

```ini
User=ouj-chat
Group=ouj-chat
```

2. یک کاربر سیستمی اختصاصی ایجاد کنید:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin ouj-chat
```

3. مالکیت پوشه پروژه را تغییر دهید:

```bash
sudo chown -R ouj-chat:ouj-chat /opt/ouj-chat
git config --global --add safe.directory /opt/ouj-chat
```

4. به کاربر سرویس اجازه دهید واحد خودش را کنترل کرده و لاگ‌های سیستم را بخواند (لازم است برای دکمه‌های راه‌اندازی مجدد/توقف سرویس و تب Logs در پنل ادمین):

```bash
sudo tee /etc/sudoers.d/ouj-chat > /dev/null <<'EOF'
# گفتگوی اوج — allow the service user to control its own unit
# and read privileged logs without a password.
ouj-chat ALL=(root) NOPASSWD: /usr/bin/systemctl restart ouj-chat.service
ouj-chat ALL=(root) NOPASSWD: /usr/bin/systemctl stop ouj-chat.service
ouj-chat ALL=(root) NOPASSWD: /usr/bin/journalctl -u ouj-chat *
ouj-chat ALL=(root) NOPASSWD: /usr/bin/journalctl -u ouj-chat-worker *
ouj-chat ALL=(root) NOPASSWD: /usr/bin/cat /var/log/nginx/error.log
ouj-chat ALL=(root) NOPASSWD: /usr/bin/cat /var/log/nginx/access.log
ouj-chat ALL=(root) NOPASSWD: /usr/bin/nginx -t
ouj-chat ALL=(root) NOPASSWD: /usr/bin/systemctl reload nginx
EOF
sudo chmod 0440 /etc/sudoers.d/ouj-chat
```

بدون این مرحله، دکمه‌های **راه‌اندازی مجدد سرویس** و **توقف سرویس** در پنل ادمین با خطای دسترسی مواجه می‌شوند و لاگ‌های سیستم (journal سرویس، nginx) در تب Logs نمایش داده نمی‌شوند.

**فعال‌سازی و راه‌اندازی سرویس:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ouj-chat.service
```
