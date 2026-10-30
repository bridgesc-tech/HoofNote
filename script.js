const APP_VERSION = '1.0.19';
const WHEEL_ITEM = 44;
const MAX_PHOTOS = 8;
const STORAGE_KEY = 'hoofNotesData';
const TYPES = ['Dairy Cow', 'Beef Cow', 'Horse', 'Pig', 'Goat', 'Chicken', 'Lamb', 'Rabbit'];
const ROUTES = [
    ['SQ', 'SQ — Subcutaneous'],
    ['IM', 'IM — Intramuscular'],
    ['IN', 'IN — Intranasal'],
    ['PO', 'PO — By mouth'],
    ['IV', 'IV — Intravenous'],
    ['Topical', 'Topical']
];

class HoofNotes {
    constructor() {
        this.data = { animals: [], defaultEmail: '' };
        this.tab = 'animals';
        this.animalId = null;
        this.filter = 'All';
        this.query = '';
        this.editing = {};
        this.treatmentKind = 'Vaccination';
        this.dateParts = { year: new Date().getFullYear(), month: 1, day: 1 };
        this.wheelLock = false;
        this.wheelTimer = null;
        this.photoDraft = [];
        this.photoGridId = '';
        this.photoBusy = false;
        this.photosById = {};
        this.historyKind = null;
        this.load();
        this.fillTypes();
        this.bind();
        this.render();
        this.registerServiceWorker();
    }

