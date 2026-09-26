import { loadConfig } from "./lib/config.mjs";
import { callSignor } from "./lib/engine.mjs";
import fs from "node:fs";
import path from "node:path";

const projectDir = "c:/xampp/htdocs/dream-export";
let modelToUse = "gpt-6-astra";

const systemPrompt = `أنت Sol، المعماري البرمجي الرئيسي ومدقق أمان وموثوقية منصة Dream Export (Principal Software Architect & Lead Payment Auditor) عبر نموذج gpt-6-astra بمجهود متوسط (medium effort).
المطلوب منك فحص أزمة حرجة في واجهات وتدفقات خطط الاشتراكات:
العميل قام بتعديل سعر الباقة الأساسية من 500 ج.م إلى 20 ج.م لتجربة الدفع الحقيقي، ودفع 20 ج.م بالفعل واشترك بنجاح.
لكن عند دخوله على صفحة "باقاتي" (/dashboard/subscription):
- في كارت بيانات باقته الحالية أعلى الصفحة: يظهر "السعر الشهري: 20 ج.م".
- ولكن في الكروت السفلية لنفس الصفحة تحت عنوان "باقات الاشتراك الشهرية المتاحة": يظهر سعر الباقة الأساسية "500 ج.م / شهرياً"!
العميل يسأل: "ازاي الكلام في الصفحة الي دفعت بيها بسعر وهنا بسعر المفروض النظام يبقا موحد".

المطلوب:
1. تشخيص جذري دقيق ومفصل للمشكلة عبر معمارية المنظومة (Frontend vs Backend vs Database).
2. فحص كافة الأماكن الأخرى في الكود (مثل MyProductsPage, ContactPage, Packages) التي قد تحتوي على أسعار ثابتة (Hardcoded Strings) أو فجوات في التزامن.
3. وضع خطة علاجية جراحية محكمة (Architectural Fix Plan) لتوحيد المنظومة بالكامل على مصدر حقيقة واحد (Single Source of Truth - SSOT) عبر /api/plans.php بحيث أي تغيير في لوحة التحكم ينعكس فوراً وتلقائياً على كل شبر في الموقع دون استثناء.
4. إرشادات التحقق والتطبيق.`;

const userPrompt = `إليك تفاصيل المشكلة الدقيقة مع شفرة الكود الحالية في المنصة:

### 1. ما يراه العميل على الشاشة:
- أعلى الصفحة: "بيانات باقتك الحالية: الباقة الأساسية (Basic) - السعر الشهري: 20 ج.م".
- أسفل الصفحة: "باقات الاشتراك الشهرية المتاحة: الباقة الأساسية: 500 ج.م / شهرياً، الباقة المميزة: 1,000 ج.م / شهرياً".

### 2. الكود الحالي لصفحة باقاتي (src/user/pages/MySubscriptionPage.jsx):
الكروت السفلية مكتوبة كنص ثابت بدون أي جلب من الـ API:
- الباقة الأساسية: معروضة برقم ثابت 500 في السطر 221.
- الباقة المميزة: معروضة برقم ثابت 1,000 في السطر 270.
- روابط واتساب: تحتوي نصوصاً ثابتة 'الباقة الأساسية (500 ج.م)' و 'الباقة المميزة (1000 ج.م)'.
- غياب كامل لأي اتصال بـ /api/plans.php وغياب إمكانية الدفع المباشر عبر كاشير من داخل الصفحة.

### 3. الوضع في باقي المنظومة:
- جدول subscription_plans في قاعدة البيانات يحتوي السعر المحدث ديناميكياً: price = 20.00.
- نقطة النهاية العامة /api/plans.php تعيد السعر الفعلي 20 ج.م بشكل ديناميكي كامل.
- صفحة الباقات الرئيسية src/sections/Packages.jsx تجلب من /api/plans.php وتعرض 20 ج.م بالفعل.
- لكن src/user/pages/MySubscriptionPage.jsx لا تجلب من /api/plans.php إطلاقاً!
- صفحات أخرى مثل MyProductsPage.jsx و ContactPage.jsx بها نصوص وصفية ثابتة تحتوي على "500 ج.م".

قم بالتحليل والتدقيق المعماري الكامل بمودل gpt-6-astra مع مجهود متوسط، وضع خطة الإصلاح الشاملة.`;

let report = "";

try {
  console.log(`⚡ [Signor AI] Calling ${modelToUse} (effort: medium)...`);
  const cfg = loadConfig({ model: modelToUse, effort: "medium" }, projectDir);
  report = await callSignor([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], {
    enableTools: false,
    stream: true,
    kind: "audit",
    projectDir
  }, cfg);
} catch (err) {
  console.log(`\n⚠️ Model '${modelToUse}' returned: ${err.message}`);
  console.log(`⚡ Falling back to 'claude-opus-5' (effort: medium) on Signor AI...`);
  modelToUse = "claude-opus-5";
  const cfg = loadConfig({ model: modelToUse, effort: "medium" }, projectDir);
  report = await callSignor([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], {
    enableTools: false,
    stream: false,
    kind: "audit",
    projectDir
  }, cfg);
}

const outputPath = path.join(projectDir, ".signor", "astra6_price_inconsistency_audit.md");
if (!fs.existsSync(path.dirname(outputPath))) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
}
fs.writeFileSync(outputPath, `# تقرير تدقيق وخطة توحيد أسعار الباقات — Signor (${modelToUse})\n\n- **التاريخ:** ${new Date().toLocaleString("ar-EG")}\n- **النموذج:** \`${modelToUse}\`\n- **مستوى الجهد:** \`medium\`\n\n---\n\n${report}\n`);
console.log("\n✅ Audit & Fix Plan Saved to:", outputPath);
