// DriveJournal - Admin Script

// Tab-Navigation
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', function() {
        const tabName = this.dataset.tab;
        
        // Entferne aktive Klasse von allen Tabs
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(content => content.classList.remove('active'));
        
        // Aktiviere gewählten Tab
        this.classList.add('active');
        document.getElementById('tab-' + tabName).classList.add('active');
    });
});

// Auto hinzufügen
document.getElementById('add-car-form')?.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const form = this;
    const formData = new FormData(form);
    formData.append('action', 'add_car');

    // Validate optional cost fields (German format: 1,99) - max 2 decimals
    const costKm = form.querySelector('[name="cost_per_km"]');
    const costMonth = form.querySelector('[name="cost_per_month"]');
    const germanRegex = /^\d+(,\d{1,2})?$/;
    if (costKm && costKm.value.trim() !== '' && !germanRegex.test(costKm.value.trim())) {
        alert('Bitte geben Sie €/km im Format 1,99 (max. 2 Nachkommastellen) ein oder lassen Sie das Feld leer.');
        costKm.focus();
        return;
    }
    if (costMonth && costMonth.value.trim() !== '' && !germanRegex.test(costMonth.value.trim())) {
        alert('Bitte geben Sie €/Monat im Format 19,99 (max. 2 Nachkommastellen) ein oder lassen Sie das Feld leer.');
        costMonth.focus();
        return;
    }

    // normalize comma to dot for submission
    if (costKm && costKm.value.trim() !== '') formData.set('cost_per_km', costKm.value.trim().replace(',', '.'));
    if (costMonth && costMonth.value.trim() !== '') formData.set('cost_per_month', costMonth.value.trim().replace(',', '.'));
    
    fetch('api.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            location.reload();
        } else {
            alert('Fehler: ' + data.message);
        }
    })
    .catch(error => {
        alert('Fehler beim Hinzufügen!');
        console.error(error);
    });
});

// Auto löschen
function deleteCar(carId) {
    if (!confirm('Auto wirklich löschen?')) {
        return;
    }
    
    const formData = new FormData();
    formData.append('action', 'delete_car');
    formData.append('car_id', carId);
    
    fetch('api.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            location.reload();
        } else {
            alert('Fehler beim Löschen!');
        }
    })
    .catch(error => {
        alert('Fehler beim Löschen!');
        console.error(error);
    });
}

// Benutzer hinzufügen
document.getElementById('add-user-form')?.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    formData.append('action', 'add_user');
    
    fetch('api.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            location.reload();
        } else {
            alert('Fehler: ' + data.message);
        }
    })
    .catch(error => {
        alert('Fehler beim Hinzufügen!');
        console.error(error);
    });
});

// Benutzer löschen
function deleteUser(userId) {
    if (!confirm('Benutzer wirklich löschen?')) {
        return;
    }
    
    const formData = new FormData();
    formData.append('action', 'delete_user');
    formData.append('user_id', userId);
    
    fetch('api.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            location.reload();
        } else {
            alert('Fehler beim Löschen!');
        }
    })
    .catch(error => {
        alert('Fehler beim Löschen!');
        console.error(error);
    });
}

// Link kopieren (vereinfacht)
function copyLink(button) {
    // 1) try data-link attribute on the button
    const linkFromData = button && button.dataset && button.dataset.link ? button.dataset.link.trim() : '';
    // 2) fallback: try to find the .user-link-text in the same row
    let text = linkFromData;
    if (!text) {
        const row = button.closest('.form_row');
        const textElem = row ? row.querySelector('.user-link-text') : null;
        text = textElem ? textElem.textContent.trim() : '';
    }

    if (!text) { alert('Kein Link vorhanden'); return; }

    const doCopy = (value) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(value);
        }
        return new Promise((resolve, reject) => {
            const ta = document.createElement('textarea');
            ta.value = value;
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(ta);
                resolve();
            } catch (err) {
                document.body.removeChild(ta);
                reject(err);
            }
        });
    };

    doCopy(text).then(() => {
        const originalText = button.textContent;
        button.textContent = '✓ Kopiert!';
        setTimeout(() => { button.textContent = originalText; }, 2000);
    }).catch(() => { alert('Bitte Link manuell kopieren'); });
}

function openLink(button) {
    const dataLink = button.dataset && button.dataset.link ? button.dataset.link.trim() : '';
    if (dataLink) { window.open(dataLink, '_blank', 'noopener'); return; }
    const container = button.parentElement;
    const row = button.closest('.form_row');
    const textElem = container.querySelector('.user-link-text') || (row ? row.querySelector('.user-link-text') : null);
    const url = textElem ? textElem.textContent.trim() : '';
    if (!url) { alert('Kein Link vorhanden'); return; }
    window.open(url, '_blank', 'noopener');
}

