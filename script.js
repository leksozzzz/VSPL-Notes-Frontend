const API_URL = "http://127.0.0.1:8000";
const TOKEN_KEY = "vspl-token";
const PROFILE_KEY = "vspl-profile";
const NOTE_META_KEY = "vspl-note-meta";

if (localStorage.getItem("vspl-theme") === "light") {
    document.body.classList.add("light-theme");
}

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function getProfile() {
    try {
        return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
    } catch (error) {
        return {};
    }
}

async function apiRequest(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };

    if (getToken()) {
        headers.Authorization = "Bearer " + getToken();
    }

    const response = await fetch(API_URL + path, {
        ...options,
        headers
    });

    let data = {};
    const text = await response.text();

    if (text) {
        try {
            data = JSON.parse(text);
        } catch (error) {
            data = { detail: text };
        }
    }

    if (!response.ok) {
        if (response.status === 401) {
            localStorage.removeItem(TOKEN_KEY);
        }

        let message = data.detail || "Не удалось выполнить запрос.";
        if (Array.isArray(message)) {
            message = message.map(item => item.msg).join(" ");
        }

        throw new Error(message);
    }

    return data;
}

function showMessage(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("error", isError);
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function getNoteMeta() {
    try {
        return JSON.parse(localStorage.getItem(NOTE_META_KEY) || "{}");
    } catch (error) {
        return {};
    }
}

function saveNoteMeta(meta) {
    localStorage.setItem(NOTE_META_KEY, JSON.stringify(meta));
}

function getNoteCategory(note) {
    return note.category || getNoteMeta()[note.id]?.category || "Личное";
}

function updateAccountLabels(profile = getProfile()) {
    const name = profile.username || profile.name || "Пользователь";
    document.querySelectorAll(".user-info strong").forEach(element => {
        element.textContent = name;
    });
    document.querySelectorAll(".user-avatar").forEach(element => {
        element.textContent = name.charAt(0).toUpperCase();
    });
}

// Регистрация
const registerForm = document.querySelector("#register-form");

if (registerForm) {
    registerForm.addEventListener("submit", async event => {
        event.preventDefault();

        const username = document.querySelector("#register-name").value.trim();
        const email = document.querySelector("#register-email").value.trim();
        const password = document.querySelector("#register-password").value;
        const confirmPassword = document.querySelector("#register-confirm").value;
        const message = document.querySelector("#register-message");
        const submitButton = registerForm.querySelector('button[type="submit"]');

        if (password !== confirmPassword) {
            showMessage(message, "Пароли не совпадают.", true);
            return;
        }

        if (password.length < 8) {
            showMessage(message, "Пароль должен содержать минимум 8 символов.", true);
            return;
        }

        submitButton.disabled = true;
        showMessage(message, "Создаём аккаунт...");

        try {
            const profile = await apiRequest("/auth/register", {
                method: "POST",
                body: JSON.stringify({ username, email, password })
            });

            saveProfile(profile);
            showMessage(message, "Аккаунт создан. Теперь войди в него.");

            setTimeout(() => {
                window.location.href = "login.html";
            }, 900);
        } catch (error) {
            showMessage(message, error.message, true);
        } finally {
            submitButton.disabled = false;
        }
    });
}

// Вход. Поле принимает email или имя пользователя.
const loginForm = document.querySelector("#login-form");

if (loginForm) {
    loginForm.addEventListener("submit", async event => {
        event.preventDefault();

        const username = document.querySelector("#login-email").value.trim();
        const password = document.querySelector("#login-password").value;
        const message = document.querySelector("#login-message");
        const submitButton = loginForm.querySelector('button[type="submit"]');

        submitButton.disabled = true;
        showMessage(message, "Выполняем вход...");

        try {
            const result = await apiRequest("/auth/login", {
                method: "POST",
                body: JSON.stringify({ username, password })
            });

            localStorage.setItem(TOKEN_KEY, result.access_token);

            const profile = await apiRequest("/auth/me");
            saveProfile(profile);

            window.location.href = "dashboard.html";
        } catch (error) {
            showMessage(message, error.message, true);
        } finally {
            submitButton.disabled = false;
        }
    });
}

// Кнопки и ссылки главной страницы
if (document.querySelector(".hero")) {
    const headerButtons = document.querySelectorAll(".header-buttons .btn");
    const heroButtons = document.querySelectorAll(".hero-buttons .btn");

    if (headerButtons[0]) {
        headerButtons[0].addEventListener("click", () => {
            window.location.href = getToken() ? "dashboard.html" : "login.html";
        });
    }

    if (headerButtons[1]) {
        headerButtons[1].addEventListener("click", () => {
            window.location.href = "register.html";
        });
    }

    if (heroButtons[0]) {
        heroButtons[0].addEventListener("click", () => {
            window.location.href = getToken() ? "dashboard.html" : "register.html";
        });
    }

    if (heroButtons[1]) {
        heroButtons[1].addEventListener("click", () => {
            document.querySelector(".features")?.scrollIntoView({ behavior: "smooth" });
        });
    }
}

// Выход из аккаунта
document.querySelectorAll(".logout-link, [data-logout]").forEach(link => {
    link.addEventListener("click", event => {
        event.preventDefault();
        localStorage.removeItem(TOKEN_KEY);
        window.location.href = "index.html";
    });
});

// Основная страница заметок
const notesGrid = document.querySelector("#notes-grid");

if (notesGrid) {
    const modal = document.querySelector("#note-modal");
    const noteForm = document.querySelector("#note-form");
    const searchInput = document.querySelector("#note-search");
    const categoryFilter = document.querySelector("#category-filter");
    const sortSelect = document.querySelector("#sort-notes");
    const noteTitle = document.querySelector("#note-title");
    const noteContent = document.querySelector("#note-content");
    const noteCategory = document.querySelector("#note-category");
    const modalTitle = document.querySelector("#modal-title");
    const emptyState = document.querySelector("#empty-state");
    const noteError = document.querySelector("#note-error");

    let notes = [];
    let currentView = "all";
    let editingId = null;
    let draggedId = null;
    let loading = false;

    if (!getToken()) {
        window.location.href = "login.html";
    }

    updateAccountLabels();

    async function loadNotes() {
        loading = true;
        notesGrid.innerHTML = '<p class="loading-message">Загружаем заметки...</p>';

        try {
            notes = await apiRequest("/notes/");
            notes = notes.map(note => {
                const meta = getNoteMeta()[note.id] || {};
                return {
                    ...note,
                    category: note.category || meta.category || "Личное",
                    favorite: Boolean(note.favorite ?? meta.favorite),
                    trashed: Boolean(note.trashed ?? meta.trashed),
                    position: note.position ?? meta.position ?? note.id
                };
            });
            renderNotes();
        } catch (error) {
            notesGrid.innerHTML = `<p class="form-error error">Не удалось загрузить заметки: ${escapeHTML(error.message)}</p>`;
            if (!getToken()) {
                window.location.href = "login.html";
            }
        } finally {
            loading = false;
        }
    }

    async function saveNoteMetaToServer(note) {
        const updated = await apiRequest("/notes/" + note.id, {
            method: "PUT",
            body: JSON.stringify({
                title: note.title,
                content: note.content || "",
                category: note.category || "Личное",
                favorite: Boolean(note.favorite),
                trashed: Boolean(note.trashed),
                position: Number(note.position ?? note.id)
            })
        });

        Object.assign(note, updated);
        const meta = getNoteMeta();
        delete meta[note.id];
        saveNoteMeta(meta);
        return updated;
    }

    function renderNotes() {
        const search = searchInput ? searchInput.value.toLowerCase().trim() : "";
        const selectedCategory = categoryFilter ? categoryFilter.value : "all";

        let visibleNotes = notes.filter(note => {
            if (currentView === "trash") return note.trashed;
            if (note.trashed) return false;
            if (currentView === "favorites" && !note.favorite) return false;
            if (selectedCategory !== "all" && getNoteCategory(note) !== selectedCategory) return false;

            const text = (note.title + " " + note.content).toLowerCase();
            return text.includes(search);
        });

        const sort = sortSelect ? sortSelect.value : "updated";

        if (sort === "created") {
            visibleNotes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } else if (sort === "title") {
            visibleNotes.sort((a, b) => a.title.localeCompare(b.title, "ru"));
        } else if (sort === "manual") {
            visibleNotes.sort((a, b) => Number(a.position ?? a.id) - Number(b.position ?? b.id));
        } else {
            visibleNotes.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        }

        notesGrid.innerHTML = visibleNotes.map(note => `
            <article class="note-card"
                draggable="${currentView !== "trash"}"
                data-note-id="${note.id}">
                <div class="note-card-top">
                    <span class="note-category">${escapeHTML(getNoteCategory(note))}</span>
                    <button type="button" class="note-action"
                        data-action="favorite" title="Избранное">
                        ${note.favorite ? "★" : "☆"}
                    </button>
                </div>
                <h3>${escapeHTML(note.title)}</h3>
                <p class="note-preview">${escapeHTML(note.content || "Нет текста")}</p>
                <div class="note-date">Создана: ${formatDate(note.created_at)}</div>
                <div class="note-date">Изменена: ${formatDate(note.updated_at)}</div>
                <div class="note-card-actions">
                    ${note.trashed ? `
                        <button type="button" data-action="restore">Восстановить</button>
                        <button type="button" data-action="delete">Удалить навсегда</button>
                    ` : `
                        <button type="button" data-action="edit">Открыть</button>
                        <button type="button" data-action="trash">В корзину</button>
                    `}
                </div>
            </article>
        `).join("");

        if (emptyState) {
            emptyState.hidden = visibleNotes.length > 0;
        }

        const activeNotes = notes.filter(note => !note.trashed);
        const total = document.querySelector("#stat-total");
        const favorites = document.querySelector("#stat-favorites");
        const categoriesCount = document.querySelector("#stat-categories");
        const count = document.querySelector("#notes-count");

        if (total) total.textContent = activeNotes.length;
        if (favorites) favorites.textContent = activeNotes.filter(note => note.favorite).length;
        if (categoriesCount) categoriesCount.textContent = 4;
        if (count) count.textContent = activeNotes.length;

        const titles = {
            all: ["Мои заметки", "Твои записи в одном месте"],
            favorites: ["Избранное", "Заметки, которые ты отметил как важные"],
            categories: ["Категории", "Выбери категорию, чтобы посмотреть заметки"],
            trash: ["Корзина", "Заметки, которые ты переместил в корзину"]
        };

        const [title, description] = titles[currentView] || titles.all;
        const pageTitle = document.querySelector("#page-title");
        const sectionTitle = document.querySelector("#section-title");
        const sectionDescription = document.querySelector("#section-description");

        if (pageTitle) pageTitle.textContent = title;
        if (sectionTitle) sectionTitle.textContent = currentView === "all" ? "Все заметки" : title;
        if (sectionDescription) sectionDescription.textContent = description;
    }

    function openModal(note = null) {
        editingId = note ? note.id : null;
        noteForm.reset();
        showMessage(noteError, "");

        if (note) {
            noteTitle.value = note.title;
            noteContent.value = note.content || "";
            noteCategory.value = getNoteCategory(note);
            modalTitle.textContent = "Редактировать заметку";
        } else {
            modalTitle.textContent = "Новая заметка";
            noteCategory.value = "Личное";
        }

        modal.hidden = false;
        noteTitle.focus();
    }

    function closeModal() {
        modal.hidden = true;
        editingId = null;
    }

    document.querySelectorAll("#add-note, #add-note-top, #empty-add").forEach(button => {
        button.addEventListener("click", () => openModal());
    });

    document.querySelectorAll("#close-modal, #cancel-modal").forEach(button => {
        button.addEventListener("click", closeModal);
    });

    if (modal) {
        modal.addEventListener("click", event => {
            if (event.target === modal) closeModal();
        });
    }

    noteForm.addEventListener("submit", async event => {
        event.preventDefault();

        const title = noteTitle.value.trim();
        const content = noteContent.value.trim();
        const category = noteCategory.value || "Личное";

        if (!title) {
            showMessage(noteError, "Введи название заметки.", true);
            noteTitle.focus();
            return;
        }

        const submitButton = noteForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;

        try {
            let savedNote;

            if (editingId !== null) {
                const oldNote = notes.find(note => String(note.id) === String(editingId));
                savedNote = await apiRequest("/notes/" + editingId, {
                    method: "PUT",
                    body: JSON.stringify({
                        title,
                        content,
                        category,
                        favorite: oldNote ? Boolean(oldNote.favorite) : false,
                        trashed: oldNote ? Boolean(oldNote.trashed) : false,
                        position: oldNote ? Number(oldNote.position ?? oldNote.id) : Number(editingId)
                    })
                });
                notes = notes.map(note => String(note.id) === String(editingId) ? savedNote : note);
            } else {
                savedNote = await apiRequest("/notes/", {
                    method: "POST",
                    body: JSON.stringify({
                        title,
                        content,
                        category,
                        favorite: false,
                        trashed: false,
                        position: notes.length
                    })
                });
                notes.unshift(savedNote);
            }

            await saveNoteMetaToServer(savedNote);
            closeModal();
            renderNotes();
        } catch (error) {
            showMessage(noteError, error.message, true);
        } finally {
            submitButton.disabled = false;
        }
    });

    notesGrid.addEventListener("click", async event => {
        const button = event.target.closest("[data-action]");
        const card = event.target.closest("[data-note-id]");
        if (!button || !card) return;

        const note = notes.find(item => String(item.id) === card.dataset.noteId);
        if (!note) return;

        const action = button.dataset.action;

        if (action === "edit") {
            openModal(note);
            return;
        }

        try {
            if (action === "favorite") {
                note.favorite = !note.favorite;
                await saveNoteMetaToServer(note);
            } else if (action === "trash") {
                note.trashed = true;
                await saveNoteMetaToServer(note);
            } else if (action === "restore") {
                note.trashed = false;
                await saveNoteMetaToServer(note);
            } else if (action === "delete") {
                if (!confirm("Удалить заметку навсегда? Это действие нельзя отменить.")) return;

                await apiRequest("/notes/" + note.id, { method: "DELETE" });
                notes = notes.filter(item => String(item.id) !== String(note.id));
                const meta = getNoteMeta();
                delete meta[note.id];
                saveNoteMeta(meta);
            }

            renderNotes();
        } catch (error) {
            alert("Не удалось выполнить действие: " + error.message);
            await loadNotes();
        }
    });

    if (searchInput) searchInput.addEventListener("input", renderNotes);
    if (categoryFilter) categoryFilter.addEventListener("change", renderNotes);
    if (sortSelect) sortSelect.addEventListener("change", renderNotes);

    document.querySelectorAll("[data-view]").forEach(button => {
        button.addEventListener("click", () => {
            currentView = button.dataset.view;

            if (currentView === "categories") {
                window.location.href = "categories.html";
                return;
            }

            document.querySelectorAll("[data-view]").forEach(item => {
                item.classList.toggle("active", item === button);
            });

            renderNotes();
        });
    });

    document.querySelectorAll(".category-chip").forEach(button => {
        button.addEventListener("click", () => {
            if (categoryFilter) categoryFilter.value = button.dataset.category || "all";
            document.querySelectorAll(".category-chip").forEach(item => {
                item.classList.toggle("selected", item === button);
            });
            renderNotes();
        });
    });

    notesGrid.addEventListener("dragstart", event => {
        const card = event.target.closest("[data-note-id]");
        if (!card || currentView === "trash") {
            event.preventDefault();
            return;
        }
        draggedId = card.dataset.noteId;
        card.classList.add("dragging");
        if (event.dataTransfer) {
            event.dataTransfer.setData("text/plain", draggedId);
            event.dataTransfer.effectAllowed = "move";
        }
    });

    notesGrid.addEventListener("dragover", event => {
        event.preventDefault();
        const card = event.target.closest("[data-note-id]");
        notesGrid.querySelectorAll(".drag-over").forEach(item => item.classList.remove("drag-over"));
        if (card && card.dataset.noteId !== draggedId) card.classList.add("drag-over");
    });

    notesGrid.addEventListener("drop", async event => {
        event.preventDefault();
        const card = event.target.closest("[data-note-id]");
        if (!draggedId || !card || draggedId === card.dataset.noteId) return;

        const draggedNote = notes.find(note => String(note.id) === draggedId);
        const targetNote = notes.find(note => String(note.id) === card.dataset.noteId);
        if (!draggedNote || !targetNote) return;

        const visible = Array.from(notesGrid.querySelectorAll("[data-note-id]"))
            .map(element => notes.find(note => String(note.id) === element.dataset.noteId))
            .filter(Boolean);
        const from = visible.indexOf(draggedNote);
        const to = visible.indexOf(targetNote);
        if (from < 0 || to < 0) return;

        visible.splice(from, 1);
        visible.splice(to, 0, draggedNote);
        visible.forEach((note, index) => {
            note.position = index;
        });

        if (sortSelect) sortSelect.value = "manual";
        Promise.all(visible.map(note => saveNoteMetaToServer(note)))
            .then(() => renderNotes())
            .catch(error => alert("Не удалось сохранить порядок: " + error.message));
    });

    notesGrid.addEventListener("dragend", () => {
        draggedId = null;
        notesGrid.querySelectorAll(".dragging, .drag-over").forEach(item => {
            item.classList.remove("dragging", "drag-over");
        });
    });

    const params = new URLSearchParams(window.location.search);
    const initialCategory = params.get("category");
    if (initialCategory && categoryFilter) categoryFilter.value = initialCategory;

    loadNotes();
}

// Страница категорий
const categoryPageGrid = document.querySelector("#category-page-grid");

if (categoryPageGrid) {
    const categories = [
        { name: "Учёба", icon: "▤", description: "Конспекты, задания и подготовка к занятиям." },
        { name: "Работа", icon: "▣", description: "Рабочие задачи, проекты и планы." },
        { name: "Личное", icon: "◈", description: "Личные записи, планы и повседневные дела." },
        { name: "Идеи", icon: "✧", description: "Мысли, задумки и идеи для будущих проектов." }
    ];

    if (!getToken()) {
        window.location.href = "login.html";
    }

    updateAccountLabels();

    async function renderCategoryPage() {
        try {
            const notes = await apiRequest("/notes/");
            const meta = getNoteMeta();

            categoryPageGrid.innerHTML = categories.map(category => {
                const count = notes.filter(note => {
                    const noteMeta = meta[note.id] || {};
                    return !noteMeta.trashed &&
                        (note.category || noteMeta.category || "Личное") === category.name;
                }).length;

                return `
                    <article class="category-page-card">
                        <div class="category-page-icon">${category.icon}</div>
                        <h2>${category.name}</h2>
                        <p>${category.description}</p>
                        <span class="category-page-count">Заметок: ${count}</span>
                        <a href="dashboard.html?category=${encodeURIComponent(category.name)}">
                            Открыть заметки →
                        </a>
                    </article>
                `;
            }).join("");
        } catch (error) {
            categoryPageGrid.innerHTML = `<p class="form-error">Не удалось загрузить категории: ${escapeHTML(error.message)}</p>`;
        }
    }

    renderCategoryPage();
}

// Профиль пользователя
const profileForm = document.querySelector("#profile-form");

if (profileForm) {
    const nameInput = document.querySelector("#user-name");
    const emailInput = document.querySelector("#user-email");
    const profileName = document.querySelector("#profile-name");
    const profileEmail = document.querySelector("#profile-email");
    const profileAvatar = document.querySelector("#profile-avatar");
    const profileMessage = document.querySelector("#profile-message");
    const themeToggle = document.querySelector("#theme-toggle");

    if (!getToken()) {
        window.location.href = "login.html";
    }

    function applyTheme() {
        const lightTheme = themeToggle.checked;
        document.body.classList.toggle("light-theme", lightTheme);
        localStorage.setItem("vspl-theme", lightTheme ? "light" : "dark");
    }

    themeToggle.checked = localStorage.getItem("vspl-theme") === "light";
    applyTheme();
    themeToggle.addEventListener("change", applyTheme);

    async function loadProfile() {
        try {
            const profile = await apiRequest("/auth/me");
            saveProfile(profile);
            nameInput.value = profile.username || "";
            emailInput.value = profile.email || "";
            profileName.textContent = profile.username || "Пользователь";
            profileEmail.textContent = profile.email || "";
            profileAvatar.textContent = (profile.username || "U").charAt(0).toUpperCase();
        } catch (error) {
            showMessage(profileMessage, error.message, true);
        }
    }

    profileForm.addEventListener("submit", async event => {
        event.preventDefault();

        try {
            const updated = await apiRequest("/auth/me", {
                method: "PUT",
                body: JSON.stringify({
                    username: nameInput.value.trim(),
                    email: emailInput.value.trim()
                })
            });

            saveProfile(updated);
            profileName.textContent = updated.username;
            profileEmail.textContent = updated.email;
            profileAvatar.textContent = updated.username.charAt(0).toUpperCase();
            updateAccountLabels(updated);
            showMessage(profileMessage, "Изменения сохранены.");
        } catch (error) {
            showMessage(profileMessage, error.message, true);
        }
    });

    loadProfile();
}
