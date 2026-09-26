import { loadConfig } from "./lib/config.mjs";
import { callSignor } from "./lib/engine.mjs";
import fs from "node:fs";
import path from "node:path";

const projectDir = "c:/xampp/htdocs/dream-export";
let modelToUse = "gpt-6-astra";

const systemPrompt = `أنت Sol، كبير المعماريين البرمجيين ومدقق أمان وموثوقية منصات التجارة والدفع المالي (Chief Payment Architect & Systems Auditor) عبر نموذج gpt-6-astra بمستوى جهد متوسط (medium effort).
المستخدم يطلب تدقيقاً شاملاً وحاسماً لمنظومة الدفع والباقات والعملاء بالكامل في منصة Dream Export، بعد أن واجه خطأ جديداً أثناء الدفع الحي:
"لم تكتمل عملية الدفع - تعذر إتمام الدفع بالبطاقة - الطلب غير موجود. رقم مرجع الطلب: 0defbda9-cbee-4395-9e78-4e3bfa2e0da3".

المطلوب تقرير شامل، استراتيجي، فني، واحترافي باللغة العربية يتضمن:
1. الفحص الفوري للمشكلة الحالية وسبب ظهور كود UUID الخاص بكاشير واقتراح الحل الدقيق.
2. تدقيق شامل لكامل دورة حياة النظام: (إنشاء الطلب، بوابة كاشير، الـ Callback، الـ Webhook، صفحة النتيجة، تفعيل الاشتراك، الفواتير، التوكن، التجديد الشهري، وإلغاء التجديد).
3. تقييم وسكور بالأرقام (من 10 ومن 100) لكل محور من محاور النظام:
   - معمارية النظام ومصدر الحقيقة (Architecture & Single Source of Truth).
   - الأمان المالي ومكافحة التلاعب (Financial Security & Anti-Tampering).
   - تجربة المستخدم وتماسك الواجهة (UX & Client-Side Reliability).
   - إدارة الأدمن والعمليات التشغيلية (Admin & Business Operations).
4. جدول رصد وحصر شامل لجميع المشاكل ونقاط الضعف الحالية أو المحتملة، مع الحل الجذري لكل مشكلة وتوضيح سبب اختيار هذا الحل هندسياً.
5. خطة عمل نهائية محكمة لإنهاء أي خلل وجعل المنظومة جاهزة للإنتاج دون أي مفاجآت.`;

