import {defineConfig} from 'vitepress';

const enSidebar = [
  {
    text: '💬 Using Ouj Chat',
    collapsed: false,
    items: [
      {text: '💬 Chat Features', link: '/Chat-Features'},
    ],
  },
  {
    text: '📦 Installation',
    collapsed: false,
    items: [
      {text: '🚀 Deployment Script', link: '/Deployment-Script'},
      {text: '🐳 Install via Docker', link: '/Installation-Docker'},
      {text: '☁️ Cloud Deployment', link: '/Cloud-Deployment'},
      {text: '🛠️ Manual Installation', link: '/Manual-Installation'},
      {text: '🌐 Configure Nginx', link: '/Nginx-Configuration'},
      {text: '🔒 SSL Certificates', link: '/SSL-Certificates'},
      {text: '☁️ Running behind a CDN', link: '/CDN-Setup'},
      {text: '🧭 Subpath Hosting', link: '/Subpath-Hosting'},
    ],
  },
  {
    text: '⚙️ Configuration',
    collapsed: false,
    items: [
      {text: '🔧 Environment Variables', link: '/Environment-Variables'},
      {text: '🍃 MongoDB Setup & Migration', link: '/MongoDB'},
      {text: '☁️ Object Storage', link: '/Object-Storage'},
      {text: '🎬 Media Worker', link: '/Media-Worker'},
      {text: '🛡️ Admin Panel', link: '/Admin-Panel'},
      {text: '📡 Remote Channel Setup', link: '/Remote-Channel-Setup'},
      {text: '🔔 Push Notification Proxy', link: '/Push-Notification-Proxy'},
      {text: '📞 Voice & Video Calls', link: '/Voice-Video-Calls'},
    ],
  },
  {
    text: '🔨 Operations',
    collapsed: false,
    items: [
      {text: '🔄 Updating', link: '/Updating'},
      {text: '🗃️ Database Commands', link: '/Database-Commands'},
      {text: '🩺 Troubleshooting', link: '/Troubleshooting'},
    ],
  },
];

const faSidebar = [
  {
    text: '💬 استفاده از گفتگوی اوج',
    collapsed: false,
    items: [
      {text: '💬 قابلیت‌های گفتگو', link: '/fa/Chat-Features'},
    ],
  },
  {
    text: '📦 نصب و راه‌اندازی',
    collapsed: false,
    items: [
      {text: '🚀 اسکریپت نصب', link: '/fa/Deployment-Script'},
      {text: '🐳 نصب از طریق Docker', link: '/fa/Installation-Docker'},
      {text: '☁️ استقرار ابری', link: '/fa/Cloud-Deployment'},
      {text: '🛠️ نصب دستی', link: '/fa/Manual-Installation'},
      {text: '🌐 کانفیگ Nginx', link: '/fa/Nginx-Configuration'},
      {text: '🔒 گواهی‌های SSL', link: '/fa/SSL-Certificates'},
      {text: '☁️ اجرا پشت CDN', link: '/fa/CDN-Setup'},
      {text: '🧭 اجرا روی Subpath', link: '/fa/Subpath-Hosting'},
    ],
  },
  {
    text: '⚙️ پیکربندی',
    collapsed: false,
    items: [
      {text: '🔧 متغیرهای محیطی', link: '/fa/Environment-Variables'},
      {text: '🍃 راه‌اندازی و انتقال MongoDB', link: '/fa/MongoDB'},
      {text: '☁️ ذخیره سازی ابری', link: '/fa/Object-Storage'},
      {text: '🎬 ورکر مدیا', link: '/fa/Media-Worker'},
      {text: '🛡️ پنل مدیریت', link: '/fa/Admin-Panel'},
      {text: '📡 راه اندازی Remote Channel', link: '/fa/Remote-Channel-Setup'},
      {text: '🔔 پراکسی Push Notification', link: '/fa/Push-Notification-Proxy'},
      {text: '📞 تماس صوتی و تصویری', link: '/fa/Voice-Video-Calls'},
    ],
  },
  {
    text: '🔨 عملیات',
    collapsed: false,
    items: [
      {text: '🔄 به‌روزرسانی', link: '/fa/Updating'},
      {text: '🗃️ دستورات دیتابیس', link: '/fa/Database-Commands'},
      {text: '🩺 عیب‌یابی', link: '/fa/Troubleshooting'},
    ],
  },
];

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Ouj Chat Docs',
  description: 'Documentation of Ouj Chat, a secure, lightweight, self-hosted chat platform.',

  // Set the documentation host and base path for each deployment.
  base: '/',

  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: false,

  head: [
    ['link', {rel: 'icon', type: 'image/png', href: '/ouj-chat-icon.png'}],
  ],

  themeConfig: {
    // Shared across locales
    logo: '/ouj-chat-icon.png',

    search: {
      provider: 'local',
    },
  },

  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: [
          {text: 'Home', link: '/'},
          {text: 'Guide', link: '/Deployment-Script'},
          {text: 'Chat Features', link: '/Chat-Features'},
        ],
        sidebar: enSidebar,
        footer: {
          message: 'Released under the MIT License.',
          copyright: 'Copyright © 2026 Ouj Chat',
        },
      },
    },

    fa: {
      label: 'فارسی',
      lang: 'fa-IR',
      title: 'راهنمای گفتگوی اوج',
      description: 'مستندات گفتگوی اوج، پیام‌رسان سبک و امن برای میزبانی شخصی.',
      link: '/fa/',
      themeConfig: {
        nav: [
          {text: 'خانه', link: '/fa/'},
          {text: 'راهنما', link: '/fa/Deployment-Script'},
          {text: 'قابلیت‌های گفتگو', link: '/fa/Chat-Features'},
        ],
        sidebar: faSidebar,
        footer: {
          message: 'تحت لایسنس MIT منتشر شده است.',
          copyright: 'کپی‌رایت © ۲۰۲۶ گفتگوی اوج',
        },
        docFooter: {
          prev: 'صفحه قبل',
          next: 'صفحه بعد',
        },
        outline: {label: 'در این صفحه'},
        lastUpdated: {text: 'آخرین به‌روزرسانی'},
        langMenuLabel: 'تغییر زبان',
        returnToTopLabel: 'بازگشت به بالا',
        sidebarMenuLabel: 'منو',
        darkModeSwitchLabel: 'حالت تیره',
      },
    },
  },
});
