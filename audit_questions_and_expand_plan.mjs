import { loadConfig } from "./lib/config.mjs";
import { callSignor } from "./lib/engine.mjs";
import fs from "node:fs";
import path from "node:path";

const projectDir = "c:/xampp/htdocs/dream-export";
let modelToUse = "gpt-6-astra";

const systemPrompt = `أنت Sol، المعماري البرمجي الرئيسي وخبير أمان واشتراكات بوابات الدفع (Principal Payment Architect & Subscriptions Specialist) عبر نموذج gpt-6-astra بمجهود متوسط (medium effort).
المستخدم طرح سؤالين جوهريين قبل بدء تنفيذ خطة إصلاح الدفع في منصة Dream Export:
1. هل توجد إمكانية للتحكم في خطط الاشتراكات (إدارة الباقات والأسعار وحدود المنتجات)؟
2. هل يوجد زر لإلغاء الاشتراك للمستخدمين إذا رغبوا في إلغاء التجديد الشهري التلقائي؟

المطلوب منك:
1. الإجابة بدقة وتحليل عميق للوضع الحالي في المنصة لكلا السؤالين (ما هو موجود وما هو مفقود حالياً).
2. تصميم المعمارية الكاملة لإضافة ميزة "التحكم في خطط الاشتراكات" للأدمن (قاعدة بيانات + Backend API + لوحة التحكم Admin UI + انعكاسها على صفحة /packages والدفع checkout.php ديناميكياً).
3. تصميم المعمارية الكاملة لإضافة ميزة "إلغاء التجديد التلقائي للمستخدم" (User Subscription Cancellation / Pause Auto-Renew) وفق أفضل المعايير المالية والتجربة السلسة (Graceful Cancellation: إيقاف الخصم التلقائي مع استمرار صلاحية الأيام المتبقية حتى end_date دون قطع مفاجئ للخدمة).
4. دمج هاتين الميزتين ضمن خطة العمل الشاملة مع حل مشكلتي الدفع (سعر 500 بدلاً من 1000، وتفعيل الاشتراك بعد الدفع) في وثيقة تنفيذية موحدة ومحكمة وجاهزة للتطبيق الفوري.`;

const userPrompt = `إليك تفاصيل فحص الكود الحالي للمشروع بخصوص السؤالين:

### فحص السؤال الأول: التحكم في خطط الاشتراكات
- حالياً: لا يوجد جدول لخطط الاشتراكات في قاعدة البيانات. الجداول الموجودة هي (categories, invoices, password_resets, payment_gateway_configs, payment_methods, payment_orders, products, site_settings, subscriptions, users).
- الخطط ثابتة برمجياً (Hardcoded):
  1. \`src/sections/Packages.jsx\`: مصفوفة plans ثابتة فيها basic: 500 ج.م (3 منتجات)، و premium: 1,000 ج.م (10 منتجات).
  2. \`public/api/checkout.php\`: مصفوفة \$planPrices = ['basic' => 500.00, 'premium' => 1000.00].
  3. \`public/api/admin/subscriptions.php\`: السعر وحد المنتجات مثبت بشرط (\$plan === 'premium' ? 1000 : 500).
  4. شاشات الإدارة (\`SubscriptionsPage.jsx\` و \`UsersPage.jsx\`): خيارات basic و premium ثابتة في الـ Modals.
- العميل يحتاج: أن يتمكن الأدمن من لوحة التحكم من التحكم في الخطط والأسعار والمميزات بدلاً من التعديل في الكود.

### فحص السؤال الثاني: زر إلغاء الاشتراك للمستخدم
- حالياً: في صفحة المستخدم (\`src/user/pages/MySubscriptionPage.jsx\`) يظهر كارت الاشتراك وتاريخ الانتهاء وشارة "تجديد شهري تلقائي"، لكن لا يوجد أي زر أو مسار يتيح للمستخدم إيقاف التجديد التلقائي أو إلغاء الاشتراك بنفسه.
- في الـ Backend: لا يوجد مسار للمستخدم العادي لإلغاء الاشتراك (المسار الوحيد للإلغاء موجود للأدمن في \`admin/subscriptions.php\`).
- منطق التجديد التلقائي: ملف \`scripts/cron-recurring-subscriptions.php\` يعتمد على حقل \`auto_renew = 1\` في جدول \`subscriptions\`. إذا ظل 1، سيقوم السيرفر بمحاولة خصم الاشتراك تلقائياً كل شهر عبر بطاقة العميل المسجلة.
- المطلوب: توفير زر "إلغاء التجديد التلقائي" مع نافذة تأكيد احترافية توضح أن اشتراكه سيظل فعالاً حتى نهاية الشهر المدفوع ولن يتم خصم أي مبالغ جديدة، مع معالجة آمنة في الـ Backend وتحديث الواجهة فوراً.

قم بتقديم الإجابة الكاملة والتصميم المعماري وخطة التنفيذ التفصيلية ليتم اعتمادها.`;

console.log(`⚡ [Sol] Running Plan Expansion Analysis with ${modelToUse}...`);
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

const outputPath = path.join(projectDir, ".signor", "plans_and_cancellation_report.md");
fs.writeFileSync(outputPath, `# تقرير وإجابة استفسارات خطط الاشتراكات وإلغاء التجديد — Signor (${modelToUse})\n\n- **التاريخ:** ${new Date().toLocaleString("ar-EG")}\n- **النموذج:** \`${modelToUse}\`\n- **مستوى الجهد:** \`medium\`\n\n---\n\n${report}\n`);
console.log("\n✅ Plans & Cancellation Report Saved to:", outputPath);
