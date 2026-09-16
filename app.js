(() => {
  const STORAGE_KEY = "stundenplan-data-v1";

  const DAYS = [
    "Montag",
    "Dienstag",
    "Mittwoch",
    "Donnerstag",
    "Freitag",
    "Samstag",
    "Sonntag",
  ];

  const INITIAL_ROW_COUNT = 10;

  /** @type {{ rowCount: number, times: string[], entries: Record<string, {title: string, description: string, link: string}> }} */
  let state = loadState();

  const headerRow = document.getElementById("headerRow");
  const planBody = document.getElementById("planBody");
  const addRowBtn = document.getElementById("addRowBtn");
  const resetBtn = document.getElementById("resetBtn");

  const modalOverlay = document.getElementById("modalOverlay");
  const modalTitleHeading = document.getElementById("modalTitleHeading");
  const fieldTitle = document.getElementById("fieldTitle");
  const fieldDescription = document.getElementById("fieldDescription");
  const fieldLink = document.getElementById("fieldLink");
  const saveEntryBtn = document.getElementById("saveEntryBtn");
  const deleteEntryBtn = document.getElementById("deleteEntryBtn");
  const cancelModalBtn = document.getElementById("cancelModalBtn");

  let activeCellKey = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          return {
            rowCount: parsed.rowCount || INITIAL_ROW_COUNT,
            times: Array.isArray(parsed.times) ? parsed.times : [],
            entries: parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {},
          };
        }
      }
    } catch (e) {
      console.warn("Konnte gespeicherten Stundenplan nicht laden:", e);
    }
    return { rowCount: INITIAL_ROW_COUNT, times: [], entries: {} };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Konnte Stundenplan nicht speichern:", e);
    }
  }

  function cellKey(row, day) {
    return `${row}_${day}`;
  }

  function renderHeader() {
    headerRow.querySelectorAll("th.day-col").forEach((el) => el.remove());
    DAYS.forEach((day) => {
      const th = document.createElement("th");
      th.className = "day-col";
      th.textContent = day;
      headerRow.appendChild(th);
    });
  }

  function renderBody() {
    planBody.innerHTML = "";
    for (let row = 0; row < state.rowCount; row++) {
      const tr = document.createElement("tr");

      const timeTd = document.createElement("td");
      timeTd.className = "time-cell";
      const timeInput = document.createElement("input");
      timeInput.type = "text";
      timeInput.className = "time-input";
      timeInput.placeholder = "z. B. 08:00–08:45";
      timeInput.value = state.times[row] || "";
      timeInput.addEventListener("input", () => {
        state.times[row] = timeInput.value;
        saveState();
      });
      timeTd.appendChild(timeInput);
      tr.appendChild(timeTd);

      DAYS.forEach((day) => {
        const td = document.createElement("td");
        td.className = "data-cell";
        const key = cellKey(row, day);
        td.dataset.key = key;
        renderCellContent(td, key);
        td.addEventListener("click", () => openModal(key));
        tr.appendChild(td);
      });

      planBody.appendChild(tr);
    }
  }

  function renderCellContent(td, key) {
    const entry = state.entries[key];
    td.innerHTML = "";
    if (entry && entry.title) {
      td.classList.add("filled");
      const title = document.createElement("p");
      title.className = "entry-title";
      title.textContent = entry.title;
      td.appendChild(title);

      if (entry.description) {
        const desc = document.createElement("p");
        desc.className = "entry-description";
        desc.textContent = entry.description;
        td.appendChild(desc);
      }

      if (entry.link) {
        const link = document.createElement("a");
        link.className = "entry-link";
        link.href = entry.link;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "🔗 Link";
        link.addEventListener("click", (e) => e.stopPropagation());
        td.appendChild(link);
      }
    } else {
      td.classList.remove("filled");
      const placeholder = document.createElement("span");
      placeholder.className = "cell-placeholder";
      placeholder.textContent = "+";
      td.appendChild(placeholder);
    }
  }

  function refreshCell(key) {
    const td = planBody.querySelector(`td[data-key="${CSS.escape(key)}"]`);
    if (td) renderCellContent(td, key);
  }

  function openModal(key) {
    activeCellKey = key;
    const entry = state.entries[key] || { title: "", description: "", link: "" };
    fieldTitle.value = entry.title || "";
    fieldDescription.value = entry.description || "";
    fieldLink.value = entry.link || "";
    deleteEntryBtn.style.display = state.entries[key] ? "inline-block" : "none";
    modalTitleHeading.textContent = state.entries[key] ? "Termin bearbeiten" : "Termin hinzufügen";
    modalOverlay.classList.remove("hidden");
    setTimeout(() => fieldTitle.focus(), 0);
  }

  function closeModal() {
    modalOverlay.classList.add("hidden");
    activeCellKey = null;
  }

  function saveEntry() {
    if (!activeCellKey) return;
    const title = fieldTitle.value.trim();
    const description = fieldDescription.value.trim();
    const link = fieldLink.value.trim();

    if (!title) {
      delete state.entries[activeCellKey];
    } else {
      state.entries[activeCellKey] = { title, description, link };
    }

    saveState();
    refreshCell(activeCellKey);
    closeModal();
  }

  function deleteEntry() {
    if (!activeCellKey) return;
    delete state.entries[activeCellKey];
    saveState();
    refreshCell(activeCellKey);
    closeModal();
  }

  function addRow() {
    state.rowCount += 1;
    saveState();
    renderBody();
  }

  function resetAll() {
    if (!confirm("Wirklich den gesamten Stundenplan zurücksetzen? Das kann nicht rückgängig gemacht werden.")) {
      return;
    }
    state = { rowCount: INITIAL_ROW_COUNT, times: [], entries: {} };
    saveState();
    renderBody();
  }

  addRowBtn.addEventListener("click", addRow);
  resetBtn.addEventListener("click", resetAll);
  saveEntryBtn.addEventListener("click", saveEntry);
  deleteEntryBtn.addEventListener("click", deleteEntry);
  cancelModalBtn.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalOverlay.classList.contains("hidden")) {
      closeModal();
    }
  });

  renderHeader();
  renderBody();
})();
