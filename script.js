

const API_URL = "https://vspl-notes-backend.onrender.com";
const TOKEN_KEY = "vspl-token";     
const PROFILE_KEY = "vspl-profile";
const THEME_KEY = "vspl-theme";

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

    let response;
    try {
        response = await fetch(API_URL + path, { ...options, headers });
    } catch (error) {
        throw new Error("Не удаётся связаться с сервером. Проверьте, что бэкенд запущен на " + API_URL + ".");
    }

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
        if ((response.status === 401 || response.status === 403) && path !== "/auth/login") {
            localStorage.removeItem(TOKEN_KEY);
            if (document.body.dataset.page !== "auth") {
                window.location.replace("index.html");
            }
        }

        let message = data.detail || "Не удалось выполнить запрос.";
        if (Array.isArray(message)) {
            // Ошибки проверки данных (код 422) приходят списком на английском
            message = "Проверьте правильность введённых данных.";
        }
        throw new Error(message);
    }

    return data;
}

function showMessage(element, message, type = "") {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("error", type === "error");
    element.classList.toggle("success", type === "success");
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

// Бэкенд отдаёт время по UTC без буквы «Z». Добавляем её,
// чтобы браузер правильно показал время в вашем часовом поясе.
function parseServerDate(value) {
    if (typeof value === "string" && !/(Z|[+-]\d\d:?\d\d)$/i.test(value)) {
        value += "Z";
    }
    return new Date(value);
}

function formatDate(value) {
    if (!value) return "—";

    const date = parseServerDate(value);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

// Всплывающее уведомление. Можно добавить кнопку (например, «Отменить»).
function toast(message, { type = "", actionLabel = "", onAction = null, duration = 4500 } = {}) {
    let box = document.querySelector(".toast-box");
    if (!box) {
        box = document.createElement("div");
        box.className = "toast-box";
        document.body.appendChild(box);
    }

    const item = document.createElement("div");
    item.className = "toast " + type;
    item.setAttribute("role", type === "error" ? "alert" : "status");

    const text = document.createElement("span");
    text.textContent = message;
    item.appendChild(text);

    if (actionLabel && onAction) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = actionLabel;
        button.addEventListener("click", () => {
            item.remove();
            onAction();
        });
        item.appendChild(button);
    }

    box.appendChild(item);
    setTimeout(() => item.remove(), duration);
}

/* ---------- 2. Общее для всех страниц ---------- */

// Тема оформления (переключается в профиле)
if (localStorage.getItem(THEME_KEY) === "light") {
    document.body.classList.add("light-theme");
}

const page = document.body.dataset.page;

// Если страница рабочая, а пользователь не вошёл — отправляем на вход.
if (page !== "auth" && !getToken()) {
    window.location.replace("index.html");
}

// Логотип ведёт в рабочее пространство, если пользователь вошёл,
// и на страницу входа, если нет.
document.querySelectorAll("[data-logo]").forEach(link => {
    link.setAttribute("href", getToken() ? "dashboard.html" : "index.html");
});

// Кнопка «Выйти»
document.querySelectorAll("[data-logout]").forEach(button => {
    button.addEventListener("click", () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(PROFILE_KEY);
        window.location.href = "index.html";
    });
});

// Имя и первая буква в боковом меню
function updateAccountLabels(profile = getProfile()) {
    const name = profile.username || "Пользователь";
    const label = document.querySelector("#user-name-label");
    const avatar = document.querySelector("#user-avatar");
    if (label) label.textContent = name;
    if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
}

if (page !== "auth") {
    updateAccountLabels();
}

/* ---------- 3. Вход и регистрация (index.html) ---------- */

