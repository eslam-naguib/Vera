import { loadConfig } from "./lib/config.mjs";
import { callSignor } from "./lib/engine.mjs";
import fs from "node:fs";
import path from "node:path";

const projectDir = "c:/xampp/htdocs/dream-export";
const config = loadConfig({ model: "gpt-6-astra", effort: "medium" }, projectDir);

const systemPrompt = `أنت Sol، المعماري البرمجي الرئيسي ومدقق النظم (Principal Software Architect & Lead Security Auditor) عبر نموذج gpt-6-astra.
مهمتك إعداد التقرير المعماري والتقني النهائي (Full-Spectrum Production Audit Report) الشامل والصارم لمشروع Dream Export.
يجب أن يكون التقرير احترافياً ومفصلاً باللغة العربية، موجهاً للمطورين وإدارة المشروع، ويحتوي على تقييمات دقيقة ونسب مئوية وتوصيات تشغيلية فورية.`;

const userPrompt = `تم إجراء فحص عميق وشامل لملفات مشروع منصة Dream Export (منصة تصدير للمنتجات المصرية B2B)، وإليك نتائج المسح الميداني للكود والبنية التحتية:

1. المعمارية العامة والتقنيات:
- الواجهة الأمامية: React 19, Tailwind CSS v4, Vite, Lucide Icons, Framer Motion.
- الواجهة الخلفية: PHP 8.2+ بنظام Modular Micro-APIs داخل public/api/.
- التخزين وقاعدة البيانات: MySQL 8 (InnoDB) عبر PDO Singleton مخصص، ونظام Storage محلي للأصول مع حظر التنفيذ عبر .htaccess.

2. نتائج فحص الأمان (Security & Hardening):
- حماية قواعد البيانات: 100% من الاستعلامات في الباك إند تستخدم PDO Prepared Statements مع معلمات ملزمة (Zero Raw SQL Injection).
- إدارة الجلسات: نظام جلسات آمن (HttpOnly, SameSite=Strict, Secure dynamically resolved, Strict Mode). عزل كامل لملفات الجلسة dream_admin_session و dream_user_session.
- الحماية من هجمات القوة الغاشمة: Rate Limiting مخصص في auth.php و admin-auth.php يعتمد على SHA-256 IP Hashing ونوافذ زمنية (900s).
- رفع الوسائط: hero-settings و products تفحص امتدادات ونوع MIME للصور والفيديوهات (mp4, webp, jpeg, png) وتستخدم مسارات تخزين معزولة.
- حماية مجلد التخزين: ملف storage/.htaccess يفرض (Require all denied / Deny from all) لمنع أي استدعاء مباشر لملفات PHP داخل التخزين.
- الأسرار والتهيئة: حماية ملفات database.config.php و mail.config.php و admin-auth.config.php في .gitignore، واستبعادها من حزم dist.
- الثغرات المكتشفة: وجود ملف debug-db.php التجريبي الذي يجب حذفه فوراً من الإنتاج لأنه يعرض أسماء الجداول وإحصائيات الاتصال.

3. نتائج فحص الأداء والتحجيم (Performance & Scalability):
- البناء والتجميع: حزم Vite مجمعة مع تحسين الـ Chunks و Lazy loading لمسارات لوحة التحكم وصفحات المستخدمين.
- مرونة الاتصال: إضافة 3 محاولات تلقائية (Retry Logic) للاتصال بقاعدة البيانات عند الضغط اللحظي للاتصالات في الاستضافة المشتركة.
- معالجة الصور: توليد نسخ مصغرة (Thumbnails) وكاش للمشاركة الاجتماعية، مع ترويسات Cache-Control لمنع استنزاف الخادم.
- الفهارس: فهارس على الحقول الحيوية (user_id, category_id, status, email) في schema.sql.

4. نتائج فحص المنطق التجاري ونزاهة البيانات (Business Logic & Integrity):
- الاشتراكات: التحقق من تاريخ الانتهاء (end_date)، وحساب الأيام المتبقية وحالة الفعالية بدقة عبر DateTimeImmutable.
- عزل بيانات المستخدمين: فحص صارم لـ user_id في استعلامات التعديل والحذف بحيث لا يستطيع أي عميل رؤية أو تعديل منتجات عميل آخر.
- الصلاحيات: فصل تام بين لوحة تحكم الإدارة admin/ ولوحة تحكم العميل user/.

5. جودة الكود ونمط المعمارية (Code Quality & Maintainability):
- معالجة الأخطاء: موجه bootstrap.php موحد و Exception Handler عام يضمن إعادة استجابات JSON صحيحة حتى في أقصى حالات الانهيار.
- الواجهة: بنية Components نقية، خلو كامل من dangerouslySetInnerHTML أو innerHTML مع نصوص المستخدمين لمنع XSS.

المطلوب منك كمدقق معماري بنموذج gpt-6-astra:
إصدار التقرير النهائي الشامل متضمناً:
1. الملخص التنفيذي والقرار النهائي لجاهزية الإنتاج (Production Readiness Verdict).
2. تقييم مفصل لكل محور من المحاور الخمسة (الأمان، الأداء، المنطق ونزاهة البيانات، جودة الكود، البنية التحتية) بدرجة من 10.
3. تفصيل نقاط القوة الهندسية (Strengths).
4. تفصيل الملاحظات والتنبيهات المكتشفة (Findings & Action Items) مرتبة حسب الخطورة (حرجة / متوسطة / منخفضة).
5. خطة العمل المباشرة (Immediate Action Checklist) قبل الإطلاق الرسمي.
6. التقييم الإجمالي النهائي للمشروع من 10.`;

console.log("⚡ [Sol / Astra 6] Generating Final Comprehensive Audit Report...");
const report = await callSignor([
  { role: "system", content: systemPrompt },
  { role: "user", content: userPrompt }
], {
  enableTools: false,
  stream: true,
  kind: "audit",
  projectDir
}, config);

const outputPath = path.join(projectDir, ".signor", "signor_audit.md");
fs.writeFileSync(outputPath, `# تقرير التدقيق المعماري والتقني الشامل — Signor (Astra 6)\n\n- **التاريخ:** ${new Date().toLocaleString("ar-EG")}\n- **النموذج:** \`gpt-6-astra\`\n- **مستوى الجهد:** \`medium\`\n\n---\n\n${report}\n`);
console.log("\n✅ Audit Report Saved to:", outputPath);
