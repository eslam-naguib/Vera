import { loadConfig } from "./lib/config.mjs";
import { callSignor } from "./lib/engine.mjs";
import fs from "node:fs";
import path from "node:path";

const projectDir = "c:/xampp/htdocs/dream-export";
let modelToUse = "gpt-6-astra";

const systemPrompt = `أنت Sol، المعماري البرمجي الرئيسي ومدقق أمان وموثوقية بوابات الدفع (Principal Payment Architect & Security Auditor) عبر نموذج gpt-6-astra مع مجهود متوسط (medium effort).
مهمتك فحص مشكلتين حرجتين واجهتا العميل أثناء تجربة الدفع الحي ببوابة Kashier على منصة Dream Export:
1. المشكلة الأولى: عند اختيار الباقة المميزة (1,000 ج.م) ظهر له في صفحة الدفع 500 ج.م فقط!
2. المشكلة الثانية: بعد إتمام الدفع بنجاح على بوابة كاشير وظهور رسالة النجاح، توجه العميل إلى صفحة "باقاتي" فظهر له "لا يوجد اشتراك نشط حالياً".

المطلوب:
1. تشخيص وتحليل جذري دقيق وشامل لأسباب المشكلتين على مستوى الكود وقاعدة البيانات والمعمارية.
2. فحص أي ثغرات أو مشاكل أخرى محتملة في مسار الدفع، والـ Callbacks، وتخزين الـ Token، والـ Webhook، وتحديثات الجلسة (Session/Auth State).
3. وضع خطة علاجية تفصيلية ومحكمة بالخطوات الجراحية الدقيقة (Step-by-step Implementation Plan) لضمان عدم تكرار أي خطأ مطلقاً وجعل النظام جاهزاً للبرودكشن بأعلى معايير الدقة والأمان.
4. إرشادات التحقق والتجربة على البيئة المحلية والبرودكشن.`;