    load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.animals)) this.data = parsed;
            if (!this.data.defaultEmail) this.data.defaultEmail = '';
        } catch (error) {
            console.error('Could not read records', error);
        }
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
            return true;
        } catch (error) {
            alert('These photos are too large to store on this device. Remove a photo and try again.');
            return false;
        }
    }

    uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    }

    todayString() {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${now.getFullYear()}-${month}-${day}`;
    }

    parseDate(value) {
        if (!value) return null;
        const parts = value.split('-').map(Number);
        if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    formatDate(value) {
        const date = this.parseDate(value);
        if (!date) return '';
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    age(value) {
        const born = this.parseDate(value);
        if (!born) return '';
        const now = new Date();
        let months = (now.getFullYear() - born.getFullYear()) * 12 + now.getMonth() - born.getMonth();
        if (now.getDate() < born.getDate()) months -= 1;
        if (months < 0) return '';
        const years = Math.floor(months / 12);
        const rest = months % 12;
        if (years === 0) return `${rest} mo`;
        if (rest === 0) return `${years} yr`;
        return `${years} yr ${rest} mo`;
    }

    money(value) {
        const amount = Number(value);
        if (Number.isNaN(amount)) return '';
        return amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
    }

    animal(id) {
        return this.data.animals.find((item) => item.id === (id || this.animalId));
    }

    treatments() {
        const rows = [];
        this.data.animals.forEach((animal) => {
            if (animal.archived) return;
            (animal.treatments || []).forEach((item) => {
                if (!item.nextDue) return;
                rows.push({ animal, item });
            });
        });
        rows.sort((a, b) => a.item.nextDue.localeCompare(b.item.nextDue));
        return rows;
    }

    dueState(value) {
        const date = this.parseDate(value);
        if (!date) return '';
        const today = this.parseDate(this.todayString());
        const days = Math.round((date - today) / 86400000);
        if (days < 0) return 'overdue';
        if (days <= 30) return 'soon';
        return 'later';
    }

    fillTypes() {
        const select = document.getElementById('animalType');
        select.innerHTML = TYPES.map((type) => `<option value="${type}">${type}</option>`).join('');
    }

    bind() {
        document.querySelectorAll('.nav-item').forEach((button) => {
            button.addEventListener('click', () => this.showTab(button.dataset.tab));
        });
        document.getElementById('closeProfileBtn').addEventListener('click', () => this.closeProfile());
        document.getElementById('closeHistoryBtn').addEventListener('click', () => this.closeHistory());
        document.getElementById('editAnimalBtn').addEventListener('click', () => this.openAnimal());
        document.getElementById('animalPhotoInput').addEventListener('change', (event) => {
            const file = event.target.files && event.target.files[0];
            event.target.value = '';
            if (file) this.setAnimalPhoto(file);
        });
        document.getElementById('removeAnimalPhotoBtn').addEventListener('click', () => this.removeAnimalPhoto());
        document.getElementById('cancelAnimalBtn').addEventListener('click', () => this.closeModal('animalModal'));
        document.getElementById('saveAnimalBtn').addEventListener('click', () => this.saveAnimal());
        document.getElementById('deleteAnimalBtn').addEventListener('click', () => this.deleteAnimal());
        document.getElementById('cancelHealthBtn').addEventListener('click', () => this.closeModal('healthModal'));
        document.getElementById('saveHealthBtn').addEventListener('click', () => this.saveHealth());
        document.getElementById('deleteHealthBtn').addEventListener('click', () => this.deleteRecord('healthChecks', 'healthModal'));
        document.getElementById('cancelWeightBtn').addEventListener('click', () => this.closeModal('weightModal'));
        document.getElementById('saveWeightBtn').addEventListener('click', () => this.saveWeight());
        document.getElementById('deleteWeightBtn').addEventListener('click', () => this.deleteRecord('weights', 'weightModal'));
        document.getElementById('cancelTreatmentBtn').addEventListener('click', () => this.closeModal('treatmentModal'));
        document.getElementById('saveTreatmentBtn').addEventListener('click', () => this.saveTreatment());
        document.getElementById('deleteTreatmentBtn').addEventListener('click', () => this.deleteRecord('treatments', 'treatmentModal'));
        this.bindTextMemory();
        document.getElementById('cancelBreedingBtn').addEventListener('click', () => this.closeModal('breedingModal'));
        document.getElementById('saveBreedingBtn').addEventListener('click', () => this.saveBreeding());
        document.getElementById('deleteBreedingBtn').addEventListener('click', () => this.deleteRecord('breedings', 'breedingModal'));
        document.getElementById('cancelExpenseBtn').addEventListener('click', () => this.closeModal('expenseModal'));
        document.getElementById('saveExpenseBtn').addEventListener('click', () => this.saveExpense());
        document.getElementById('deleteExpenseBtn').addEventListener('click', () => this.deleteRecord('expenses', 'expenseModal'));
        ['monthWheel', 'dayWheel', 'yearWheel'].forEach((id) => {
            const wheel = document.getElementById(id);
            wheel.addEventListener('scroll', () => this.onWheelScroll(id));
            wheel.addEventListener('click', (event) => {
                const item = event.target.closest('.wheel-item');
                if (!item) return;
                const items = [...wheel.querySelectorAll('.wheel-item')];
                wheel.scrollTo({ top: items.indexOf(item) * WHEEL_ITEM, behavior: 'smooth' });
            });
        });
        document.getElementById('treatmentKind').addEventListener('click', (event) => {
            const button = event.target.closest('[data-kind]');
            if (!button) return;
            this.treatmentKind = button.dataset.kind;
            document.querySelectorAll('#treatmentKind .segmented-btn').forEach((item) => {
                item.classList.toggle('active', item === button);
            });
        });
        document.body.addEventListener('change', (event) => {
            const input = event.target.closest('[data-photo-input]');
            if (input) this.addPhotoFiles(input);
        });
        document.body.addEventListener('click', (event) => {
            const mail = event.target.closest('[data-mail]');
            if (mail) {
                event.stopPropagation();
                this.emailReminder(mail.dataset.mail, mail.dataset.record);
                return;
            }
            const remove = event.target.closest('[data-remove-photo]');
            if (remove) {
                event.preventDefault();
                event.stopPropagation();
                this.photoDraft = this.photoDraft.filter((photo) => photo.id !== remove.dataset.removePhoto);
                this.renderPhotoDraft();
                return;
            }
            const view = event.target.closest('[data-view-photo]');
            if (view) {
                event.preventDefault();
                event.stopPropagation();
                this.showPhoto(view.dataset.viewPhoto);
            }
        });
        document.getElementById('photoViewer').addEventListener('click', (event) => {
            if (event.target.id === 'photoViewer' || event.target.id === 'closePhotoBtn') this.closePhoto();
        });
        document.getElementById('updateNowBtn').addEventListener('click', () => this.applyUpdate());
        document.getElementById('updateLaterBtn').addEventListener('click', () => {
            document.getElementById('updateBanner').classList.add('hidden');
        });
    }

    showTab(tab) {
        this.tab = tab;
        this.closeProfile();
        document.querySelectorAll('.nav-item').forEach((button) => {
            button.classList.toggle('active', button.dataset.tab === tab);
        });
        document.querySelectorAll('.tab').forEach((section) => {
            section.classList.toggle('active', section.id === `${tab}Tab`);
        });
        document.getElementById('screen').scrollTop = 0;
        this.render();
    }

    render() {
        this.renderAnimals();
        this.renderDue();
        this.renderMore();
        if (this.animalId && this.animal()) {
            this.renderProfile();
            if (this.historyKind) this.renderHistory();
        }
    }

    renderAnimals() {
        const showingArchived = this.filter === 'Archived';
        const labels = ['All', ...TYPES, 'Archived'];
        const midpoint = Math.ceil(labels.length / 2);
        const chip = (type) => `<button type="button" class="chip ${type === this.filter ? 'active' : ''}" data-filter="${this.escape(type)}">${type}</button>`;
        const chips = labels.slice(0, midpoint).map(chip).join('')
            + '<span class="chip-break"></span>'
            + labels.slice(midpoint).map(chip).join('');
        const animals = this.data.animals
            .filter((animal) => showingArchived ? animal.archived : !animal.archived)
            .filter((animal) => showingArchived || this.filter === 'All' || animal.type === this.filter)
            .filter((animal) => {
                const haystack = `${animal.name} ${animal.breed} ${animal.idNumber} ${animal.type}`.toLowerCase();
                return haystack.includes(this.query.toLowerCase());
            })
            .sort((a, b) => a.name.localeCompare(b.name));
        const cards = animals.map((animal) => {
            const next = (animal.treatments || []).filter((item) => item.nextDue).sort((a, b) => a.nextDue.localeCompare(b.nextDue))[0];
            const state = !showingArchived && next ? this.dueState(next.nextDue) : '';
            const flag = state === 'overdue' ? '<span class="flag">Overdue</span>' : state === 'soon' ? '<span class="flag soon">Due soon</span>' : '';
            return `
                <button type="button" class="animal-card" data-animal="${animal.id}">
                    <div class="animal-card-row">
                        ${animal.photo && animal.photo.src ? `<img class="animal-avatar" alt="" src="${animal.photo.src}">` : ''}
                        <div class="animal-card-text">
                            <div class="animal-top">
                                <strong>${this.escape(animal.name)}</strong>
                                ${flag}
                            </div>
                            <div class="meta">${this.escape(animal.type)}${animal.idNumber ? ` · ID ${this.escape(animal.idNumber)}` : ''}</div>
                            <div class="meta">${[animal.breed, animal.color].filter(Boolean).map((part) => this.escape(part)).join(' · ') || 'No breed or color yet'}</div>
                        </div>
                    </div>
                </button>
            `;
        }).join('');
        const empty = showingArchived
            ? '<div class="empty"><strong>No archived animals</strong>Animals you archive stay on this phone and show up here.</div>'
            : '<div class="empty"><strong>No animals yet</strong>Add the first animal to start a record.</div>';
        document.getElementById('animalsTab').innerHTML = `
            <div class="toolbar"><h3>${showingArchived ? 'Archived' : 'Your animals'}</h3><button type="button" class="btn btn-primary" id="addAnimalBtn">Add</button></div>
            <input class="search" id="animalSearch" type="search" placeholder="Search name, breed, or ID" value="${this.escape(this.query)}">
            <div class="chip-rows">${chips}</div>
            ${cards || empty}
        `;
        document.getElementById('addAnimalBtn').addEventListener('click', () => this.openAnimal(null));
        const search = document.getElementById('animalSearch');
        search.addEventListener('input', () => {
            this.query = search.value;
            this.renderAnimals();
            const next = document.getElementById('animalSearch');
            next.focus();
            next.setSelectionRange(next.value.length, next.value.length);
        });
        document.querySelectorAll('#animalsTab .chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                this.filter = chip.dataset.filter;
                this.renderAnimals();
            });
        });
        document.querySelectorAll('#animalsTab .animal-card').forEach((card) => {
            card.addEventListener('click', () => this.openProfile(card.dataset.animal));
        });
    }

    renderDue() {
        const groups = [
            ['overdue', 'Overdue'],
            ['soon', 'Next 30 days'],
            ['later', 'Later']
        ];
        const rows = this.treatments();
        const html = groups.map(([state, label]) => {
            const items = rows.filter((row) => this.dueState(row.item.nextDue) === state);
            if (!items.length) return '';
            return `<div class="section-block"><div class="section-head"><h3>${label}</h3></div>${items.map((row) => this.dueCard(row)).join('')}</div>`;
        }).join('');
        document.getElementById('dueTab').innerHTML = html || '<div class="empty"><strong>No due dates yet</strong>Add a next due date on a vaccination or deworming record.</div>';
        this.bindDueCards(document.getElementById('dueTab'));
    }

    dueCard(row) {
        const state = this.dueState(row.item.nextDue);
        const flag = state === 'overdue' ? 'Overdue' : state === 'soon' ? 'Due soon' : 'Scheduled';
        return `
            <button type="button" class="due-card" data-animal="${row.animal.id}">
                <div class="animal-top">
                    <strong>${this.escape(row.animal.name)}</strong>
                    <span class="flag ${state === 'later' ? 'soon' : ''}">${flag}</span>
                </div>
                <p>${this.escape(row.item.kind)} · ${this.escape(row.item.product)}</p>
                <p>Next due ${this.formatDate(row.item.nextDue)}${row.item.reminderEmail ? ` · ${this.escape(row.item.reminderEmail)}` : ''}</p>
                ${row.item.reminderEmail ? `<span class="add-link" data-mail="${row.animal.id}" data-record="${row.item.id}">Email reminder</span>` : ''}
            </button>
        `;
    }

    bindDueCards(root) {
        root.querySelectorAll('.due-card').forEach((card) => {
            card.addEventListener('click', (event) => {
                if (event.target.closest('[data-mail]')) return;
                this.openProfile(card.dataset.animal);
            });
        });
    }

    renderMore() {
        document.getElementById('moreTab').innerHTML = `
            <div class="panel">
                <h3>On this phone</h3>
                <p class="help">Records stay on this device. Nothing is sent to a server. Export a backup before you switch phones.</p>
                <div class="stack" style="margin-top:12px">
                    <button type="button" class="btn btn-primary" id="exportBtn">Export backup</button>
                    <label class="btn btn-secondary file-btn">Import backup<input id="importFile" type="file" accept="application/json,.json"></label>
                </div>
            </div>
            <div class="panel">
                <h3>Reminder email</h3>
                <p class="help">This address is filled in when you add a vaccination or deworming. Each record can use a different email.</p>
                <input class="field" id="defaultEmail" type="email" placeholder="you@example.com" value="${this.escape(this.data.defaultEmail || '')}" style="margin-top:10px">
            </div>
            <div class="panel">
                <h3>Add to Home Screen</h3>
                <p class="help">On iPhone: Share, then Add to Home Screen. On Android: the browser menu, then Install app or Add to Home screen. Open it once online, then it can open without service.</p>
                <button type="button" class="btn btn-secondary" id="checkUpdateBtn" style="margin-top:12px">Check for updates</button>
                <p class="help" id="updateStatus"></p>
            </div>
            <p class="version-text">Version ${APP_VERSION}</p>
        `;
        document.getElementById('exportBtn').addEventListener('click', () => this.exportBackup());
        document.getElementById('importFile').addEventListener('change', (event) => this.importBackup(event));
        document.getElementById('defaultEmail').addEventListener('change', (event) => {
            this.data.defaultEmail = event.target.value.trim();
            this.rememberEmail(this.data.defaultEmail);
            this.save();
        });
        document.getElementById('checkUpdateBtn').addEventListener('click', () => this.checkForUpdate(true));
    }

    openProfile(id) {
        this.animalId = id;
        const labels = { animals: 'Animals', due: 'Due', more: 'More' };
        document.getElementById('closeProfileBtn').textContent = `‹ ${labels[this.tab] || 'Animals'}`;
        document.getElementById('profile').classList.remove('hidden');
        this.renderProfile();
    }

    closeProfile() {
        this.closeHistory();
        this.animalId = null;
        document.getElementById('profile').classList.add('hidden');
    }

    closeHistory() {
        this.historyKind = null;
        document.getElementById('history').classList.add('hidden');
    }

    openHistory(kind) {
        this.historyKind = kind;
        document.getElementById('history').classList.remove('hidden');
        document.getElementById('historyBody').scrollTop = 0;
        this.renderHistory();
    }

    renderHistory() {
        const animal = this.animal();
        if (!animal || !this.historyKind) return;
        const titles = {
            health: 'Health checks',
            weight: 'Weight checks',
            treatment: 'Vaccinations and deworming',
            breeding: 'Breeding',
            expense: 'Expenses'
        };
        const lists = {
            health: () => this.healthList(animal),
            weight: () => this.weightList(animal),
            treatment: () => this.treatmentList(animal),
            breeding: () => this.breedingList(animal),
            expense: () => this.expenseList(animal)
        };
        document.getElementById('closeHistoryBtn').textContent = `‹ ${animal.name}`;
        document.getElementById('historyTitle').textContent = titles[this.historyKind] || 'Records';
        const result = lists[this.historyKind]();
        document.getElementById('historyBody').innerHTML = result.html || '<div class="empty"><strong>None yet</strong>Add the first record for this animal.</div>';
        this.bindRecords(document.getElementById('historyBody'));
    }

    renderProfile() {
        const animal = this.animal();
        if (!animal) return;
        this.photosById = {};
        document.getElementById('profileType').textContent = animal.type;
        document.getElementById('profileName').textContent = animal.name;
        document.getElementById('profileStatus').classList.toggle('hidden', !animal.archived);
        const bits = [animal.idNumber ? `ID ${animal.idNumber}` : '', this.age(animal.dob)].filter(Boolean);
        document.getElementById('profileMeta').textContent = bits.join(' · ');
        this.renderAnimalPhoto(animal);
        document.getElementById('profileBody').innerHTML = `
            <div class="facts">
                ${this.fact('Breed', animal.breed)}
                ${this.fact('Color', animal.color)}
                ${this.fact('ID number', animal.idNumber)}
                ${this.fact('Date of birth', animal.dob ? this.formatDate(animal.dob) : '')}
            </div>
            ${this.section('Health checks', 'health', this.healthList(animal, 3))}
            ${this.section('Weight checks', 'weight', this.weightList(animal, 3))}
            ${this.section('Vaccinations and deworming', 'treatment', this.treatmentList(animal, 3))}
            ${this.section('Breeding', 'breeding', this.breedingList(animal, 3))}
            ${this.section('Expenses', 'expense', this.expenseList(animal, 3))}
            <button type="button" class="btn btn-secondary archive-btn" id="archiveAnimalBtn">${animal.archived ? 'Return to active' : 'Archive animal'}</button>
            <p class="help archive-note">${animal.archived ? 'This animal is archived. The records stay on this phone.' : 'Archive an animal that has left the farm. The records stay on this phone, under Archived on the Animals page.'}</p>
        `;
        this.bindRecords(document.getElementById('profileBody'));
        document.getElementById('archiveAnimalBtn').addEventListener('click', () => this.toggleArchive());
        document.getElementById('profileBody').querySelectorAll('[data-history]').forEach((button) => {
            button.addEventListener('click', () => this.openHistory(button.dataset.history));
        });
    }

    renderAnimalPhoto(animal) {
        const photo = animal.photo && animal.photo.src ? animal.photo : null;
        const wrap = document.getElementById('profilePhotoWrap');
        const button = document.getElementById('profilePhotoBtn');
        const image = document.getElementById('profilePhotoImg');
        wrap.classList.toggle('has-photo', !!photo);
        button.classList.toggle('hidden', !photo);
        document.getElementById('removeAnimalPhotoBtn').classList.toggle('hidden', !photo);
        document.getElementById('profilePhotoLabelText').textContent = photo ? 'Change' : 'Add photo';
        if (photo) {
            image.src = photo.src;
            button.dataset.viewPhoto = photo.id;
            this.photosById[photo.id] = photo.src;
        } else {
            image.removeAttribute('src');
            delete button.dataset.viewPhoto;
        }
    }

    async setAnimalPhoto(file) {
        const animal = this.animal();
        if (!animal) return;
        const previous = animal.photo || null;
        const label = document.getElementById('profilePhotoLabelText');
        label.textContent = 'Adding…';
        try {
            const src = await this.compressPhoto(file);
            animal.photo = { id: this.uid(), src };
            if (!this.save()) {
                animal.photo = previous;
                this.renderAnimalPhoto(animal);
                return;
            }
            this.render();
        } catch (error) {
            animal.photo = previous;
            this.renderAnimalPhoto(animal);
            alert('That picture could not be added.');
        }
    }

    removeAnimalPhoto() {
        const animal = this.animal();
        if (!animal || !animal.photo) return;
        const previous = animal.photo;
        animal.photo = null;
        if (!this.save()) {
            animal.photo = previous;
            return;
        }
        this.render();
    }

    fact(label, value) {
        return `<div class="fact"><span>${label}</span><strong>${this.escape(value || '—')}</strong></div>`;
    }

    section(title, kind, result) {
        const more = result.total > 3
            ? `<button type="button" class="btn btn-secondary history-more" data-history="${kind}">More</button>`
            : '';
        const body = result.html
            ? `${result.html}${more}`
            : '<div class="empty"><strong>None yet</strong>Add the first record for this animal.</div>';
        const marks = {
            health: '<svg viewBox="0 0 24 24"><rect x="6" y="3.5" width="12" height="17" rx="2"/><path d="M9 3.5h6v3H9zM8.5 13.5l2.2 2.2 4.8-5"/></svg>',
            weight: '<svg viewBox="0 0 24 24"><path d="M4 16.5 9.2 11l3.8 3.4L20 7"/><path d="M14.5 7H20v5.5"/></svg>',
            treatment: '<svg viewBox="0 0 24 24"><path d="M12 3.2s6.2 6.4 6.2 10.4a6.2 6.2 0 0 1-12.4 0C5.8 9.6 12 3.2 12 3.2z"/></svg>',
            breeding: '<svg viewBox="0 0 24 24"><circle cx="8.5" cy="9" r="2.7"/><circle cx="15.5" cy="9" r="2.7"/><path d="M5.2 18.8c.6-2.3 2.1-3.6 4-3.6h5.6c1.9 0 3.4 1.3 4 3.6"/></svg>',
            expense: '<svg viewBox="0 0 24 24"><path d="M7 3.5h10v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3V3.5z"/><path d="M9.5 8h5M9.5 12h5"/></svg>'
        };
        return `
            <div class="section-block record-section section-${kind}">
                <div class="section-head">
                    <h3><span class="section-mark" aria-hidden="true">${marks[kind] || ''}</span>${title}</h3>
                    <button type="button" class="section-add" data-add="${kind}">Add</button>
                </div>
                ${body}
            </div>
        `;
    }

    bindRecords(root) {
        root.querySelectorAll('[data-add]').forEach((button) => {
            button.addEventListener('click', () => this.openRecord(button.dataset.add, null));
        });
        root.querySelectorAll('[data-edit]').forEach((button) => {
            button.addEventListener('click', () => this.openRecord(button.dataset.edit, button.dataset.id));
        });
    }

    healthList(animal, limit) {
        const items = this.sorted(animal.healthChecks);
        const shown = typeof limit === 'number' ? items.slice(0, limit) : items;
        const html = shown.map((item) => `
            <div class="record-wrap">
                <button type="button" class="record" data-edit="health" data-id="${item.id}">
                    <strong>${this.formatDate(item.date)}</strong>
                    <p>${this.escape(item.notes || 'No notes')}</p>
                </button>
                ${this.photoStrip(item.photos)}
            </div>
        `).join('');
        return { html, total: items.length };
    }

    weightList(animal, limit) {
        const items = this.sorted(animal.weights);
        const shown = typeof limit === 'number' ? items.slice(0, limit) : items;
        const chart = this.weightChart(items);
        const html = `${chart}${shown.map((item) => `
            <div class="record-wrap">
                <button type="button" class="record" data-edit="weight" data-id="${item.id}">
                    <strong>${this.escape(item.weight)} lb</strong>
                    <p>${this.formatDate(item.date)}${item.notes ? ` · ${this.escape(item.notes)}` : ''}</p>
                </button>
                ${this.photoStrip(item.photos)}
            </div>
        `).join('')}`;
        return { html, total: items.length };
    }

    chartDate(value) {
        const date = this.parseDate(value);
        if (!date) return '';
        return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    }

    weightLabel(weight) {
        const rounded = Math.round(weight * 10) / 10;
        return Number.isInteger(rounded) ? String(rounded) : String(rounded);
    }

    weightChart(items) {
        const points = items.map((item) => ({
            date: item.date,
            weight: Number(item.weight),
            time: this.parseDate(item.date)
        })).filter((point) => point.time && !Number.isNaN(point.weight))
            .sort((a, b) => a.time - b.time);
        if (!points.length) return '';

        const width = 320;
        const height = 148;
        const left = 46;
        const right = 14;
        const top = 16;
        const bottom = 28;
        const plotWidth = width - left - right;
        const plotHeight = height - top - bottom;
        const values = points.map((point) => point.weight);
        const dataLow = Math.min(...values);
        const dataHigh = Math.max(...values);
        let low = dataLow;
        let high = dataHigh;
        if (low === high) {
            low -= 1;
            high += 1;
        }
        const pad = (high - low) * 0.18;
        const yMin = low - pad;
        const yMax = high + pad;
        const times = points.map((point) => point.time.getTime());
        const tMin = Math.min(...times);
        const tMax = Math.max(...times);
        const xOf = (time) => (tMax === tMin ? left + plotWidth / 2 : left + ((time - tMin) / (tMax - tMin)) * plotWidth);
        const yOf = (weight) => top + ((yMax - weight) / (yMax - yMin)) * plotHeight;
        const coords = points.map((point) => ({
            x: xOf(point.time.getTime()),
            y: yOf(point.weight)
        }));
        const line = coords.map((coord) => `${coord.x.toFixed(1)},${coord.y.toFixed(1)}`).join(' ');
        const dots = coords.map((coord) => `<circle cx="${coord.x.toFixed(1)}" cy="${coord.y.toFixed(1)}" r="3.5"/>`).join('');
        const highY = yOf(dataHigh);
        const lowY = yOf(dataLow);
        const showLow = dataLow !== dataHigh && lowY - highY >= 16;
        const first = coords[0];
        const last = coords[coords.length - 1];

        return `
            <svg class="weight-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Weight over time">
                <line class="chart-axis" x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}"/>
                <line class="chart-axis" x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}"/>
                <polyline class="chart-line" points="${line}"/>
                ${dots}
                <text x="${left - 8}" y="${(highY + 4).toFixed(1)}" text-anchor="end">${this.escape(this.weightLabel(dataHigh))}</text>
                ${showLow ? `<text x="${left - 8}" y="${(lowY + 4).toFixed(1)}" text-anchor="end">${this.escape(this.weightLabel(dataLow))}</text>` : ''}
                <text class="chart-date" x="${first.x.toFixed(1)}" y="${height - 8}" text-anchor="${points.length === 1 ? 'middle' : 'start'}">${this.escape(this.chartDate(points[0].date))}</text>
                ${points.length > 1 ? `<text class="chart-date" x="${last.x.toFixed(1)}" y="${height - 8}" text-anchor="end">${this.escape(this.chartDate(points[points.length - 1].date))}</text>` : ''}
            </svg>
        `;
    }

    treatmentList(animal, limit) {
        const items = this.sorted(animal.treatments);
        const shown = typeof limit === 'number' ? items.slice(0, limit) : items;
        const html = shown.map((item) => {
            const route = ROUTES.find((entry) => entry[0] === item.route);
            const state = this.dueState(item.nextDue);
            return `
                <div class="record-wrap">
                    <button type="button" class="record" data-edit="treatment" data-id="${item.id}">
                        <div class="record-top">
                            <strong>${this.escape(item.product || item.kind)}</strong>
                            <span class="pill">${this.escape(item.kind)}</span>
                        </div>
                        <p>${this.formatDate(item.date)} · ${this.escape(item.amount || 'Amount not set')} · ${this.escape(route ? route[0] : item.route || '')}</p>
                        <p>${item.administeredBy ? `Given by ${this.escape(item.administeredBy)}` : ''}${item.nextDue ? ` · Next due ${this.formatDate(item.nextDue)}` : ''}</p>
                        ${state === 'overdue' ? '<p class="flag">Overdue</p>' : ''}
                        ${item.notes ? `<p>${this.escape(item.notes)}</p>` : ''}
                    </button>
                ${this.photoStrip(item.photos)}
            </div>
        `;
        }).join('');
        return { html, total: items.length };
    }

    breedingList(animal, limit) {
        const items = this.sorted(animal.breedings);
        const shown = typeof limit === 'number' ? items.slice(0, limit) : items;
        const html = shown.map((item) => `
            <div class="record-wrap">
                <button type="button" class="record" data-edit="breeding" data-id="${item.id}">
                    <div class="record-top">
                        <strong>${this.escape(item.method)}</strong>
                        <span class="pill">${this.formatDate(item.date)}</span>
                    </div>
                    <p>Breeder ${this.escape(item.breeder || '—')}</p>
                    <p>Bred with ${this.escape(item.mate || '—')}</p>
                    ${item.notes ? `<p>${this.escape(item.notes)}</p>` : ''}
                </button>
                ${this.photoStrip(item.photos)}
            </div>
        `).join('');
        return { html, total: items.length };
    }

    expenseList(animal, limit) {
        const source = [...(animal.expenses || [])];
        const added = new Map(source.map((item, index) => [item.id, index]));
        const items = source.sort((a, b) => {
            const byDate = (b.date || '').localeCompare(a.date || '');
            if (byDate) return byDate;
            return (added.get(b.id) || 0) - (added.get(a.id) || 0);
        });
        const shown = typeof limit === 'number' ? items.slice(0, limit) : items;
        const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const summary = items.length ? `<p class="expense-total">Total ${this.money(total)}</p>` : '';
        const html = `${summary}${shown.map((item) => `
            <div class="record-wrap">
                <button type="button" class="record" data-edit="expense" data-id="${item.id}">
                    <div class="record-top">
                        <strong>${this.money(item.amount)}</strong>
                        <span class="pill">${this.escape(item.category || 'Other')}</span>
                    </div>
                    <p>${this.formatDate(item.date)}${item.item ? ` · ${this.escape(item.item)}` : ''}</p>
                    ${item.notes ? `<p>${this.escape(item.notes)}</p>` : ''}
                </button>
                ${this.photoStrip(item.photos)}
            </div>
        `).join('')}`;
        return { html, total: items.length };
    }

    photoStrip(photos) {
        const list = Array.isArray(photos) ? photos.filter((photo) => photo && photo.src) : [];
        list.forEach((photo) => { this.photosById[photo.id] = photo.src; });
        if (!list.length) return '';
        return `<div class="photo-strip">${list.map((photo) => `
            <button type="button" class="thumb" data-view-photo="${this.escape(photo.id)}" aria-label="View photo">
                <img alt="" src="${photo.src}">
            </button>
        `).join('')}</div>`;
    }

    loadPhotoDraft(item, gridId) {
        const photos = item && Array.isArray(item.photos) ? item.photos : [];
        this.photoDraft = photos.filter((photo) => photo && photo.src).map((photo) => ({ id: photo.id, src: photo.src }));
        this.photoGridId = gridId;
        this.renderPhotoDraft();
    }

    photoFields() {
        return this.photoDraft.map((photo) => ({ id: photo.id, src: photo.src }));
    }

    renderPhotoDraft() {
        const grid = document.getElementById(this.photoGridId);
        if (!grid) return;
        this.photoDraft.forEach((photo) => { this.photosById[photo.id] = photo.src; });
        grid.innerHTML = this.photoDraft.map((photo) => `
            <div class="photo-draft-item">
                <button type="button" class="thumb" data-view-photo="${this.escape(photo.id)}" aria-label="View photo">
                    <img alt="" src="${photo.src}">
                </button>
                <button type="button" class="photo-remove" data-remove-photo="${this.escape(photo.id)}" aria-label="Remove photo">×</button>
            </div>
        `).join('');
    }

    async addPhotoFiles(input) {
        const files = [...input.files];
        input.value = '';
        if (!files.length || this.photoBusy) return;
        const label = input.closest('.photo-pick');
        const caption = label ? label.querySelector('span') : null;
        this.photoBusy = true;
        if (label) label.classList.add('is-busy');
        if (caption) caption.textContent = 'Adding photos…';
        let skipped = false;
        try {
            for (const file of files) {
                if (this.photoDraft.length >= MAX_PHOTOS) {
                    skipped = true;
                    break;
                }
                try {
                    const src = await this.compressPhoto(file);
                    this.photoDraft.push({ id: this.uid(), src });
                    this.renderPhotoDraft();
                } catch (error) {
                    skipped = true;
                }
            }
        } finally {
            this.photoBusy = false;
            if (label) label.classList.remove('is-busy');
            if (caption) caption.textContent = 'Take or choose photos';
        }
        if (skipped) alert('Some photos were skipped. Each report can hold 8 photos, and each one needs to be a picture this device can read.');
    }

    compressPhoto(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => {
                const maxEdge = 1280;
                const scale = Math.min(1, maxEdge / Math.max(image.width || 1, image.height || 1));
                const width = Math.max(1, Math.round(image.width * scale));
                const height = Math.max(1, Math.round(image.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(image, 0, 0, width, height);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/jpeg', 0.72));
            };
            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('unreadable'));
            };
            image.src = url;
        });
    }

    showPhoto(id) {
        const src = this.photosById[id];
        if (!src) return;
        document.getElementById('photoViewerImg').src = src;
        document.getElementById('photoViewer').classList.remove('hidden');
    }

    closePhoto() {
        document.getElementById('photoViewer').classList.add('hidden');
        document.getElementById('photoViewerImg').removeAttribute('src');
    }

    sorted(list) {
        return [...(list || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    openModal(id) {
        this.hideTextSuggestions();
        document.getElementById(id).classList.remove('hidden');
    }

    closeModal(id) {
        this.hideTextSuggestions();
        document.getElementById(id).classList.add('hidden');
    }

    daysInMonth(year, month) {
        return new Date(year, month, 0).getDate();
    }

    numberRange(from, to) {
        const values = [];
        const step = from <= to ? 1 : -1;
        for (let value = from; step > 0 ? value <= to : value >= to; value += step) values.push(value);
        return values;
    }

    setDateWheels(iso) {
        const parts = String(iso || '').split('-').map(Number);
        const today = new Date();
        const year = parts[0] || today.getFullYear();
        const month = parts[1] || (today.getMonth() + 1);
        const day = parts[2] || today.getDate();
        this.dateParts = {
            year,
            month,
            day: Math.min(day, this.daysInMonth(year, month))
        };
        this.renderWheel('monthWheel', this.numberRange(1, 12), this.dateParts.month);
        this.renderWheel('yearWheel', this.numberRange(today.getFullYear(), 1970), this.dateParts.year);
        this.renderDayWheel();
        this.syncDateInput();
    }

    renderDayWheel() {
        this.wheelLock = true;
        this.renderWheel('dayWheel', this.numberRange(1, this.daysInMonth(this.dateParts.year, this.dateParts.month)), this.dateParts.day);
        this.wheelLock = false;
    }

    renderWheel(id, values, selected) {
        const wheel = document.getElementById(id);
        wheel.innerHTML = '<div class="wheel-pad"></div>' + values.map((value) => {
            return `<div class="wheel-item" data-value="${value}">${value}</div>`;
        }).join('') + '<div class="wheel-pad"></div>';
        const index = Math.max(0, values.indexOf(Number(selected)));
        const apply = () => {
            wheel.scrollTop = index * WHEEL_ITEM;
            this.markWheel(wheel);
        };
        apply();
        requestAnimationFrame(() => requestAnimationFrame(apply));
    }

    readWheel(wheel) {
        const items = [...wheel.querySelectorAll('.wheel-item')];
        if (!items.length) return '';
        const index = Math.max(0, Math.min(items.length - 1, Math.round(wheel.scrollTop / WHEEL_ITEM)));
        return items[index].dataset.value;
    }

    markWheel(wheel) {
        const selected = this.readWheel(wheel);
        wheel.querySelectorAll('.wheel-item').forEach((item) => {
            item.classList.toggle('is-selected', item.dataset.value === String(selected));
        });
    }

    onWheelScroll(id) {
        if (this.wheelLock) return;
        const wheel = document.getElementById(id);
        this.markWheel(wheel);
        clearTimeout(this.wheelTimer);
        this.wheelTimer = setTimeout(() => this.commitWheel(id), 90);
    }

    commitWheel(id) {
        if (this.wheelLock) return;
        const value = Number(this.readWheel(document.getElementById(id)));
        if (!value) return;
        if (id === 'monthWheel') this.dateParts.month = value;
        if (id === 'yearWheel') this.dateParts.year = value;
        if (id === 'dayWheel') this.dateParts.day = value;
        if (id !== 'dayWheel') {
            const maxDay = this.daysInMonth(this.dateParts.year, this.dateParts.month);
            if (this.dateParts.day > maxDay) this.dateParts.day = maxDay;
            this.renderDayWheel();
        }
        this.syncDateInput();
    }

    syncDateInput() {
        const month = String(this.dateParts.month).padStart(2, '0');
        const day = String(this.dateParts.day).padStart(2, '0');
        document.getElementById('animalDob').value = `${this.dateParts.year}-${month}-${day}`;
    }

    setDate(id, value) {
        document.getElementById(id).value = value || this.todayString();
    }

    openAnimal(id) {
        const animal = id ? this.animal(id) : (this.animalId ? this.animal() : null);
        const editing = animal && (id || this.animalId);
        this.editing.animal = editing ? animal.id : null;
        document.getElementById('animalModalTitle').textContent = editing ? 'Edit animal' : 'Add animal';
        document.getElementById('animalType').value = animal ? animal.type : TYPES[0];
        document.getElementById('animalName').value = animal ? animal.name : '';
        document.getElementById('animalBreed').value = animal ? animal.breed || '' : '';
        document.getElementById('animalColor').value = animal ? animal.color || '' : '';
        document.getElementById('animalTag').value = animal ? animal.idNumber || '' : '';
        document.getElementById('deleteAnimalBtn').classList.toggle('hidden', !editing);
        this.openModal('animalModal');
        this.setDateWheels(animal && animal.dob ? animal.dob : '');
        document.getElementById('animalName').focus();
    }

    saveAnimal() {
        const name = document.getElementById('animalName').value.trim();
        const type = document.getElementById('animalType').value;
        if (!name) {
            alert('Add a name first.');
            return;
        }
        if (!type) {
            alert('Choose an animal type.');
            return;
        }
        this.commitWheel('yearWheel');
        this.commitWheel('monthWheel');
        this.commitWheel('dayWheel');
        const fields = {
            type,
            name,
            breed: document.getElementById('animalBreed').value.trim(),
            color: document.getElementById('animalColor').value.trim(),
            idNumber: document.getElementById('animalTag').value.trim(),
            dob: document.getElementById('animalDob').value
        };
        if (this.editing.animal) {
            Object.assign(this.animal(this.editing.animal), fields);
        } else {
            const animal = {
                id: this.uid(),
                ...fields,
                healthChecks: [],
                weights: [],
                treatments: [],
                breedings: [],
                expenses: []
            };
            this.data.animals.push(animal);
            this.animalId = animal.id;
            document.getElementById('profile').classList.remove('hidden');
        }
        this.save();
        this.closeModal('animalModal');
        this.render();
    }

    deleteAnimal() {
        const animal = this.animal(this.editing.animal);
        if (!animal || !confirm(`Remove ${animal.name} and all of their records?`)) return;
        this.data.animals = this.data.animals.filter((item) => item.id !== animal.id);
        this.save();
        this.closeModal('animalModal');
        this.closeProfile();
        this.render();
    }

    recordList(kind) {
        const animal = this.animal();
        if (!animal) return null;
        if (!Array.isArray(animal[kind])) animal[kind] = [];
        return animal[kind];
    }

    openRecord(kind, id) {
        if (kind === 'health') this.openHealth(id);
        if (kind === 'weight') this.openWeight(id);
        if (kind === 'treatment') this.openTreatment(id);
        if (kind === 'breeding') this.openBreeding(id);
        if (kind === 'expense') this.openExpense(id);
    }

    openHealth(id) {
        const item = id ? (this.recordList('healthChecks') || []).find((entry) => entry.id === id) : null;
        this.editing.health = item ? item.id : null;
        document.getElementById('healthModalTitle').textContent = item ? 'Edit health check' : 'Health check';
        this.setDate('healthDate', item ? item.date : '');
        document.getElementById('healthNotes').value = item ? item.notes || '' : '';
        document.getElementById('deleteHealthBtn').classList.toggle('hidden', !item);
        this.loadPhotoDraft(item, 'healthPhotoDraft');
        this.openModal('healthModal');
    }

    saveHealth() {
        const date = document.getElementById('healthDate').value;
        if (!date) {
            alert('Add the date of the check.');
            return;
        }
        if (this.photoBusy) {
            alert('Wait for the photos to finish adding.');
            return;
        }
        const fields = { date, notes: document.getElementById('healthNotes').value.trim(), photos: this.photoFields() };
        if (!this.upsert('healthChecks', 'health', fields)) return;
        this.closeModal('healthModal');
    }

    openWeight(id) {
        const item = id ? (this.recordList('weights') || []).find((entry) => entry.id === id) : null;
        this.editing.weight = item ? item.id : null;
        document.getElementById('weightModalTitle').textContent = item ? 'Edit weight check' : 'Weight check';
        this.setDate('weightDate', item ? item.date : '');
        document.getElementById('weightValue').value = item ? item.weight : '';
        document.getElementById('weightNotes').value = item ? item.notes || '' : '';
        document.getElementById('deleteWeightBtn').classList.toggle('hidden', !item);
        this.loadPhotoDraft(item, 'weightPhotoDraft');
        this.openModal('weightModal');
    }

    saveWeight() {
        const date = document.getElementById('weightDate').value;
        const weight = document.getElementById('weightValue').value.trim();
        if (!date || !weight) {
            alert('Add the date and the weight.');
            return;
        }
        if (this.photoBusy) {
            alert('Wait for the photos to finish adding.');
            return;
        }
        const previousTexts = this.copySavedTexts();
        this.rememberText('weightValue', weight);
        if (!this.upsert('weights', 'weight', {
            date,
            weight,
            unit: 'lb',
            notes: document.getElementById('weightNotes').value.trim(),
            photos: this.photoFields()
        })) {
            this.data.savedTexts = previousTexts;
            return;
        }
        this.closeModal('weightModal');
    }

    emailChoices() {
        const list = [];
        const seen = new Set();
        const add = (email) => {
            const value = String(email || '').trim();
            const key = value.toLowerCase();
            if (!value || seen.has(key)) return;
            seen.add(key);
            list.push(value);
        };
        (this.data.savedEmails || []).forEach(add);
        add(this.data.defaultEmail);
        (this.data.animals || []).forEach((animal) => {
            (animal.treatments || []).forEach((item) => add(item.reminderEmail));
        });
        return list;
    }

    rememberEmail(email) {
        const value = String(email || '').trim();
        if (!value) return;
        const key = value.toLowerCase();
        const rest = (this.data.savedEmails || []).filter((item) => String(item).trim().toLowerCase() !== key);
        this.data.savedEmails = [value, ...rest].slice(0, 30);
    }

    copySavedTexts() {
        return JSON.parse(JSON.stringify(this.data.savedTexts || {}));
    }

    textChoices(fieldId) {
        if (fieldId === 'treatmentEmail') return this.emailChoices();
        const sources = {
            weightValue: ['weights', 'weight'],
            treatmentProduct: ['treatments', 'product'],
            treatmentAmount: ['treatments', 'amount'],
            treatmentBy: ['treatments', 'administeredBy'],
            breedingBreeder: ['breedings', 'breeder'],
            breedingMate: ['breedings', 'mate'],
            expenseItem: ['expenses', 'item'],
            expenseAmount: ['expenses', 'amount']
        };
        const source = sources[fieldId];
        if (!source) return [];
        const [listName, key] = source;
        const list = [];
        const seen = new Set();
        const add = (raw) => {
            const value = String(raw ?? '').trim();
            const id = value.toLowerCase();
            if (!value || seen.has(id)) return;
            seen.add(id);
            list.push(value);
        };
        const saved = this.data.savedTexts && this.data.savedTexts[fieldId];
        (saved || []).forEach(add);
        const records = [];
        (this.data.animals || []).forEach((animal) => {
            (animal[listName] || []).forEach((item) => records.push(item));
        });
        this.sorted(records).forEach((item) => add(item[key]));
        return list;
    }

    rememberText(fieldId, raw) {
        const value = String(raw ?? '').trim();
        if (!value || fieldId === 'treatmentEmail') return;
        if (!this.data.savedTexts || typeof this.data.savedTexts !== 'object') this.data.savedTexts = {};
        const key = value.toLowerCase();
        const rest = (this.data.savedTexts[fieldId] || []).filter((item) => String(item).trim().toLowerCase() !== key);
        this.data.savedTexts[fieldId] = [value, ...rest].slice(0, 30);
    }

    bindTextMemory() {
        const ids = [
            'weightValue',
            'treatmentProduct',
            'treatmentAmount',
            'treatmentBy',
            'treatmentEmail',
            'breedingBreeder',
            'breedingMate',
            'expenseItem',
            'expenseAmount'
        ];
        ids.forEach((id) => {
            const input = document.getElementById(id);
            input.setAttribute('autocomplete', 'off');
            input.setAttribute('autocapitalize', 'off');
            input.spellcheck = false;
            input.addEventListener('focus', () => this.showTextSuggestions(input, ''));
            input.addEventListener('click', () => this.showTextSuggestions(input, ''));
            input.addEventListener('input', () => this.showTextSuggestions(input, input.value));
            input.addEventListener('blur', () => {
                clearTimeout(this.textBlurTimer);
                this.textBlurTimer = setTimeout(() => this.hideTextSuggestions(), 160);
            });
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') this.hideTextSuggestions();
            });
        });
    }

    showTextSuggestions(input, query) {
        clearTimeout(this.textBlurTimer);
        const needle = String(query || '').trim().toLowerCase();
        const matches = this.textChoices(input.id).filter((value) => !needle || value.toLowerCase().includes(needle));
        const list = this.suggestionList();
        list.innerHTML = '';
        if (!matches.length) {
            list.classList.add('hidden');
            return;
        }
        matches.forEach((value) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'email-suggestion';
            button.textContent = input.id === 'expenseAmount' ? (this.money(value) || value) : value;
            button.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                clearTimeout(this.textBlurTimer);
            });
            button.addEventListener('click', () => {
                input.value = value;
                this.hideTextSuggestions();
            });
            list.appendChild(button);
        });
        (input.closest('.money-field') || input).insertAdjacentElement('afterend', list);
        list.classList.remove('hidden');
        list.scrollIntoView({ block: 'nearest' });
    }

    suggestionList() {
        if (!this.suggestList) {
            const list = document.createElement('div');
            list.className = 'email-suggestions hidden';
            this.suggestList = list;
        }
        return this.suggestList;
    }

    hideTextSuggestions() {
        if (this.suggestList) this.suggestList.classList.add('hidden');
    }

    openTreatment(id) {
        const item = id ? (this.recordList('treatments') || []).find((entry) => entry.id === id) : null;
        this.editing.treatment = item ? item.id : null;
        this.treatmentKind = item ? item.kind : 'Vaccination';
        document.querySelectorAll('#treatmentKind .segmented-btn').forEach((button) => {
            button.classList.toggle('active', button.dataset.kind === this.treatmentKind);
        });
        document.getElementById('treatmentModalTitle').textContent = item ? 'Edit record' : 'Vaccination or deworming';
        this.setDate('treatmentDate', item ? item.date : '');
        document.getElementById('treatmentProduct').value = item ? item.product || '' : '';
        document.getElementById('treatmentAmount').value = item ? item.amount || '' : '';
        document.getElementById('treatmentRoute').value = item && item.route ? item.route : 'SQ';
        document.getElementById('treatmentBy').value = item ? item.administeredBy || '' : '';
        document.getElementById('treatmentDue').value = item ? item.nextDue || '' : '';
        document.getElementById('treatmentEmail').value = item ? item.reminderEmail || '' : (this.data.defaultEmail || '');
        document.getElementById('treatmentNotes').value = item ? item.notes || '' : '';
        document.getElementById('deleteTreatmentBtn').classList.toggle('hidden', !item);
        this.loadPhotoDraft(item, 'treatmentPhotoDraft');
        this.openModal('treatmentModal');
    }

    saveTreatment() {
        const date = document.getElementById('treatmentDate').value;
        const product = document.getElementById('treatmentProduct').value.trim();
        if (!date || !product) {
            alert('Add the date given and the product.');
            return;
        }
        if (this.photoBusy) {
            alert('Wait for the photos to finish adding.');
            return;
        }
        const email = document.getElementById('treatmentEmail').value.trim();
        const amount = document.getElementById('treatmentAmount').value.trim();
        const administeredBy = document.getElementById('treatmentBy').value.trim();
        const previousEmail = this.data.defaultEmail;
        const previousEmails = Array.isArray(this.data.savedEmails) ? this.data.savedEmails.slice() : [];
        const previousTexts = this.copySavedTexts();
        this.rememberText('treatmentProduct', product);
        this.rememberText('treatmentAmount', amount);
        this.rememberText('treatmentBy', administeredBy);
        if (email) {
            this.data.defaultEmail = email;
            this.rememberEmail(email);
        }
        const saved = this.upsert('treatments', 'treatment', {
            kind: this.treatmentKind,
            date,
            product,
            amount,
            route: document.getElementById('treatmentRoute').value,
            administeredBy,
            nextDue: document.getElementById('treatmentDue').value,
            reminderEmail: email,
            notes: document.getElementById('treatmentNotes').value.trim(),
            photos: this.photoFields()
        });
        if (!saved) {
            this.data.defaultEmail = previousEmail;
            this.data.savedEmails = previousEmails;
            this.data.savedTexts = previousTexts;
            return;
        }
        this.closeModal('treatmentModal');
    }

    openBreeding(id) {
        const item = id ? (this.recordList('breedings') || []).find((entry) => entry.id === id) : null;
        this.editing.breeding = item ? item.id : null;
        document.getElementById('breedingModalTitle').textContent = item ? 'Edit breeding' : 'Breeding';
        this.setDate('breedingDate', item ? item.date : '');
        document.getElementById('breedingMethod').value = item ? item.method || 'Natural Cover' : 'Natural Cover';
        document.getElementById('breedingBreeder').value = item ? item.breeder || '' : '';
        document.getElementById('breedingMate').value = item ? item.mate || '' : '';
        document.getElementById('breedingNotes').value = item ? item.notes || '' : '';
        document.getElementById('deleteBreedingBtn').classList.toggle('hidden', !item);
        this.loadPhotoDraft(item, 'breedingPhotoDraft');
        this.openModal('breedingModal');
    }

    saveBreeding() {
        const date = document.getElementById('breedingDate').value;
        const breeder = document.getElementById('breedingBreeder').value.trim();
        const mate = document.getElementById('breedingMate').value.trim();
        if (!date || !breeder || !mate) {
            alert('Add the date, the breeder, and the animal bred with.');
            return;
        }
        if (this.photoBusy) {
            alert('Wait for the photos to finish adding.');
            return;
        }
        const previousTexts = this.copySavedTexts();
        this.rememberText('breedingBreeder', breeder);
        this.rememberText('breedingMate', mate);
        if (!this.upsert('breedings', 'breeding', {
            date,
            method: document.getElementById('breedingMethod').value,
            breeder,
            mate,
            notes: document.getElementById('breedingNotes').value.trim(),
            photos: this.photoFields()
        })) {
            this.data.savedTexts = previousTexts;
            return;
        }
        this.closeModal('breedingModal');
    }

    openExpense(id) {
        const item = id ? (this.recordList('expenses') || []).find((entry) => entry.id === id) : null;
        this.editing.expense = item ? item.id : null;
        document.getElementById('expenseModalTitle').textContent = item ? 'Edit expense' : 'Expense';
        this.setDate('expenseDate', item ? item.date : '');
        document.getElementById('expenseCategory').value = item && item.category ? item.category : 'Feed';
        document.getElementById('expenseItem').value = item ? item.item || '' : '';
        document.getElementById('expenseAmount').value = item ? item.amount : '';
        document.getElementById('expenseNotes').value = item ? item.notes || '' : '';
        document.getElementById('deleteExpenseBtn').classList.toggle('hidden', !item);
        this.loadPhotoDraft(item, 'expensePhotoDraft');
        this.openModal('expenseModal');
    }

    saveExpense() {
        const date = document.getElementById('expenseDate').value;
        const item = document.getElementById('expenseItem').value.trim();
        const amount = document.getElementById('expenseAmount').value.trim();
        if (!date || !item || !amount) {
            alert('Add the date, what it was, and the amount.');
            return;
        }
        if (this.photoBusy) {
            alert('Wait for the photos to finish adding.');
            return;
        }
        const previousTexts = this.copySavedTexts();
        this.rememberText('expenseItem', item);
        this.rememberText('expenseAmount', amount);
        if (!this.upsert('expenses', 'expense', {
            date,
            category: document.getElementById('expenseCategory').value,
            item,
            amount,
            notes: document.getElementById('expenseNotes').value.trim(),
            photos: this.photoFields()
        })) {
            this.data.savedTexts = previousTexts;
            return;
        }
        this.closeModal('expenseModal');
    }

    toggleArchive() {
        const animal = this.animal();
        if (!animal) return;
        if (!animal.archived && !confirm(`Archive ${animal.name}? The records stay on this phone. Open Archived on the Animals page to see them again.`)) return;
        animal.archived = !animal.archived;
        if (!this.save()) {
            animal.archived = !animal.archived;
            return;
        }
        this.render();
    }

    upsert(listName, editKey, fields) {
        const list = this.recordList(listName);
        if (!list) return false;
        let undo = () => {};
        if (this.editing[editKey]) {
            const current = list.find((item) => item.id === this.editing[editKey]);
            if (!current) return false;
            const previous = { ...current };
            Object.assign(current, fields);
            undo = () => {
                Object.keys(current).forEach((key) => delete current[key]);
                Object.assign(current, previous);
            };
        } else {
            const created = { id: this.uid(), ...fields };
            list.push(created);
            undo = () => {
                const index = list.indexOf(created);
                if (index >= 0) list.splice(index, 1);
            };
        }
        if (!this.save()) {
            undo();
            return false;
        }
        this.render();
        return true;
    }

    deleteRecord(listName, modalId) {
        const animal = this.animal();
        if (!animal || !confirm('Delete this record?')) return;
        const keys = { healthChecks: 'health', weights: 'weight', treatments: 'treatment', breedings: 'breeding', expenses: 'expense' };
        const id = this.editing[keys[listName]];
        animal[listName] = (animal[listName] || []).filter((item) => item.id !== id);
        this.save();
        this.closeModal(modalId);
        this.render();
    }

    emailReminder(animalId, recordId) {
        const animal = this.animal(animalId);
        const item = animal && (animal.treatments || []).find((entry) => entry.id === recordId);
        if (!item || !item.reminderEmail) return;
        const subject = `HoofNotes reminder: ${animal.name} — ${item.product}`;
        const body = [
            `${animal.name} (${animal.type}${animal.idNumber ? `, ID ${animal.idNumber}` : ''})`,
            `${item.kind}: ${item.product}`,
            item.amount ? `Amount: ${item.amount}` : '',
            item.route ? `Route: ${item.route}` : '',
            item.nextDue ? `Next due: ${this.formatDate(item.nextDue)}` : '',
            item.notes ? `Notes: ${item.notes}` : ''
        ].filter(Boolean).join('\n');
        window.location.href = `mailto:${encodeURIComponent(item.reminderEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    exportBackup() {
        const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `hoofnotes-backup-${this.todayString()}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    importBackup(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                if (!parsed || !Array.isArray(parsed.animals)) throw new Error('bad file');
                if (!confirm('Replace the animals on this phone with this backup?')) return;
                this.data = {
                    animals: parsed.animals,
                    defaultEmail: parsed.defaultEmail || '',
                    savedEmails: Array.isArray(parsed.savedEmails) ? parsed.savedEmails : [],
                    savedTexts: parsed.savedTexts && typeof parsed.savedTexts === 'object' ? parsed.savedTexts : {}
                };
                this.save();
                this.closeProfile();
                this.render();
            } catch (error) {
                alert('That file is not a HoofNotes backup.');
            }
        };
        reader.readAsText(file);
    }

    registerServiceWorker() {
        if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') return;
        window.addEventListener('load', async () => {
            try {
                this.registration = await navigator.serviceWorker.register('./service-worker.js');
                this.registration.addEventListener('updatefound', () => {
                    const worker = this.registration.installing;
                    if (!worker) return;
                    worker.addEventListener('statechange', () => {
                        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                            document.getElementById('updateBanner').classList.remove('hidden');
                        }
                    });
                });
                this.checkForUpdate(false);
            } catch (error) {
                console.error('Service worker failed', error);
            }
        });
    }

    async checkForUpdate(manual) {
        const status = document.getElementById('updateStatus');
        try {
            if (this.registration) await this.registration.update();
            const response = await fetch(`./service-worker.js?t=${Date.now()}`, { cache: 'no-store' });
            const text = await response.text();
            const match = text.match(/APP_VERSION = '([^']+)'/);
            const remote = match && match[1];
            if (remote && remote !== APP_VERSION) {
                document.getElementById('updateBanner').classList.remove('hidden');
                if (status) status.textContent = `Version ${remote} is ready.`;
                return;
            }
            if (manual && status) status.textContent = 'You have the latest version.';
        } catch (error) {
            if (manual && status) status.textContent = 'Could not check for updates.';
        }
    }

    async applyUpdate() {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new HoofNotes();
});