// (Fallback) prompt-basiertes Bearbeiten
function promptEditUser(userId, currentName) {
    const newName = prompt('Neuer Name für Benutzer:', currentName || '');
    if (newName === null) return;
    const trimmed = newName.trim();
    if (trimmed.length === 0) { alert('Name darf nicht leer sein.'); return; }
    const fd = new FormData(); fd.append('action', 'edit_user'); fd.append('user_id', userId); fd.append('name', trimmed);
    fetch('api.php', { method: 'POST', body: fd }).then(r => r.json()).then(d => { if (d.success) location.reload(); else alert('Fehler: ' + (d.message || 'Beim Aktualisieren')); }).catch(e => { console.error(e); alert('Fehler beim Aktualisieren'); });
}

// Inline-Edit: start, save, cancel
function startInlineEdit(userId) {
    const nameInput = document.getElementById('user-name-input-' + userId);
    const emailInput = document.getElementById('user-email-input-' + userId);
    if (!nameInput || !emailInput) return;
    try { nameInput.dataset.original = nameInput.value; } catch (e) {}
    try { emailInput.dataset.original = emailInput.value; } catch (e) {}
    nameInput.removeAttribute('disabled');
    emailInput.removeAttribute('disabled');
    nameInput.focus();
    try { nameInput.setAttribute('enterkeyhint', 'done'); } catch (e) {}
    nameInput.setAttribute('autocomplete', 'off');
    nameInput.setAttribute('inputmode', 'text');
    // Handle Enter (save) and Escape (cancel)
    nameInput.onkeydown = function(e) {
        if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            saveInlineEdit(userId);
        } else if (e.key === 'Escape' || e.keyCode === 27) {
            e.preventDefault();
            cancelInlineEdit(userId);
        }
    };
    emailInput.onkeydown = nameInput.onkeydown;
    // toggle buttons using data-user-id (single save button becomes active)
    const editButton = document.querySelector('[data-action="edit"][data-user-id="' + userId + '"]');
    const saveButton = document.querySelector('[data-action="save"][data-user-id="' + userId + '"]');
    const cancelButton = document.querySelector('[data-action="cancel"][data-user-id="' + userId + '"]');
    if (editButton) editButton.classList.add('hidden');
    if (saveButton) { saveButton.classList.remove('hidden'); saveButton.classList.add('active'); saveButton.removeAttribute('disabled'); }
    if (cancelButton) cancelButton.classList.remove('hidden');
}

// --- Car edit: allow editing name only ---
function startCarEdit(carId) {
    const nameInput = document.getElementById('car-name-input-' + carId);
    if (!nameInput) return;
    // show input editable
    // store original value so cancel can restore it
    try { nameInput.dataset.original = nameInput.value; } catch (e) {}
    nameInput.removeAttribute('disabled');
    nameInput.focus();

    // toggle buttons
    const editBtn = document.querySelector('[data-action="edit"][data-car-id="' + carId + '"]');
    const saveBtn = document.querySelector('[data-action="save"][data-car-id="' + carId + '"]');
    const cancelBtn = document.querySelector('[data-action="cancel"][data-car-id="' + carId + '"]');
    if (editBtn) editBtn.classList.add('hidden');
    if (saveBtn) { saveBtn.classList.remove('hidden'); saveBtn.classList.add('active'); saveBtn.removeAttribute('disabled'); }
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    // Enter to save, Escape to cancel
    nameInput.onkeydown = function(e) {
        if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); saveCarEdit(carId); }
        else if (e.key === 'Escape' || e.keyCode === 27) { e.preventDefault(); cancelCarEdit(carId); }
    };

    // also enable cost inputs if present
    const costKm = document.getElementById('car-cost-km-input-' + carId);
    const costMonth = document.getElementById('car-cost-month-input-' + carId);
    if (costKm) { try { costKm.dataset.original = costKm.value; } catch (e) {} ; costKm.removeAttribute('disabled'); }
    if (costMonth) { try { costMonth.dataset.original = costMonth.value; } catch (e) {} ; costMonth.removeAttribute('disabled'); }
}

