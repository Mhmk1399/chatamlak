# نصب از طریق Docker

:::tip نکته زیرساخت
این راهنما از Docker Compose استفاده میکند و برای **IaaS** (زیرساخت به عنوان سرویس — سرورها یا ماشین های مجازی اختصاصی که Docker Engine را اجرا میکنند) طراحی شده است. اگر قصد استقرار روی پلتفرم های ابری مدیریت شده (PaaS / CaaS) مانند Render، Railway، AWS ECS، Google Cloud Run یا Kubernetes را دارید، به راهنمای [استقرار ابری](./Cloud-Deployment.md) مراجعه کنید.
:::

**پیش‌نیازها (دستورالعمل Ubuntu 22.04+):**

- یک سرور Ubuntu با دسترسی sudo
- یک نام دامنه که به IP عمومی سرور شما اشاره می‌کند (توصیه‌شده)
- replica set در MongoDB 8 یا استقرار مناسب Atlas که از کانتینر برنامه در دسترس باشد

## ۱. راه‌اندازی سیستم

این بسته‌ها را نصب کنید:

```bash
sudo apt install -y ca-certificates gnupg lsb-release
```

کلید رسمی GPG مربوط به Docker را اضافه کنید:

```bash
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
```

مخزن apt مربوط به Docker را اضافه کنید:

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Docker Engine + افزونه Compose را نصب کنید:

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

اختیاری: اجرای Docker بدون `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

اختیاری: بررسی نصب:

```bash
docker --version
docker compose version
docker run hello-world
```

## ۲. کلون‌کردن مخزن

```bash
sudo mkdir -p /opt/songbird
cd /opt/songbird
git clone https://github.com/bllackbull/Songbird.git .
```

## ۳. پیکربندی محیط

فایل نمونه محیطی را کپی کرده و ویرایش کنید:

```bash
cp .env.example .env
nano .env
```

:::info اتصال MongoDB الزامی است
فایل اصلی `docker-compose.yaml` برنامه و nginx را به **replica set خارجی MongoDB یا Atlas** متصل می‌کند. `MONGODB_URI` عمداً خالی را در `.env` خصوصی تکمیل کنید و `DB_CLIENT=mongodb` و `MONGODB_DATABASE=ouj_chat` را نگه دارید. نام میزبان‌ها، از جمله نام‌های اعلام‌شدهٔ اعضای replica set، باید از کانتینر برنامه در دسترس باشند. فایل اصلی دیتابیس SQL نمی‌سازد و دادهٔ قدیمی را وارد نمی‌کند. راه‌اندازی و انتقال در [MongoDB](./MongoDB.md) آمده است.

فایل جداگانهٔ `docker-compose.mongo.yaml` برای توسعه با اجرای Node.js **روی میزبان** است. MongoDB را روی `127.0.0.1:27017` منتشر و `localhost:27017` را اعلام می‌کند؛ این آدرس از کانتینر برنامه به دیتابیس میزبان اشاره نمی‌کند. این دو فایل Compose را به‌عنوان یک مجموعهٔ برنامه و دیتابیس ترکیب نکنید. به‌جای آن، [راه‌اندازی توسعه روی میزبان](./MongoDB#mongodb-محلی-با-docker) را دنبال کنید.

volume با نام `songbird-data` همچنان باینری آپلود محلی و فایل‌های محلی زمان اجرا را حفظ می‌کند و volume دیتابیس MongoDB نیست. از استقرار MongoDB و volume فایل‌ها جداگانه پشتیبان بگیرید.
:::

:::info کانتینر Media Worker
کانتینر یکپارچهٔ برنامه به‌طور پیش‌فرض فرایند محلی ورکر مدیا را مدیریت می‌کند. ورکر مستقل هم قابل تنظیم است؛ [ورکر مدیا](./Media-Worker.md) را ببینید. اگر image منتشرشدهٔ برنامه یا ورکر را انتخاب می‌کنید، نسخه و پشتیبانی دیتابیس موردنظر را در آن بررسی کنید.
:::

## ۴. راه‌اندازی گواهی‌نامه TLS

کانتینر nginx برای اجرا به فایل‌های گواهی‌نامه TLS نیاز دارد. گواهی‌نامه و کلید خصوصی خود را در مسیرهای زیر قرار دهید:

- `certs/cert.pem` — گواهی‌نامه (یا زنجیره کامل)
- `certs/key.pem` — کلید خصوصی

برای دیدن گزینه‌های موجود، به [گواهی‌نامه‌های SSL](./SSL-Certificates.md) مراجعه کنید.

## ۵. ساخت و اجرا

سورس همین نسخه را بسازید و کانتینرها را اجرا کنید:

```bash
cd /opt/songbird
docker compose up -d --build
```

فایل اصلی Compose به‌طور پیش‌فرض سورس محلی را می‌سازد. برای استفاده از image منتشرشده، نسخه‌ای را صریحاً انتخاب کنید که این پیاده‌سازی MongoDB را داشته باشد؛ نام یک tag بالادستی به‌تنهایی نشان نمی‌دهد تغییرات سورس محلی در آن وجود دارند.

کانتینر nginx قبل از پذیرش ترافیک منتظر می‌ماند تا بررسی سلامت اپلیکیشن موفق شود. این کار از خطاهای 502 در طول پنجره راه‌اندازی کوتاه هنگام اجرای migration جلوگیری می‌کند.

اختیاری: بررسی موفقیت‌آمیز بودن راه‌اندازی کانتینرها:

```bash
docker compose ps
docker compose logs -f
```

:::info پیکربندی Nginx

کانتینر nginx با استفاده از گواهی‌نامه‌های موجود در پوشه `certs/`، HTTPS را روی پورت 443 ارائه می‌دهد. برای سفارشی‌سازی پیکربندی nginx، به صفحه [پیکربندی Nginx](./Nginx-Configuration.md) مراجعه کنید. پس از ویرایش `nginx/nginx.conf`، کانتینر nginx را مجدداً راه‌اندازی کنید:

```bash
docker compose restart nginx
```

:::

## کاربر runtime و داده پایدار

استقرارهای Docker از `songbird.service` استفاده نمیکنند. Songbird با کاربر پیکربندی شده برای container اجرا میشود (در image فعلی root است، مگر آنکه `user:` در Compose آن را override کند) و دستورهای پایگاه داده با همان UID/GID ‏container اجرا میشوند:

```bash
docker compose exec songbird npm --prefix /app/server run db:inspect
```

برای اجرای container با یک UID/GID غیر root مشخص، `user:` را در service ‏Compose پیکربندی کنید:

```yaml
services:
  songbird:
    user: "songbird:songbird"
