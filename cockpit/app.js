document.addEventListener("DOMContentLoaded", () => {
  const modelSelect = document.getElementById("modelSelect");
  const effortButtons = document.querySelectorAll(".effort-btn");
  const effortInput = document.getElementById("effortInput");
  const baseUrlInput = document.getElementById("baseUrlInput");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const configForm = document.getElementById("configForm");
  const saveStatus = document.getElementById("saveStatus");
  const radarList = document.getElementById("radarList");
  const btnScanAll = document.getElementById("btnScanAll");
  const btnQuickPing = document.getElementById("btnQuickPing");
  const consoleOutput = document.getElementById("consoleOutput");
  const btnClearLog = document.getElementById("btnClearLog");
  const projectPathDisplay = document.getElementById("projectPathDisplay");
  const btnPresetUrl = document.getElementById("btnPresetUrl");

  let currentConfig = {};
  let knownModels = [];

  function log(msg, type = "info") {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    const div = document.createElement("div");
    div.className = `log-entry ${type}`;
    div.textContent = `[${time}] ${msg}`;
    consoleOutput.appendChild(div);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

  btnClearLog.addEventListener("click", () => {
    consoleOutput.textContent = "";
  });

  btnPresetUrl.addEventListener("click", () => {
    baseUrlInput.value = "https://api.code.signor.ai/v1";
    log("Reset base URL input to standard production endpoint: https://api.code.signor.ai/v1", "info");
  });

  // 1. Load Config
  async function loadConfig() {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      currentConfig = data.config || {};
      projectPathDisplay.textContent = `Path: ${data.projectDir || ""}`;

      // Populate form
      if (currentConfig.model) {
        modelSelect.value = currentConfig.model;
      }
      if (currentConfig.effort) {
        setEffortUI(currentConfig.effort);
      }
      if (currentConfig.base_url) {
        baseUrlInput.value = currentConfig.base_url;
      }
      if (currentConfig.api_key_masked) {
        apiKeyInput.placeholder = currentConfig.api_key_masked;
      }

      log(`Loaded active configuration (Model: ${currentConfig.model}, Effort: ${currentConfig.effort})`, "info");
      renderRadar();
    } catch (err) {
      log(`Failed to load config: ${err.message}`, "error");
    }
  }

  // 2. Effort UI
  function setEffortUI(effort) {
    effortInput.value = effort;
    effortButtons.forEach(btn => {
      if (btn.dataset.effort === effort) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  effortButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      setEffortUI(btn.dataset.effort);
    });
  });

  // 3. Save Config
  configForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    saveStatus.textContent = "جاري الحفظ...";
    saveStatus.style.color = "#94a3b8";

    const targetScope = document.querySelector('input[name="targetScope"]:checked')?.value || "local";
    const payload = {
      model: modelSelect.value,
      effort: effortInput.value,
      base_url: baseUrlInput.value.trim(),
      api_key: apiKeyInput.value.trim() || undefined,
      targetScope,
    };

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        currentConfig = data.config;
        saveStatus.textContent = "✓ تم الحفظ والتفعيل بنجاح!";
        saveStatus.style.color = "#34d399";
        log(`Configuration updated: ${payload.model} [${payload.effort}] saved to ${targetScope} scope.`, "success");
        renderRadar();
      } else {
        saveStatus.textContent = `خطأ: ${data.error}`;
        saveStatus.style.color = "#f43f5e";
        log(`Save failed: ${data.error}`, "error");
      }
    } catch (err) {
      saveStatus.textContent = "فشل الاتصال بالخادم";
      saveStatus.style.color = "#f43f5e";
      log(`Save error: ${err.message}`, "error");
    }

    setTimeout(() => {
      saveStatus.textContent = "";
    }, 4000);
  });

  const hiddenCountBadge = document.getElementById("hiddenCountBadge");
  const btnToggleHidden = document.getElementById("btnToggleHidden");
  const btnResetModels = document.getElementById("btnResetModels");

  let allModels = [];
  let visibleModels = [];
  let showHiddenMode = false;
  let cachedHealth = {};

  // 4. Load Models & Radar
  async function loadModels() {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      visibleModels = data.models || [];
      allModels = data.allModels || visibleModels;
      if (hiddenCountBadge) {
        hiddenCountBadge.textContent = data.hiddenCount || 0;
      }
      populateModelDropdown(visibleModels);
      renderRadar(cachedHealth);
    } catch (err) {
      log(`Failed to fetch model registry: ${err.message}`, "error");
    }
  }

  function populateModelDropdown(models) {
    const selectedVal = modelSelect.value || currentConfig.model || "gpt-5.6-sol";
    modelSelect.replaceChildren();
    
    // Group models by tier/provider
    const groups = {};
    models.forEach(m => {
      const gName = m.provider || "General";
      if (!groups[gName]) groups[gName] = [];
      groups[gName].push(m);
    });

    for (const [groupName, groupList] of Object.entries(groups)) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = groupName;
      groupList.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = `${m.name || m.id} — ${m.description || m.tier}`;
        if (m.id === selectedVal) opt.selected = true;
        optgroup.appendChild(opt);
      });
      modelSelect.appendChild(optgroup);
    }
  }

  function renderRadar(healthMap = {}) {
    cachedHealth = { ...cachedHealth, ...healthMap };
    const listToRender = showHiddenMode ? allModels : visibleModels;
    radarList.replaceChildren();
    if (!listToRender.length) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "radar-skeleton";
      emptyDiv.textContent = 'لا توجد نماذج ظاهرة حالياً. يمكنك النقر على "استرجاع الكل" أعلاه.';
      radarList.appendChild(emptyDiv);
      return;
    }

    listToRender.forEach(m => {
      const isActive = m.id === currentConfig.model;
      const isHidden = m.hidden;
      const health = cachedHealth[m.id] || { status: "unknown", latencyMs: null };

      const row = document.createElement("div");
      row.className = `model-row ${isActive ? "is-active" : ""} ${isHidden ? "is-hidden-item" : ""}`;
      if (isHidden) {
        row.style.opacity = "0.6";
        row.style.borderStyle = "dashed";
      }

      let chipClass = "unknown";
      let chipText = "غير مفحوص";
      if (health.status === "live") {
        chipClass = "live";
        chipText = `● ${health.latencyMs}ms (متاح)`;
      } else if (health.status === "slow") {
        chipClass = "slow";
        chipText = `● ${health.latencyMs}ms (نشط)`;
      } else if (health.status === "unavailable_upstream") {
        chipClass = "down";
        chipText = "○ غير مفعل بالمزود (503)";
      } else if (health.status === "unauthorized") {
        chipClass = "down";
        chipText = "✕ 401 مفتاح غير صالح";
      } else if (health.status === "timeout") {
        chipClass = "down";
        chipText = "⏳ تجاوز المهلة";
      } else if (health.status === "down") {
        chipClass = "down";
        chipText = "✕ غير متاح";
      }

      // Safe DOM Construction (Zero innerHTML, Zero XSS)
      const modelInfo = document.createElement("div");
      modelInfo.className = "model-info";

      const nameLine = document.createElement("div");
      nameLine.className = "model-name-line";

      const idBadge = document.createElement("span");
      idBadge.className = "model-id-badge";
      idBadge.textContent = m.id;
      nameLine.appendChild(idBadge);

      const tierChip = document.createElement("span");
      tierChip.className = "model-tier-chip";
      tierChip.textContent = m.tier || "standard";
      nameLine.appendChild(tierChip);

      if (isActive) {
        const activeChip = document.createElement("span");
        activeChip.className = "model-tier-chip";
        activeChip.style.cssText = "background:#06b6d4;color:#000;font-weight:700";
        activeChip.textContent = "ACTIVE";
        nameLine.appendChild(activeChip);
      }

      if (isHidden) {
        const hiddenChip = document.createElement("span");
        hiddenChip.className = "model-tier-chip";
        hiddenChip.style.cssText = "background:#f43f5e;color:#fff;";
        hiddenChip.textContent = "مستبعد";
        nameLine.appendChild(hiddenChip);
      }

      const providerSpan = document.createElement("span");
      providerSpan.className = "model-provider";
      providerSpan.textContent = `${m.provider || "Signor"} — ${m.description || ""}`;

      modelInfo.appendChild(nameLine);
      modelInfo.appendChild(providerSpan);

      const statusBox = document.createElement("div");
      statusBox.className = "model-status-box";

      const latChip = document.createElement("div");
      latChip.className = `latency-chip ${chipClass}`;
      latChip.textContent = chipText;
      statusBox.appendChild(latChip);

      const btnCheck = document.createElement("button");
      btnCheck.className = "btn btn-sm btn-ghost btn-check-single";
      btnCheck.title = "فحص هذا النموذج";
      btnCheck.textContent = "⚡";
      btnCheck.addEventListener("click", async (e) => {
        e.stopPropagation();
        await checkSingleModel(m.id);
      });
      statusBox.appendChild(btnCheck);

      if (isHidden) {
        const btnUnhide = document.createElement("button");
        btnUnhide.className = "btn btn-sm btn-secondary btn-unhide-single";
        btnUnhide.title = "استرجاع هذا النموذج للقائمة";
        btnUnhide.textContent = "↺ تفعيل";
        btnUnhide.addEventListener("click", async (e) => {
          e.stopPropagation();
          const targetScope = document.querySelector('input[name="targetScope"]:checked')?.value || "local";
          const res = await fetch("/api/models/unhide", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modelId: m.id, targetScope }),
          });
          if (res.ok) {
            log(`تم استرجاع وتفعيل النموذج '${m.id}' في قائمتك.`, "success");
            await loadModels();
          }
        });
        statusBox.appendChild(btnUnhide);
      } else {
        const btnHide = document.createElement("button");
        btnHide.className = "btn btn-sm btn-ghost btn-hide-single";
        btnHide.title = "إخفاء/حذف هذا النموذج من القائمة";
        btnHide.style.color = "#f43f5e";
        btnHide.textContent = "🗑️";
        btnHide.addEventListener("click", async (e) => {
          e.stopPropagation();
          const targetScope = document.querySelector('input[name="targetScope"]:checked')?.value || "local";
          const res = await fetch("/api/models/hide", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modelId: m.id, targetScope }),
          });
          if (res.ok) {
            log(`تم إخفاء النموذج '${m.id}' من قائمتك.`, "info");
            await loadModels();
          }
        });
        statusBox.appendChild(btnHide);
      }

      row.appendChild(modelInfo);
      row.appendChild(statusBox);

      row.addEventListener("click", () => {
        if (!m.hidden) {
          modelSelect.value = m.id;
          log(`Selected model: ${m.id}. Click Save to apply.`, "info");
        }
      });

      radarList.appendChild(row);
    });
  }

  // Toggle Hidden Mode
  if (btnToggleHidden) {
    btnToggleHidden.addEventListener("click", () => {
      showHiddenMode = !showHiddenMode;
      btnToggleHidden.classList.toggle("active", showHiddenMode);
      btnToggleHidden.style.background = showHiddenMode ? "#3b82f6" : "#1e293b";
      btnToggleHidden.style.color = showHiddenMode ? "#fff" : "#cbd5e1";
      log(showHiddenMode ? "عرض جميع النماذج بما فيها المستبعدة." : "عرض النماذج المفعلة فقط.", "info");
      renderRadar();
    });
  }

  // Reset All Models
  if (btnResetModels) {
    btnResetModels.addEventListener("click", async () => {
      const targetScope = document.querySelector('input[name="targetScope"]:checked')?.value || "local";
      await fetch("/api/models/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetScope }),
      });
      log("تم استرجاع جميع النماذج الـ 19 للظهور في اللوحة.", "success");
      await loadModels();
    });
  }

  async function checkSingleModel(modelId) {
    log(`Checking health of model '${modelId}'...`, "info");
    try {
      const res = await fetch("/api/models/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelId }),
      });
      const data = await res.json();
      const r = data.result;
      if (r) {
        log(`Model ${r.model}: Status=${r.status.toUpperCase()} Latency=${r.latencyMs}ms ${r.error ? '(' + r.error + ')' : ''}`, r.status === "live" ? "success" : "warning");
        const map = {};
        map[r.model] = r;
        renderRadar(map);
      }
    } catch (err) {
      log(`Check error on ${modelId}: ${err.message}`, "error");
    }
  }

  // 5. Scan All Models
  btnScanAll.addEventListener("click", async () => {
    btnScanAll.disabled = true;
    btnScanAll.textContent = "جاري الفحص...";
    log("Scanning all known models simultaneously...", "info");

    try {
      const res = await fetch("/api/models/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      const results = data.results || [];
      const map = {};
      results.forEach(r => map[r.model] = r);
      renderRadar(map);
      log(`Radar scan complete. ${results.filter(r => r.status === 'live').length}/${results.length} models verified LIVE.`, "success");
    } catch (err) {
      log(`Scan all failed: ${err.message}`, "error");
    } finally {
      btnScanAll.disabled = false;
      btnScanAll.textContent = "⚡ فحص جميع النماذج";
    }
  });

  // 6. Quick Ping
  btnQuickPing.addEventListener("click", async () => {
    btnQuickPing.disabled = true;
    log(`Sending test ping to active model (${currentConfig.model})...`, "info");
    try {
      const res = await fetch("/api/ping", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        log(`✓ Ping verified! (${data.latencyMs}ms) Response: "${data.reply}"`, "success");
      } else {
        log(`Ping failed: ${data.error}`, "error");
      }
    } catch (err) {
      log(`Ping error: ${err.message}`, "error");
    } finally {
      btnQuickPing.disabled = false;
    }
  });

  // Init
  async function init() {
    await loadConfig();
    await loadModels();
    if (currentConfig.model) {
      checkSingleModel(currentConfig.model);
    }
  }
  init();
});
