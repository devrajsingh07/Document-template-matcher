const categorySelect = document.querySelector("#category");
const matchForm = document.querySelector("#matchForm");
const templateForm = document.querySelector("#templateForm");
const detected = document.querySelector("#detected");
const message = document.querySelector("#message");
const templateResults = document.querySelector("#templateResults");
const allTemplates = document.querySelector("#allTemplates");
const templateCount = document.querySelector("#templateCount");

loadPageData();

matchForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(matchForm);
  detected.textContent = "Checking document...";
  message.textContent = "Matching against saved template categories.";
  templateResults.innerHTML = "";

  try {
    const response = await fetch("/api/match", {
      method: "POST",
      body: formData
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not match document.");
    }

    detected.textContent = `${result.detectedCategoryLabel} (${result.confidence}% confidence)`;
    message.textContent = result.message;
    renderTemplates(templateResults, result.matchedTemplates, true);
  } catch (error) {
    detected.textContent = "Could not check document";
    message.textContent = error.message;
  }
});

templateForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = Object.fromEntries(new FormData(templateForm).entries());

  try {
    const response = await fetch("/api/templates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not save template.");
    }

    templateForm.reset();
    await loadTemplates();
  } catch (error) {
    alert(error.message);
  }
});

async function loadPageData() {
  const categories = await fetchJson("/api/categories");
  categorySelect.innerHTML = categories
    .map((category) => `<option value="${category.value}">${category.label}</option>`)
    .join("");

  await loadTemplates();
}

async function loadTemplates() {
  const templates = await fetchJson("/api/templates");
  templateCount.textContent = templates.length;
  renderTemplates(allTemplates, templates, false);
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function renderTemplates(target, templates, showScore) {
  if (!templates.length) {
    target.innerHTML = '<p class="hint">No templates found.</p>';
    return;
  }

  target.innerHTML = templates
    .map((template) => {
      const score = showScore ? `<p class="score">${template.similarity}% keyword similarity</p>` : "";
      return `
        <article class="template-card">
          <span class="badge">${formatCategory(template.category)}</span>
          <h3>${escapeHtml(template.name)}</h3>
          <p>${escapeHtml(template.description || "Saved document template")}</p>
          <p>${escapeHtml(template.fileName || "template file")}</p>
          ${score}
        </article>
      `;
    })
    .join("");
}

function formatCategory(category) {
  return String(category)
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
