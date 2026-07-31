
(function () {
  const BASE = (window.__MIXINARY_BASE_PATH__ || "/project-management").replace(/\/$/, "");
  const APPS = [
    { id: "erp", label: "ERP", href: "/erp" },
    { id: "pm", label: "Project Management", href: BASE || "/project-management" },
    { id: "client-documents", label: "Client Documents", href: "/client-documents" },
    { id: "admin", label: "Administration", href: "/admin" },
  ];
  function mount() {
    if (document.getElementById("mixinary-app-selector")) return;
    const host = document.querySelector("header") || document.body;
    const wrap = document.createElement("div");
    wrap.id = "mixinary-app-selector";
    wrap.style.cssText = "position:fixed;top:10px;right:12px;z-index:9999;font:14px/1.2 ui-sans-serif,system-ui,sans-serif";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Apps";
    const menu = document.createElement("div");
    menu.hidden = true;
    menu.style.cssText = "position:absolute;right:0;top:110%;background:#fff;border:1px solid #ccc;min-width:12rem;padding:0.35rem";
    for (const app of APPS) {
      const a = document.createElement("a");
      a.href = app.href;
      a.textContent = app.label;
      a.style.cssText = "display:block;padding:0.4rem 0.6rem;color:#111;text-decoration:none";
      menu.appendChild(a);
    }
    btn.addEventListener("click", () => { menu.hidden = !menu.hidden; });
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    host.appendChild(wrap);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