function cancelCarEdit(carId) {
    const nameInput = document.getElementById('car-name-input-' + carId);
    if (!nameInput) return;
    // restore original value saved on start
    if (nameInput.dataset && typeof nameInput.dataset.original !== 'undefined') {
        nameInput.value = nameInput.dataset.original;
    }
    nameInput.setAttribute('disabled', 'disabled');

    // restore cost inputs
    const costKm = document.getElementById('car-cost-km-input-' + carId);
    const costMonth = document.getElementById('car-cost-month-input-' + carId);
    if (costKm && costKm.dataset && typeof costKm.dataset.original !== 'undefined') {
        costKm.value = costKm.dataset.original;
        costKm.setAttribute('disabled', 'disabled');
    }
    if (costMonth && costMonth.dataset && typeof costMonth.dataset.original !== 'undefined') {
        costMonth.value = costMonth.dataset.original;
        costMonth.setAttribute('disabled', 'disabled');
    }

    const editBtn = document.querySelector('[data-action="edit"][data-car-id="' + carId + '"]');
    const saveBtn = document.querySelector('[data-action="save"][data-car-id="' + carId + '"]');
    const cancelBtn = document.querySelector('[data-action="cancel"][data-car-id="' + carId + '"]');
    if (editBtn) editBtn.classList.remove('hidden');
    if (saveBtn) { saveBtn.classList.add('hidden'); saveBtn.classList.remove('active'); saveBtn.setAttribute('disabled', 'disabled'); }
    if (cancelBtn) cancelBtn.classList.add('hidden');
}

function saveCarEdit(carId) {
    const nameInput = document.getElementById('car-name-input-' + carId);
    if (!nameInput) return;
    const newName = nameInput.value.trim();
    if (newName.length === 0) { alert('Name darf nicht leer sein.'); return; }

    const fd = new FormData();
    fd.append('action', 'edit_car');
    fd.append('car_id', carId);
    fd.append('name', newName);

    // include optional cost fields (German decimal like "1,99")
    const costKmInput = document.getElementById('car-cost-km-input-' + carId);
    const costMonthInput = document.getElementById('car-cost-month-input-' + carId);
    const germanRegex = /^\d+(,\d{1,2})?$/;
    if (costKmInput) {
        const v = costKmInput.value.trim();
        if (v !== '') {
            if (!germanRegex.test(v)) { alert('€/km muss im Format 1,99 (max. 2 Nachkommastellen) sein'); return; }
            // convert comma to dot for transmission (server may expect this)
            fd.append('cost_per_km', v.replace(',', '.'));
        }
    }
    if (costMonthInput) {
        const v = costMonthInput.value.trim();
        if (v !== '') {
            if (!germanRegex.test(v)) { alert('€/Monat muss im Format 19,99 (max. 2 Nachkommastellen) sein'); return; }
            fd.append('cost_per_month', v.replace(',', '.'));
        }
    }

    fetch('api.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(d => {
            const status = document.getElementById('car-status-' + carId);
            if (d.success) {
                if (status) { status.className = 'status-message status-message--success'; status.textContent = 'Daten von Auto ' + newName + ' erfolgreich gespeichert'; }
                // disable inputs and toggle buttons back
                nameInput.setAttribute('disabled', 'disabled');
                if (costKmInput) costKmInput.setAttribute('disabled', 'disabled');
                if (costMonthInput) costMonthInput.setAttribute('disabled', 'disabled');
                const editBtn = document.querySelector('[data-action="edit"][data-car-id="' + carId + '"]');
                const saveBtn = document.querySelector('[data-action="save"][data-car-id="' + carId + '"]');
                const cancelBtn = document.querySelector('[data-action="cancel"][data-car-id="' + carId + '"]');
                if (editBtn) editBtn.classList.remove('hidden');
                if (saveBtn) { saveBtn.classList.add('hidden'); saveBtn.classList.remove('active'); saveBtn.setAttribute('disabled', 'disabled'); }
                if (cancelBtn) cancelBtn.classList.add('hidden');
                // update inputs from server (server may return numbers as floats or strings)
                if (d.car && typeof d.car.name !== 'undefined') {
                    nameInput.value = d.car.name;
                    try { nameInput.dataset.original = d.car.name; } catch (e) {}
                } else {
                    try { nameInput.dataset.original = newName; } catch (e) {}
                }
                const formatGerman = (num) => {
                    if (num === null || typeof num === 'undefined' || num === '') return '';
                    const n = typeof num === 'number' ? num : parseFloat(String(num).replace(',', '.'));
                    if (isNaN(n)) return '';
                    return n.toFixed(2).replace('.', ',');
                };
                if (costKmInput) {
                    if (d.car && typeof d.car.cost_per_km !== 'undefined') {
                        costKmInput.value = formatGerman(d.car.cost_per_km);
                        try { costKmInput.dataset.original = costKmInput.value; } catch (e) {}
                    } else {
                        try { costKmInput.dataset.original = costKmInput.value; } catch (e) {}
                    }
                }
                if (costMonthInput) {
                    if (d.car && typeof d.car.cost_per_month !== 'undefined') {
                        costMonthInput.value = formatGerman(d.car.cost_per_month);
                        try { costMonthInput.dataset.original = costMonthInput.value; } catch (e) {}
                    } else {
                        try { costMonthInput.dataset.original = costMonthInput.value; } catch (e) {}
                    }
                }
                // hide success after 3s
                setTimeout(() => { if (status) { status.className = 'status-message'; status.textContent = ''; } }, 3000);
            } else {
                if (status) { status.className = 'status-message status-message--error'; status.textContent = d.message || 'Fehler beim Speichern'; }
            }
        })
        .catch(e => {
            console.error(e);
            const status = document.getElementById('car-status-' + carId);
            if (status) { status.className = 'status-message status-message--error'; status.textContent = 'Fehler beim Speichern'; }
        });
}

