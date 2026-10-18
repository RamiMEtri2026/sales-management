# Sales Management System — نظام إدارة المبيعات

نظام إدارة مبيعات ومشتريات ومخزون وخزينة، عربي بالكامل (RTL) والعملة الافتراضية EGP.

## تشغيل محلي

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # فحص الأنواع + بناء النسخة النهائية في dist/
```

بدون متغير `VITE_API_URL` يعمل التطبيق في **الوضع المحلي**: كل البيانات تُحفظ في `localStorage`
داخل متصفح المستخدم (مناسب للتجربة والعرض).

## النشر على GitHub Pages

1. أنشئ مستودعًا جديدًا على GitHub وارفع الكود على الفرع `main`.
2. من **Settings → Pages** اختر **Source: GitHub Actions**.
3. أي `push` على `main` يشغّل `.github/workflows/deploy.yml` تلقائيًا،
   وسيظهر الرابط في تبويب **Actions** ثم **Settings → Pages**.

> ملاحظة: GitHub Pages يستضيف الواجهة فقط. مجلد `server/` (Express + SQLite) يحتاج استضافة
> تشغّل Node، ولا يعمل على Pages. راجع `DEPLOYMENT.md` و`server/README.md`.
