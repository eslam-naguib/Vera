import { loadConfig } from "./lib/config.mjs";
import { callSignor } from "./lib/engine.mjs";
import fs from "node:fs";
import path from "node:path";

const projectDir = "c:/xampp/htdocs/dream-export";
const config = loadConfig({ model: "gpt-6-astra", effort: "medium" }, projectDir);

const systemPrompt = `You are Sol (powered by gpt-6-astra), Principal Payment Architect & Security Lead.
Develop a rigorous, production-grade architectural and implementation plan in Arabic for integrating Kashier Payment Gateway (https://developers.kashier.io/docs) into the Dream Export platform (React 19 + PHP 8.2 + MySQL).
The plan must replace the current manual subscription process with a fully automated, recurring monthly billing system, configurable entirely by the Admin from the dashboard, with zero tolerance for payment tampering or race conditions.`;

const userPrompt = `المطلوب: إعداد خطة معمارية وتنفيذية شاملة وجاهزة للإنتاج لدمج بوابة الدفع Kashier في منصة Dream Export.

تفاصيل المتطلبات الحالية:
1. تجربة المستخدم والتدفق (User Flow):
   - العميل يسجل حسابه في المنصة (أو يسجل دخوله).
   - يختار باقة الاشتراك المناسبة (من صفحة PackagesPage أو من لوحة تحكمه).
   - يتم توجيهه لدفع قيمة الباقة فوراً عبر Kashier Checkout بطريقة آمنة (بطاقات بنكية، ميزة، محافظ).
   - يتم تفعيل خيار الحفظ والخصم الدوري (Save Card & Recurring Tokenization).
   - عند نجاح الدفع الأول: يتم تفعيل حسابه واشتراكه فوراً في قاعدة البيانات لمدة شهر.
   - شهرياً: يتم خصم قيمة تجديد الباقة تلقائياً من البطاقة المحفوظة (Token Charge) عبر Cron Job خلفي، وتمديد الاشتراك لشهر جديد، مع إرسال إشعار وتقرير بالفاتورة.

2. إعدادات لوحة التحكم (Admin Panel Integration):
   - لوحة تحكم الأدمن تتيح للمسؤول إدخال وتعديل بيانات بوابة كاشير بسهولة دون تعديل كود:
     * تفعيل / تعطيل بوابة الدفع (Toggle Active / Inactive)
     * بيئة التشغيل (Sandbox Test vs Production Live)
     * المعرف التجاري (Merchant ID)
     * مفتاح الدفع العام (Payment API Key)
     * المفتاح السري (Secret Key)
     * العملة الافتراضية (EGP / USD)
   - تخزين آمن ومحمي في قاعدة البيانات.

3. الأمان الصارم وتفادي الأخطاء (Zero Margin for Error):
   - التحقق من الـ Hash (HMAC-SHA256) الصادر والوارد عبر Payment API Key.
   - التحقق من توقيع Webhooks بالسيرفر (Raw Payload Verification).
   - منع هجمات التلاعب بالمبالغ أو العملات (Amount Tampering) بربط العملية ببيانات الباقة من قاعدة البيانات حصراً.
   - منع السحب المزدوج (Idempotency Keys & Unique Order IDs).
   - حماية من ثغرات السباق (Race Conditions) عبر معاملة ACID Transaction مقفلة عند ترقية الاشتراك.
   - الامتثال لـ PCI-DSS (عدم تخزين أرقام البطاقات إطلاقاً واستخدام Card Tokens مشفرة ومحمية).
   - معالجة حالات الفشل (فشل الخصم الدوري، انتهاء صلاحية البطاقة، إعطاء مهلة Grace Period، تجميد أو تعديل الحساب، وإرسال تنبيه عبر تليجرام/البريد).

قم ببناء الخطة بصيغة تقرير معماري منظم جداً يشمل:
1. المعمارية الهندسية ومخطط تدفق البيانات (Architecture & Sequence Flow).
2. تعديلات قاعدة البيانات (Schema Changes & New Tables).
3. ملفات الـ Backend والـ APIs الجديدة والمعدلة (PHP Endpoints & Services).
4. ملفات الـ Frontend والواجهات الجديدة والمعدلة (React Components & Admin Settings).
5. آلية الخصم التلقائي الشهري والـ Webhooks والـ Cron Job.
6. مصفوفة الأمان والتحصين الشامل (Security & Threat Mitigation Matrix).
7. خطة الاختبار والتحقق قبل الإطلاق (Verification & Staging Test Plan).`;

console.log("⚡ [Sol / Astra 6] Generating Master Kashier Payment Architecture Plan...");
const planContent = await callSignor([
  { role: "system", content: systemPrompt },
  { role: "user", content: userPrompt }
], {
  enableTools: false,
  stream: true,
  kind: "plan",
  projectDir
}, config);

const planDir = path.join(projectDir, ".signor", "plans");
if (!fs.existsSync(planDir)) fs.mkdirSync(planDir, { recursive: true });
const filePath = path.join(planDir, "kashier_subscription_plan.md");
fs.writeFileSync(filePath, planContent);

console.log("\n✅ Master Plan Saved to:", filePath);