function cancelInlineEdit(userId) {
    const nameInput = document.getElementById('user-name-input-' + userId);
    const emailInput = document.getElementById('user-email-input-' + userId);
    if (!nameInput || !emailInput) return;
    // restore original values
    if (nameInput.dataset && typeof nameInput.dataset.original !== 'undefined') {
        nameInput.value = nameInput.dataset.original;
    }
    if (emailInput.dataset && typeof emailInput.dataset.original !== 'undefined') {
        emailInput.value = emailInput.dataset.original;
    }
    nameInput.setAttribute('disabled', 'disabled');
    emailInput.setAttribute('disabled', 'disabled');
    const editButton = document.querySelector('[data-action="edit"][data-user-id="' + userId + '"]');
    const saveButton = document.querySelector('[data-action="save"][data-user-id="' + userId + '"]');
    const cancelButton = document.querySelector('[data-action="cancel"][data-user-id="' + userId + '"]');
    if (editButton) editButton.classList.remove('hidden');
    if (saveButton) { saveButton.classList.add('hidden'); saveButton.classList.remove('active'); saveButton.setAttribute('disabled', 'disabled'); }
    if (cancelButton) cancelButton.classList.add('hidden');
}

function saveInlineEdit(userId) {
    const nameInput = document.getElementById('user-name-input-' + userId);
    const emailInput = document.getElementById('user-email-input-' + userId);
    if (!nameInput || !emailInput) return;
    const newName = nameInput.value.trim();
    if (newName.length === 0) { alert('Name darf nicht leer sein.'); return; }
    const newEmail = emailInput.value.trim();
    const formData = new FormData();
    formData.append('action', 'edit_user');
    formData.append('user_id', userId);
    formData.append('name', newName);
    if (newEmail !== '') formData.append('email', newEmail);

    fetch('api.php', { method: 'POST', body: formData })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // update inputs (server may have sanitized values)
                if (data.user && typeof data.user.name !== 'undefined') {
                    nameInput.value = data.user.name;
                } else {
                    nameInput.value = newName;
                }
                if (data.user && typeof data.user.email !== 'undefined') {
                    emailInput.value = data.user.email;
                } else {
                    emailInput.value = newEmail;
                }
                // disable inputs and toggle buttons back
                nameInput.setAttribute('disabled', 'disabled');
                emailInput.setAttribute('disabled', 'disabled');
                const editButton = document.querySelector('[data-action="edit"][data-user-id="' + userId + '"]');
                const saveButton = document.querySelector('[data-action="save"][data-user-id="' + userId + '"]');
                const cancelButton = document.querySelector('[data-action="cancel"][data-user-id="' + userId + '"]');
                if (editButton) editButton.classList.remove('hidden');
                if (saveButton) { saveButton.classList.add('hidden'); saveButton.classList.remove('active'); saveButton.setAttribute('disabled', 'disabled'); }
                if (cancelButton) cancelButton.classList.add('hidden');
            } else {
                alert('Fehler: ' + (data.message || 'Beim Speichern des Benutzers'));
            }
        })
        .catch(err => {
            console.error(err);
            alert('Fehler beim Speichern des Benutzers');
        });
}

function regenerateToken(userId) {
    if (!confirm('Token wirklich neu generieren? Alte Links funktionieren danach nicht mehr.')) return;
    const fd = new FormData();
    fd.append('action', 'regenerate_token');
    fd.append('user_id', userId);
    fetch('api.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(d => {
            if (d.success) {
                const linkElem = document.getElementById('user-link-' + userId);
                if (linkElem && d.link) {
                    if (linkElem.tagName === 'INPUT') {
                        linkElem.value = d.link;
                        try { linkElem.classList.add('disabled'); } catch (e) {}
                        try { linkElem.setAttribute('disabled', 'disabled'); } catch (e) {}
                    } else {
                        linkElem.textContent = d.link;
                    }
                }
                // update data-link on action buttons in the same row
                if (linkElem) {
                    const row = linkElem.closest('.form_row');
                    if (row) {
                        row.querySelectorAll('.link-actions .btn').forEach(b => { b.dataset.link = d.link; });
                    }
                }
            } else {
                alert('Fehler: ' + (d.message || 'Beim Neugenerieren des Tokens'));
            }
        })
        .catch(e => { console.error(e); alert('Fehler beim Neugenerieren des Tokens'); });
}