```

اگر به جای named volume پیشفرض از bind mount استفاده میکنید، پیش از راه اندازی Songbird، پوشه host را برای همان UID:GID قابل نوشتن کنید. Songbird مالکیت bind mount روی host را به صورت خودکار تغییر نمیدهد:

```bash
mkdir -p ./data
sudo chown -R songbird:songbird ./data
```

## کنترل سرویس در پنل مدیریت

اقدامات **ریستارت سرویس** و **توقف سرویس** در پنل مدیریت برای استقرار Docker با فراخوانی Docker Engine API از طریق سوکت mount‌شده (`/var/run/docker.sock`) کار می‌کنند. فایل compose متغیر `SONGBIRD_CONTAINER_NAME=songbird` را تنظیم می‌کند تا اپلیکیشن بداند کدام کانتینر را هدف قرار دهد.

اگر نام کانتینر را تغییر دادید یا از نام سفارشی استفاده می‌کنید، متغیر env را به‌روز کنید:

```yaml
# docker-compose.yaml
environment:
  SONGBIRD_CONTAINER_NAME: my-custom-name
```

اگر به کنترل سرویس از پنل مدیریت نیاز ندارید، می‌توانید mount سوکت را از `docker-compose.yaml` حذف کنید:

```yaml
# این خط را در بخش volumes مربوط به songbird حذف یا کامنت کنید:
# - /var/run/docker.sock:/var/run/docker.sock
```

## به‌روزرسانی

سورس را به‌روز کنید؛ سپس دوباره بسازید و راه‌اندازی کنید:

```bash
cd /opt/songbird
docker compose up -d --build
```

اگر image منتشرشده را صریحاً انتخاب کرده‌اید، پیش از راه‌اندازی مجدد همان نسخه را دریافت کنید. برای پشتیبان‌گیری، سازگاری دیتابیس و روند کامل، [به‌روزرسانی](./Updating.md) را ببینید.