const userPrompt = `إليك التفاصيل الحية من قاعدة البيانات وسجلات الكود للتدقيق:

### 1. ما حدث في التجربة الحية الأخيرة للعميل:
- قام العميل بتسجيل الدخول والتوجه لصفحة الباقات واختار الباقة المميزة (1,000 ج.م).
- تم توجيهه لكاشير بنجاح، وظهر له في صفحة كاشير مبلغ 1,000 ج.م (نجح علاج مشكلة السعر).
- قام العميل بالدفع ببطاقته، وبعد إتمام الدفع أعادته كاشير إلى رابط النتيجة:
  \`/payment/result?paymentStatus=SUCCESS&merchantOrderId=ORD-15-1790098824-49f129&orderId=0defbda9-cbee-4395-9e78-4e3bfa2e0da3&kashierTxnId=...&signature=...\`
- في صفحة النتيجة \`PaymentResultPage.jsx\`، ظهرت للمستخدم رسالة خطأ:
  "لم تكتمل عملية الدفع - تعذر إتمام الدفع بالبطاقة - الطلب غير موجود. رقم مرجع الطلب: 0defbda9-cbee-4395-9e78-4e3bfa2e0da3".

### 2. فحص قاعدة البيانات للطلب الحقيقي:
\`\`\`sql
SELECT * FROM payment_orders WHERE id = 6;
-- public_id: ORD-15-1790098824-49f129
-- user_id: 15
-- plan: premium
-- amount: 1000.00
-- status: pending
-- kashier_order_id: NULL
-- kashier_transaction_id: NULL
-- created_at: 2026-09-22 20:40:24
\`\`\`

### 3. تحليل الكود الحالي المسبب للمشكلة:
في \`src/pages/PaymentResultPage.jsx\`:
\`\`\`javascript
const orderId =
    searchParams.get('order_id') ||
    searchParams.get('orderId') ||
    searchParams.get('merchantOrderId');
\`\`\`
- كاشير ترسل \`merchantOrderId\` يحمل معرف المنصة \`ORD-15-...\` وترسل \`orderId\` يحمل معرّف كاشير الداخلي (UUID: \`0defbda9-cbee-4395-9e78-4e3bfa2e0da3\`).
- بسبب أن الكود يبحث عن \`orderId\` قبل \`merchantOrderId\`، قام باقتناص كود كاشير الداخلي.
- ثم أرسله إلى \`/api/payment-status.php?order_id=0defbda9...\`.
- في \`payment-status.php\`:
\`\`\`php
SELECT po.* FROM payment_orders po WHERE po.public_id = :pid AND po.user_id = :uid
\`\`\`
- قاعدة البيانات تبحث عن \`ORD-15-...\`، بينما الاستعلام أرسل له كود كاشير، فأعادت \`order_not_found\`، وفشل تفعيل الاشتراك!

### 4. هيكل النظام والملفات الحالية للتدقيق:
1. **قاعدة البيانات:** الجداول (\`subscription_plans\`, \`subscriptions\`, \`payment_orders\`, \`invoices\`, \`payment_methods\`, \`payment_gateway_configs\`, \`users\`).
2. **إنشاء الطلب:** \`public/api/checkout.php\` (يسحب السعر من \`subscription_plans\`، يولد \`ORD-...\`، يبني رابط كاشير مع \`merchantRedirect\` و \`serverWebhook\`).
3. **مكتبة البوابة:** \`lib/kashier.php\` (\`verifyCallbackHash\`, \`verifyWebhookSignature\`, \`processPaymentSuccess\`, \`chargeCardToken\`).
4. **التحقق وتأكيد الدفع:** \`public/api/payment-status.php\` و \`public/api/webhooks/kashier.php\`.
5. **صفحة النتيجة:** \`src/pages/PaymentResultPage.jsx\`.
6. **إدارة الخطط للأدمن:** \`public/api/admin/plans.php\` و \`src/admin/pages/PlansSettingsPage.jsx\`.
7. **صفحة الباقات:** \`src/sections/Packages.jsx\` و \`public/api/plans.php\`.
8. **صفحة اشتراك المستخدم وإلغاء التجديد:** \`src/user/pages/MySubscriptionPage.jsx\` و \`public/api/user/subscription.php\`.
9. **التجديد الشهري الدوري:** \`scripts/cron-recurring-subscriptions.php\`.

المطلوب:
إصدار التقرير الشامل والمفصل مع السكور والتقييم، وحصر جميع المشكلات والثغرات المحتملة، وتقديم الحلول الهندسية الدقيقة مع شرح وتبرير سبب اختيار كل حل.`;

console.log(`⚡ [Sol] Running Comprehensive Systems Audit with ${modelToUse}...`);
const cfg = loadConfig({ model: modelToUse, effort: "medium" }, projectDir);

let report = "";
try {
  report = await callSignor([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], {
    enableTools: false,
    stream: false,
    kind: "audit",
    projectDir
  }, cfg);
} catch (err) {
  console.log(`\n⚠️ Model '${modelToUse}' returned: ${err.message}`);
  console.log(`⚡ Falling back to 'claude-opus-5' on Signor AI...`);
  modelToUse = "claude-opus-5";
  const cfgFallback = loadConfig({ model: modelToUse, effort: "medium" }, projectDir);
  report = await callSignor([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], {
    enableTools: false,
    stream: false,
    kind: "audit",
    projectDir
  }, cfgFallback);
}

const outputPath = path.join(projectDir, ".signor", "comprehensive_payment_audit_report.md");
fs.writeFileSync(outputPath, `# التقرير الشامل لتدقيق وتقييم منظومة الدفع والباقات — Signor (${modelToUse})\n\n- **التاريخ:** ${new Date().toLocaleString("ar-EG")}\n- **النموذج:** \`${modelToUse}\`\n- **مستوى الجهد:** \`medium\`\n\n---\n\n${report}\n`);
console.log("\n✅ Comprehensive Audit Report Saved to:", outputPath);