if (page === "auth") {
    // Уже вошли? Тогда сразу в рабочее пространство.
    if (getToken()) {
        window.location.replace("dashboard.html");
    }

    const loginForm = document.querySelector("#login-form");
    const registerForm = document.querySelector("#register-form");
    const tabs = document.querySelectorAll("[data-tab]");

    function showTab(name) {
        loginForm.hidden = name !== "login";
        registerForm.hidden = name !== "register";
        tabs.forEach(tab => {
            tab.setAttribute("aria-selected", String(tab.dataset.tab === name));
        });
        history.replaceState(null, "", "#" + name);
    }

    tabs.forEach(tab => {
        tab.addEventListener("click", () => showTab(tab.dataset.tab));
    });

    showTab(window.location.hash === "#register" ? "register" : "login");

    // --- Регистрация: POST /auth/register ---
    registerForm.addEventListener("submit", async event => {
        event.preventDefault();

        const username = document.querySelector("#register-name").value.trim();
        const email = document.querySelector("#register-email").value.trim();
        const password = document.querySelector("#register-password").value;
        const confirmPassword = document.querySelector("#register-confirm").value;
        const message = document.querySelector("#register-message");
        const submitButton = registerForm.querySelector('button[type="submit"]');

        if (!username || !email || !password) {
            showMessage(message, "Заполните все поля.", "error");
            return;
        }
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            showMessage(message, "Введите корректный email.", "error");
            return;
        }
        if (password.length < 8) {
            showMessage(message, "Пароль должен содержать минимум 8 символов.", "error");
            return;
        }
        if (password !== confirmPassword) {
            showMessage(message, "Пароли не совпадают.", "error");
            return;
        }

        submitButton.disabled = true;
        showMessage(message, "Создаём аккаунт...");

        try {
            await apiRequest("/auth/register", {
                method: "POST",
                body: JSON.stringify({ username, email, password })
            });

            registerForm.reset();
            showMessage(message, "");
            showTab("login");
            document.querySelector("#login-username").value = username;
            document.querySelector("#login-password").focus();
            showMessage(document.querySelector("#login-message"),
                "Аккаунт создан. Теперь войдите.", "success");
        } catch (error) {
            showMessage(message, error.message, "error");
        } finally {
            submitButton.disabled = false;
        }
    });

    // --- Вход: POST /auth/login, затем GET /auth/me ---
    loginForm.addEventListener("submit", async event => {
        event.preventDefault();

        const username = document.querySelector("#login-username").value.trim();
        const password = document.querySelector("#login-password").value;
        const message = document.querySelector("#login-message");
        const submitButton = loginForm.querySelector('button[type="submit"]');

        if (!username || !password) {
            showMessage(message, "Введите имя пользователя (или email) и пароль.", "error");
            return;
        }

        submitButton.disabled = true;
        showMessage(message, "Выполняем вход...");

        try {
            const result = await apiRequest("/auth/login", {
                method: "POST",
                body: JSON.stringify({ username, password })
            });

            localStorage.setItem(TOKEN_KEY, result.access_token);
            saveProfile(await apiRequest("/auth/me"));

            window.location.href = "dashboard.html";
        } catch (error) {
            showMessage(message, error.message, "error");
            submitButton.disabled = false;
        }
    });
}

/* ---------- 4. Заметки и корзина (dashboard.html) ---------- */