const userPrompt = `إليك تفاصيل ما حدث بالضبط مع العميل والبيانات الحية من قاعدة البيانات والكود:

### 1. ما اختبره العميل وواجهه:
- قام بتسجيل حساب جديد (eslam2300@gmail.com).
- توجه لصفحة الباقات (/packages) واختار "الباقة المميزة" وسعرها 1,000 ج.م.
- عند تحويله إلى صفحة كاشير Hosted Checkout، وجد المبلغ المطلوب 500 ج.م فقط وليس 1,000 ج.م!
- أكمل عملية الدفع وخصم 500 ج.م، ثم أعادته البوابة إلى الموقع وظهرت رسالة "تم الدفع وتفعيل الباقة بنجاح".
- توجه بعد ذلك إلى صفحة اشتراكي (/my-subscription أو /dashboard/subscription) فوجد "لا يوجد اشتراك نشط حالياً" وكأن الدفع لم يحدث!

### 2. نتائج الفحص الأولي في قاعدة البيانات (MySQL Database Inspection):
\`\`\`sql
SELECT * FROM payment_orders WHERE user_id = 15;
-- النتيجة:
-- id: 2, plan: 'basic', amount: 500.00, status: 'pending', paid_at: NULL
-- الطلب لا يزال في حالة 'pending' ولم يتحول إطلاقاً إلى 'success'!

SELECT * FROM subscriptions WHERE user_id = 15;
-- النتيجة: فارغ تماماً (0 rows) !

SELECT * FROM payment_methods WHERE user_id = 15;
-- النتيجة: فارغ تماماً (0 rows) !

SELECT * FROM invoices WHERE user_id = 15;
-- النتيجة: فارغ تماماً (0 rows) !
\`\`\`

### 3. الكود الحالي المتعلق بالمشكلة الأولى (مبلغ 500 بدلاً من 1000):
في \`src/sections/Packages.jsx\`:
\`\`\`javascript
const handleSubscribe = async (planId) => {
    // ...
    const res = await fetch('/api/checkout.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId }), // <--- يرسل المفتاح باسم plan_id !
    });
};
\`
بينما في \`public/api/checkout.php\`:
\`\`\`php
$input = json_decode((string)file_get_contents('php://input'), true) ?? [];
$plan = strtolower(trim((string)($input['plan'] ?? 'basic'))); // <--- يبحث عن 'plan' وليس 'plan_id'!
// النتيجة: $input['plan'] = null، فيعود افتراضياً إلى 'basic' وسعرها 500.00 ج.م دائماً!
\`\`\`

### 4. الكود الحالي المتعلق بالمشكلة الثانية (عدم تفعيل الاشتراك وبقاء الطلب pending):
عند عودة كاشير للمتصفح إلى \`/payment/result?paymentStatus=SUCCESS&order_id=...&signature=...\`:
تقوم صفحة \`PaymentResultPage.jsx\` باستدعاء \`/api/payment-status.php\`.
في \`public/api/payment-status.php\`:
\`\`\`php
$kashierStatus = strtoupper((string)($_GET['paymentStatus'] ?? ''));
$receivedHash = (string)($_GET['signature'] ?? $_GET['hash'] ?? '');

if ($order['status'] === 'pending' && in_array($kashierStatus, ['SUCCESS', 'CAPTURED'], true) && $receivedHash !== '') {
    $isValid = KashierGateway::verifyCallbackHash($cfg, $orderId, $amount, $currency, $receivedHash);
    if ($isValid) {
        KashierGateway::processPaymentSuccess($db, $orderId, ...);
    }
}
\`
وفي \`lib/kashier.php\`:
\`\`\`php
public static function verifyCallbackHash(array $config, string $orderId, float $amount, string $currency, string $receivedHash): bool
{
    $mid = trim((string)$config['merchant_id']);
    $apiKey = trim((string)$config['payment_api_key']);
    // كان يقارن مع generateOrderHash الخاص بإنشاء الطلب!
    $expected = self::generateOrderHash($mid, $orderId, $amount, $currency, $apiKey);
    return hash_equals($expected, $receivedHash);
}
\`
بينما وثائق كاشير الرسمية (hppCallback.php في Php-Checkout-Demo) تبين أن كاشير يرسل التوقيع محسوباً على كامل الـ Query String:
\`\`\`php
$queryString = "";
foreach ($_GET as $key => $value) { 
    if($key == "signature" || $key == "mode"){
        continue;
    }
    $queryString = $queryString."&".$key."=".$value;
}
$queryString = ltrim($queryString, $queryString[0]); 
$signature = hash_hmac('sha256', $queryString, $secret, false);
\`
بسبب هذا الاختلاف:
- \`verifyCallbackHash\` أعاد \`false\`.
- لم يتم استدعاء \`processPaymentSuccess\` أبداً.
- ظل الطلب في حالة \`pending\` في الداتابيز.
- الـ Webhook الخارجي لكاشير لم يصل لأن السيرفر يعمل على localhost (لا يوجد وصول خارجي بدون نفق).
- صفحة \`PaymentResultPage.jsx\` على الواجهة بعد 5 محاولات أظهرت "تم الدفع وتفعيل الباقة" بناءً على \`paymentStatus=SUCCESS\` الموجودة في الرابط (Benefit of doubt)، ولكن فعلياً الداتابيز لم تتغير! وعندما فتح العميل حسابه لم يجد اشتراكاً!

المطلوب منك كمدقق معماري بنموذج gpt-6-astra:
1. تشخيص تحليلي عميق للأزمتين.
2. كشف أي عيوب أو ثغرات أخرى في التدفق (مثل الـ URL parameters، دعم الـ Webhook على الإنتاج مع fallback آمن على localhost، قفل التعديل الذري، تحديث الـ React AuthContext، إلخ).
3. خطة عمل إصلاحية متكاملة وقاطعة كوداً ومعمارياً.`;

let report = "";

try {
  console.log(`⚡ [Sol] Running Deep Audit & Fix Plan with ${modelToUse}...`);
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

const outputPath = path.join(projectDir, ".signor", "astra6_payment_fix_plan.md");
fs.writeFileSync(outputPath, `# تقرير تدقيق وخطة إصلاح مشاكل الدفع — Signor (${modelToUse})\n\n- **التاريخ:** ${new Date().toLocaleString("ar-EG")}\n- **النموذج:** \`${modelToUse}\`\n- **مستوى الجهد:** \`medium\`\n\n---\n\n${report}\n`);
console.log("\n✅ Audit & Fix Plan Saved to:", outputPath);