if (page === "dashboard" && getToken()) {
    const grid = document.querySelector("#notes-grid");
    const emptyState = document.querySelector("#empty-state");
    const searchInput = document.querySelector("#note-search");
    const categoryFilter = document.querySelector("#category-filter");
    const sortSelect = document.querySelector("#sort-notes");
    const clearTrashButton = document.querySelector("#clear-trash");
    const addNoteButton = document.querySelector("#add-note");
    const gate = document.querySelector("#trash-gate");

    const modal = document.querySelector("#note-modal");
    const noteForm = document.querySelector("#note-form");
    const noteTitle = document.querySelector("#note-title");
    const noteContent = document.querySelector("#note-content");
    const noteCategory = document.querySelector("#note-category");
    const modalTitle = document.querySelector("#modal-title");
    const noteError = document.querySelector("#note-error");

    // Тексты для разных разделов
    const VIEWS = {
        all: { title: "Мои заметки", subtitle: "Все ваши записи в одном месте" },
        favorites: { title: "Избранное", subtitle: "Заметки, отмеченные звёздочкой" },
        trash: { title: "Корзина", subtitle: "Здесь можно восстановить заметку или удалить её навсегда" }
    };

    const ICON_STAR = '<svg class="icon" viewBox="0 0 24 24"><polygon points="12 2.5 14.9 8.9 22 9.6 16.7 14.3 18.2 21.3 12 17.7 5.8 21.3 7.3 14.3 2 9.6 9.1 8.9"/></svg>';
    const ICON_EDIT = '<svg class="icon" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
    const ICON_TRASH = '<svg class="icon" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/></svg>';

    let notes = [];           // все заметки пользователя (с сервера)
    let currentView = "all";  // all | favorites | trash
    let editingId = null;     // id редактируемой заметки (null — создаём новую)
    let draggedId = null;     // id заметки, которую сейчас тянут

    // --- Загрузка категорий с сервера: GET /categories/ ---
    async function loadCategories() {
        try {
            const categories = await apiRequest("/categories/");
            const selectedFilter = categoryFilter.value;
            const selectedCategory = noteCategory.value;

            // Фильтр категорий
            categoryFilter.innerHTML = '<option value="all">Все категории</option>';

            // Категории в редакторе заметки
            noteCategory.innerHTML = "";

            categories.forEach(category => {
                const name = category.name;

                const filterOption = document.createElement("option");
                filterOption.value = name;
                filterOption.textContent = name;
                categoryFilter.appendChild(filterOption);

                const editorOption = document.createElement("option");
                editorOption.value = name;
                editorOption.textContent = name;
                noteCategory.appendChild(editorOption);
            });

            // Сохраняем выбранные значения, если они ещё существуют
            if ([...categoryFilter.options].some(option => option.value === selectedFilter)) {
                categoryFilter.value = selectedFilter;
            } else {
                categoryFilter.value = "all";
            }

            if ([...noteCategory.options].some(option => option.value === selectedCategory)) {
                noteCategory.value = selectedCategory;
            } else {
                noteCategory.value = "Личное";
            }
        } catch (error) {
            console.error("Не удалось загрузить категории:", error);
        }
    }

    // --- Загрузка: GET /notes/ ---
    async function loadNotes() {
        grid.innerHTML = '<p class="loading-message">Загружаем заметки...</p>';
        emptyState.hidden = true;

        try {
            notes = await apiRequest("/notes/");
            renderNotes();
        } catch (error) {
            grid.innerHTML = `<p class="error-message">Не удалось загрузить заметки: ${escapeHTML(error.message)}</p>`;
        }
    }

    // Сохранение заметки целиком: PUT /notes/{id}
    // (бэкенд принимает все поля сразу, поэтому всегда отправляем их все)
    function saveNote(note, changes = {}) {
        const data = { ...note, ...changes };
        return apiRequest("/notes/" + note.id, {
            method: "PUT",
            body: JSON.stringify({
                title: data.title,
                content: data.content || "",
                category: data.category || "Личное",
                favorite: Boolean(data.favorite),
                trashed: Boolean(data.trashed),
                position: Number(data.position ?? 0)
            })
        });
    }

    function replaceNote(updated) {
        notes = notes.map(note => note.id === updated.id ? updated : note);
    }

    function findNote(id) {
        return notes.find(note => String(note.id) === String(id));
    }

    // --- Показ заметок ---
    function getVisibleNotes() {
        const search = searchInput.value.toLowerCase().trim();
        const category = categoryFilter.value;

        const visible = notes.filter(note => {
            if (currentView === "trash") return note.trashed;
            if (note.trashed) return false;
            if (currentView === "favorites" && !note.favorite) return false;
            if (category !== "all" && note.category !== category) return false;
            return (note.title + " " + note.content).toLowerCase().includes(search);
        });

        const sort = sortSelect.value;
        if (sort === "created") {
            visible.sort((a, b) => parseServerDate(b.created_at) - parseServerDate(a.created_at));
        } else if (sort === "title") {
            visible.sort((a, b) => a.title.localeCompare(b.title, "ru"));
        } else if (sort === "manual") {
            visible.sort((a, b) => a.position - b.position);
        } else {
            visible.sort((a, b) => parseServerDate(b.updated_at) - parseServerDate(a.updated_at));
        }
        return visible;
    }

    function noteCardHTML(note) {
        // Показываем дату изменения только если она отличается от даты создания
        const createdTime = parseServerDate(note.created_at).getTime();
        const updatedTime = parseServerDate(note.updated_at).getTime();
        const wasEdited = Number.isFinite(createdTime) && Number.isFinite(updatedTime)
            && Math.abs(updatedTime - createdTime) > 1000;

        const dates = `
            <div class="note-dates">
                <span>Создана: ${formatDate(note.created_at)}</span>
                ${wasEdited ? `<span>Изменена: ${formatDate(note.updated_at)}</span>` : ""}
            </div>`;

        if (note.trashed) {
            return `
            <article class="note-card" data-note-id="${note.id}">
                <div class="note-card-head">
                    <span class="note-category" data-category="${escapeHTML(note.category)}">${escapeHTML(note.category)}</span>
                </div>
                <h3>${escapeHTML(note.title)}</h3>
                <p class="note-preview">${escapeHTML(note.content || "Без текста")}</p>
                ${dates}
                <div class="note-trash-actions">
                    <button type="button" class="btn btn-outline" data-action="restore">Восстановить</button>
                    <button type="button" class="btn btn-danger" data-action="delete">Удалить навсегда</button>
                </div>
            </article>`;
        }

        return `
            <article class="note-card" draggable="true" data-note-id="${note.id}">
                <div class="note-card-head">
                    <span class="note-category" data-category="${escapeHTML(note.category)}">${escapeHTML(note.category)}</span>
                    <div class="note-actions">
                        <button type="button" class="icon-btn ${note.favorite ? "is-favorite" : ""}"
                                data-action="favorite" title="${note.favorite ? "Убрать из избранного" : "В избранное"}"
                                aria-label="Избранное">${ICON_STAR}</button>
                        <button type="button" class="icon-btn" data-action="edit"
                                title="Редактировать" aria-label="Редактировать">${ICON_EDIT}</button>
                        <button type="button" class="icon-btn" data-action="trash"
                                title="Переместить в корзину" aria-label="Переместить в корзину">${ICON_TRASH}</button>
                    </div>
                </div>
                <h3>${escapeHTML(note.title)}</h3>
                <p class="note-preview">${escapeHTML(note.content || "Без текста")}</p>
                ${dates}
            </article>`;
    }

    function renderNotes() {
        const visible = getVisibleNotes();
        grid.innerHTML = visible.map(noteCardHTML).join("");

        // Пустое состояние с понятным текстом для каждого случая
        emptyState.hidden = visible.length > 0;
        if (visible.length === 0) {
            const filtering = searchInput.value.trim() || categoryFilter.value !== "all";
            const title = document.querySelector("#empty-title");
            const text = document.querySelector("#empty-text");
            const addButton = document.querySelector("#empty-add");
            addButton.hidden = currentView !== "all" || Boolean(filtering);

            if (currentView === "trash") {
                title.textContent = "Корзина пуста";
                text.textContent = "Удалённые заметки будут появляться здесь.";
            } else if (filtering) {
                title.textContent = "Ничего не найдено";
                text.textContent = "Попробуйте изменить поиск или выбрать другую категорию.";
            } else if (currentView === "favorites") {
                title.textContent = "В избранном пока пусто";
                text.textContent = "Нажмите на звёздочку у заметки, чтобы добавить её сюда.";
            } else {
                title.textContent = "Заметок пока нет";
                text.textContent = "Создайте первую заметку — она сохранится в вашем аккаунте.";
            }
        }

        // Счётчики в боковом меню
        const active = notes.filter(note => !note.trashed);
        const counts = {
            all: active.length,
            favorites: active.filter(note => note.favorite).length,
            trash: notes.length - active.length
        };
        Object.keys(counts).forEach(key => {
            const element = document.querySelector("#count-" + key);
            if (element) element.textContent = counts[key] || "";
        });

        // Заголовок, подсветка меню и кнопки раздела
        document.querySelector("#page-title").textContent = VIEWS[currentView].title;
        document.querySelector("#page-subtitle").textContent = VIEWS[currentView].subtitle;
        document.querySelectorAll("[data-view]").forEach(link => {
            if (link.dataset.view === currentView) {
                link.setAttribute("aria-current", "page");
            } else {
                link.removeAttribute("aria-current");
            }
        });
        addNoteButton.hidden = currentView === "trash";
        clearTrashButton.hidden = !(currentView === "trash" && counts.trash > 0);
        sortSelect.disabled = currentView === "trash";
    }

    // --- Создание и редактирование ---
    function openModal(note = null) {
        editingId = note ? note.id : null;
        noteForm.reset();
        showMessage(noteError, "");

        if (note) {
            modalTitle.textContent = "Редактировать заметку";
            noteTitle.value = note.title;
            noteContent.value = note.content || "";
            noteCategory.value = note.category;
        } else {
            modalTitle.textContent = "Новая заметка";
            noteCategory.value = categoryFilter.value !== "all" ? categoryFilter.value : "Личное";
        }

        modal.hidden = false;
        noteTitle.focus();
    }

    function closeModal() {
        modal.hidden = true;
        editingId = null;
    }

    addNoteButton.addEventListener("click", () => openModal());
    document.querySelector("#empty-add").addEventListener("click", () => openModal());
    document.querySelector("#cancel-modal").addEventListener("click", closeModal);
    modal.addEventListener("mousedown", event => {
        if (event.target === modal) closeModal();
    });

    noteForm.addEventListener("submit", async event => {
        event.preventDefault();

        const title = noteTitle.value.trim();
        if (!title) {
            showMessage(noteError, "Введите название заметки.", "error");
            noteTitle.focus();
            return;
        }

        const submitButton = noteForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;

        try {
            const content = noteContent.value.trim();
            const category = noteCategory.value;

            if (editingId !== null) {
                // Редактирование: PUT /notes/{id}
                const updated = await saveNote(findNote(editingId), { title, content, category });
                replaceNote(updated);
            } else {
                // Создание: POST /notes/
                const created = await apiRequest("/notes/", {
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
                notes.unshift(created);
            }

            closeModal();
            renderNotes();
        } catch (error) {
            showMessage(noteError, error.message, "error");
        } finally {
            submitButton.disabled = false;
        }
    });

    // --- Окно подтверждения ---
    function confirmDialog(title, text, okLabel) {
        return new Promise(resolve => {
            const box = document.querySelector("#confirm-modal");
            const okButton = document.querySelector("#confirm-ok");
            const cancelButton = document.querySelector("#confirm-cancel");

            document.querySelector("#confirm-title").textContent = title;
            document.querySelector("#confirm-text").textContent = text;
            okButton.textContent = okLabel;
            box.hidden = false;
            cancelButton.focus();

            function finish(result) {
                box.hidden = true;
                okButton.removeEventListener("click", onOk);
                cancelButton.removeEventListener("click", onCancel);
                resolve(result);
            }
            const onOk = () => finish(true);
            const onCancel = () => finish(false);
            okButton.addEventListener("click", onOk);
            cancelButton.addEventListener("click", onCancel);
        });
    }

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        if (!document.querySelector("#confirm-modal").hidden) {
            document.querySelector("#confirm-cancel").click();
        } else if (!modal.hidden) {
            closeModal();
        }
    });

    // --- Корзина ---

    // Анимация: копия заметки летит по дуге в «ворота» (или в пункт меню «Корзина»),
    // уменьшаясь и крутясь, как мяч. Возвращает Promise, который завершается в конце полёта.
    function flyToTarget(card, target) {
        return new Promise(resolve => {
            const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (!card || !target || reduceMotion) {
                resolve();
                return;
            }

            const from = card.getBoundingClientRect();
            const to = target.getBoundingClientRect();
            const dx = to.left + to.width / 2 - (from.left + from.width / 2);
            const dy = to.top + to.height / 2 - (from.top + from.height / 2);

            const ball = card.cloneNode(true);
            ball.classList.add("flying");
            ball.classList.remove("dragging", "drag-over");
            ball.style.left = from.left + "px";
            ball.style.top = from.top + "px";
            ball.style.width = from.width + "px";
            ball.style.height = from.height + "px";
            document.body.appendChild(ball);
            card.style.visibility = "hidden";

            const flight = ball.animate([
                { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
                { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 90}px) scale(0.6) rotate(-14deg)`, opacity: 1, offset: 0.55 },
                { transform: `translate(${dx}px, ${dy}px) scale(0.1) rotate(18deg)`, opacity: 0.85 }
            ], { duration: 650, easing: "cubic-bezier(0.3, 0.1, 0.5, 1)" });

            flight.onfinish = () => {
                ball.remove();
                resolve();
            };
        });
    }

    // Ворота «принимают гол»: сетка пружинит
    function goalHit() {
        if (!gate) return;
        gate.classList.remove("goal-hit");
        void gate.offsetWidth; // перезапуск анимации
        gate.classList.add("goal-hit");
        setTimeout(() => gate.classList.remove("goal-hit"), 600);
    }

    // Заметка уходит в корзину: PUT /notes/{id} с trashed = true.
    // Навсегда она НЕ удаляется — её можно восстановить.
    async function moveToTrash(note, card, target) {
        try {
            const [updated] = await Promise.all([
                saveNote(note, { trashed: true }),
                flyToTarget(card, target)
            ]);
            if (target === gate) goalHit();
            replaceNote(updated);
            renderNotes();
            toast("Заметка «" + note.title + "» в корзине", {
                actionLabel: "Отменить",
                onAction: () => restoreNote(note.id)
            });
        } catch (error) {
            if (card) card.style.visibility = "";
            toast("Не удалось переместить в корзину: " + error.message, { type: "error" });
        }
    }

    async function restoreNote(id) {
        const note = findNote(id);
        if (!note) return;
        try {
            replaceNote(await saveNote(note, { trashed: false }));
            renderNotes();
            toast("Заметка восстановлена");
        } catch (error) {
            toast("Не удалось восстановить: " + error.message, { type: "error" });
        }
    }

    async function deleteForever(note) {
        const ok = await confirmDialog(
            "Удалить навсегда?",
            "Заметка «" + note.title + "» будет удалена без возможности восстановления.",
            "Удалить навсегда"
        );
        if (!ok) return;

        try {
            await apiRequest("/notes/" + note.id, { method: "DELETE" });
            notes = notes.filter(item => item.id !== note.id);
            renderNotes();
            toast("Заметка удалена навсегда");
        } catch (error) {
            toast("Не удалось удалить: " + error.message, { type: "error" });
        }
    }

    clearTrashButton.addEventListener("click", async () => {
        const trashed = notes.filter(note => note.trashed);
        if (trashed.length === 0) return;

        const ok = await confirmDialog(
            "Очистить корзину?",
            "Будет удалено заметок: " + trashed.length + ". Это действие нельзя отменить.",
            "Очистить"
        );
        if (!ok) return;

        // DELETE /notes/{id} для каждой заметки из корзины
        const results = await Promise.allSettled(
            trashed.map(note => apiRequest("/notes/" + note.id, { method: "DELETE" }))
        );
        const deletedIds = trashed.filter((note, index) => results[index].status === "fulfilled").map(note => note.id);
        notes = notes.filter(note => !deletedIds.includes(note.id));
        renderNotes();

        if (deletedIds.length === trashed.length) {
            toast("Корзина очищена");
        } else {
            toast("Часть заметок удалить не удалось. Попробуйте ещё раз.", { type: "error" });
        }
    });

    // --- Клики по карточкам ---
    grid.addEventListener("click", async event => {
        const card = event.target.closest("[data-note-id]");
        if (!card) return;

        const note = findNote(card.dataset.noteId);
        if (!note) return;

        const button = event.target.closest("[data-action]");
        const action = button ? button.dataset.action : (note.trashed ? "" : "edit");

        if (action === "edit") {
            openModal(note);
        } else if (action === "favorite") {
            try {
                replaceNote(await saveNote(note, { favorite: !note.favorite }));
                renderNotes();
            } catch (error) {
                toast("Не удалось изменить избранное: " + error.message, { type: "error" });
            }
        } else if (action === "trash") {
            // Кнопка для телефонов (и для тех, кто не хочет перетаскивать)
            const target = gate && getComputedStyle(gate).display !== "none"
                ? gate
                : document.querySelector('[data-view="trash"]');
            moveToTrash(note, card, target);
        } else if (action === "restore") {
            restoreNote(note.id);
        } else if (action === "delete") {
            deleteForever(note);
        }
    });

    // --- Поиск, фильтр, сортировка ---
    searchInput.addEventListener("input", renderNotes);
    categoryFilter.addEventListener("change", renderNotes);
    sortSelect.addEventListener("change", renderNotes);

    // --- Переключение разделов (Мои заметки / Избранное / Корзина) без перезагрузки ---
    function setView(view, updateAddress = true) {
        currentView = VIEWS[view] ? view : "all";
        if (updateAddress) {
            const address = currentView === "all" ? "dashboard.html" : "dashboard.html?view=" + currentView;
            history.replaceState(null, "", address);
        }
        renderNotes();
    }

    document.querySelectorAll("[data-view]").forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            setView(link.dataset.view);
        });
    });

    // --- Перетаскивание ---
    // 1) на другую карточку — меняем порядок;
    // 2) в «ворота» (или на пункт меню «Корзина») — заметка уходит в корзину.
    function endDrag() {
        draggedId = null;
        document.body.classList.remove("is-dragging");
        document.querySelectorAll(".dragging, .drag-over, .drop-over").forEach(element => {
            element.classList.remove("dragging", "drag-over", "drop-over");
        });
        if (gate) gate.classList.remove("over");
    }

    grid.addEventListener("dragstart", event => {
        const card = event.target.closest("[data-note-id]");
        if (!card) return;

        draggedId = card.dataset.noteId;
        event.dataTransfer.setData("text/plain", draggedId);
        event.dataTransfer.effectAllowed = "move";
        setTimeout(() => {
            card.classList.add("dragging");
            document.body.classList.add("is-dragging");
        }, 0);
    });

    document.addEventListener("dragend", endDrag);

    grid.addEventListener("dragover", event => {
        if (!draggedId) return;
        event.preventDefault();
        grid.querySelectorAll(".drag-over").forEach(item => item.classList.remove("drag-over"));
        const card = event.target.closest("[data-note-id]");
        if (card && card.dataset.noteId !== draggedId) card.classList.add("drag-over");
    });

    // Перестановка карточек
    grid.addEventListener("drop", async event => {
        event.preventDefault();
        const targetCard = event.target.closest("[data-note-id]");
        const dragged = findNote(draggedId);
        const target = targetCard ? findNote(targetCard.dataset.noteId) : null;
        if (!dragged || !target || dragged === target) return;

        const order = getVisibleNotes();
        order.splice(order.indexOf(dragged), 1);
        order.splice(order.indexOf(target), 0, dragged);

        // Сохраняем на сервере только те заметки, у которых изменилась позиция
        const changed = [];
        order.forEach((note, index) => {
            if (note.position !== index) changed.push({ note, position: index });
        });

        try {
            const saved = await Promise.all(changed.map(item => saveNote(item.note, { position: item.position })));
            saved.forEach(replaceNote);
            sortSelect.value = "manual";
            renderNotes();
        } catch (error) {
            toast("Не удалось сохранить порядок: " + error.message, { type: "error" });
            loadNotes();
        }
    });

    // Корзина как цель перетаскивания: ворота и пункт меню
    function makeDropTarget(element, highlightElement) {
        if (!element) return;

        element.addEventListener("dragover", event => {
            if (!draggedId) return;
            event.preventDefault();
            highlightElement.classList.add(highlightElement === gate ? "over" : "drop-over");
        });

        element.addEventListener("dragleave", event => {
            // Курсор просто перешёл на вложенный элемент — подсветку не снимаем
            if (element.contains(event.relatedTarget)) return;
            highlightElement.classList.remove("over", "drop-over");
        });

        element.addEventListener("drop", event => {
            event.preventDefault();
            const note = findNote(draggedId);
            const card = grid.querySelector(`[data-note-id="${draggedId}"]`);
            highlightElement.classList.remove("over", "drop-over");
            if (note) moveToTrash(note, card, element);
        });
    }

    makeDropTarget(gate, gate);
    const trashLink = document.querySelector('.sidebar [data-view="trash"]');
    makeDropTarget(trashLink, trashLink);

    // --- Старт ---
    // Сначала загружаем категории, затем применяем параметры страницы и загружаем заметки.
    loadCategories().then(() => {
        const params = new URLSearchParams(window.location.search);
        const startCategory = params.get("category");

        if (startCategory && [...categoryFilter.options].some(option => option.value === startCategory)) {
            categoryFilter.value = startCategory;
        }

        currentView = VIEWS[params.get("view")] ? params.get("view") : "all";
        loadNotes();
    });
}

/* ---------- 5. Категории (categories.html) ---------- */

if (page === "categories" && getToken()) {
    const grid = document.querySelector("#category-page-grid");
    const addButton = document.querySelector("#add-category-btn");
    const formContainer = document.querySelector("#category-form-container");
    const form = document.querySelector("#category-form");
    const nameInput = document.querySelector("#category-name");
    const descriptionInput = document.querySelector("#category-description");
    const cancelButton = document.querySelector("#cancel-category-btn");
    const message = document.querySelector("#category-form-message");

    const standardCategories = [
        { name: "Учёба", description: "Конспекты, задания и подготовка к занятиям." },
        { name: "Работа", description: "Рабочие задачи, проекты и планы." },
        { name: "Личное", description: "Личные записи и повседневные дела." },
        { name: "Идеи", description: "Мысли и задумки для будущих проектов." }
    ];

    let categories = [];

    addButton.addEventListener("click", () => {
        formContainer.hidden = false;
        nameInput.focus();
    });

    cancelButton.addEventListener("click", () => {
        form.reset();
        formContainer.hidden = true;
        showMessage(message, "");
    });

    async function renderCategories() {
        try {
            const [serverCategories, notes] = await Promise.all([
                apiRequest("/categories/"),
                apiRequest("/notes/")
            ]);

            categories = serverCategories;
            const activeNotes = notes.filter(note => !note.trashed);

            grid.innerHTML = categories.map(category => {
                const count = activeNotes.filter(
                    note => note.category === category.name
                ).length;

                const isCustom = category.id !== null && category.id !== undefined;

                return `
                    <div class="category-card">
                        <a href="dashboard.html?category=${encodeURIComponent(category.name)}">
                            <span class="note-category"
                                  data-category="${escapeHTML(category.name)}">
                                ${escapeHTML(category.name)}
                            </span>
                            <h2>${escapeHTML(category.name)}</h2>
                            <p>${escapeHTML(category.description || "")}</p>
                            <span class="category-count">Заметок: ${count}</span>
                        </a>
                        ${isCustom ? `
                            <button type="button"
                                    class="secondary-btn delete-category-btn"
                                    data-category-id="${category.id}"
                                    data-category-name="${escapeHTML(category.name)}">
                                Удалить
                            </button>
                        ` : ""}
                    </div>
                `;
            }).join("");

        } catch (error) {
            grid.innerHTML = `
                <p class="error-message">
                    Не удалось загрузить категории: ${escapeHTML(error.message)}
                </p>`;
        }
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const name = nameInput.value.trim();
        const description = descriptionInput.value.trim();

        if (!name) {
            showMessage(message, "Введите название категории.", "error");
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        showMessage(message, "Сохраняем категорию...");

        try {
            await apiRequest("/categories/", {
                method: "POST",
                body: JSON.stringify({ name, description })
            });

            form.reset();
            formContainer.hidden = true;
            showMessage(message, "");
            await renderCategories();

        } catch (error) {
            showMessage(message, error.message, "error");
        } finally {
            submitButton.disabled = false;
        }
    });

    grid.addEventListener("click", async event => {
        const button = event.target.closest(".delete-category-btn");
        if (!button) return;

        const categoryId = button.dataset.categoryId;
        const categoryName = button.dataset.categoryName;

        if (!confirm(
            `Удалить категорию «${categoryName}»? Заметки этой категории будут перенесены в «Личное».`
        )) {
            return;
        }

        button.disabled = true;

        try {
            await apiRequest(`/categories/${categoryId}`, {
                method: "DELETE"
            });

            await renderCategories();
        } catch (error) {
            alert("Не удалось удалить категорию: " + error.message);
            button.disabled = false;
        }
    });

    renderCategories();
}


/* ---------- 6. Профиль (profile.html) ---------- */

if (page === "profile" && getToken()) {
    const form = document.querySelector("#profile-form");
    const nameInput = document.querySelector("#user-name");
    const emailInput = document.querySelector("#user-email");
    const profileName = document.querySelector("#profile-name");
    const profileEmail = document.querySelector("#profile-email");
    const profileAvatar = document.querySelector("#profile-avatar");
    const message = document.querySelector("#profile-message");
    const themeToggle = document.querySelector("#theme-toggle");

    function showProfile(profile) {
        nameInput.value = profile.username || "";
        emailInput.value = profile.email || "";
        profileName.textContent = profile.username || "Пользователь";
        profileEmail.textContent = profile.email || "";
        profileAvatar.textContent = (profile.username || "U").charAt(0).toUpperCase();
        updateAccountLabels(profile);
    }

    // Переключатель темы
    themeToggle.checked = localStorage.getItem(THEME_KEY) === "light";
    themeToggle.addEventListener("change", () => {
        document.body.classList.toggle("light-theme", themeToggle.checked);
        localStorage.setItem(THEME_KEY, themeToggle.checked ? "light" : "dark");
    });

    // GET /auth/me
    async function loadProfile() {
        try {
            const profile = await apiRequest("/auth/me");
            saveProfile(profile);
            showProfile(profile);
        } catch (error) {
            showMessage(message, error.message, "error");
        }
    }

    // PUT /auth/me
    form.addEventListener("submit", async event => {
        event.preventDefault();

        const username = nameInput.value.trim();
        const email = emailInput.value.trim();

        if (!username || !/^\S+@\S+\.\S+$/.test(email)) {
            showMessage(message, "Введите имя пользователя и корректный email.", "error");
            return;
        }

        try {
            const updated = await apiRequest("/auth/me", {
                method: "PUT",
                body: JSON.stringify({ username, email })
            });
            saveProfile(updated);
            showProfile(updated);
            showMessage(message, "Изменения сохранены.", "success");
        } catch (error) {
            showMessage(message, error.message, "error");
        }
    });

    loadProfile();
}
