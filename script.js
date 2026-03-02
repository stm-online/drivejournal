// DriveJournal - User Script
let selectedCar = null;
let selectedCarElement = null;
let pendingEndKm = null;
let pendingDistance = null;
let pendingStartKm = null;
let pendingActionType = null;
let pendingActionKm = null;
let selectedCarWasAuto = true; // true = last selection was automatic, false = user clicked
let pendingStartWasCorrection = false;
const statusMessageTimeouts = {};

function getStatusElement(targetId = 'status-message') {
    const target = document.getElementById(targetId);
    if (target) return target;
    return document.getElementById('status-message');
}

function focusStatusMessage(statusEl) {
    if (!statusEl) return;
    statusEl.setAttribute('tabindex', '-1');
    statusEl.focus({ preventScroll: true });
    statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearStatusMessage(targetId = 'status-message') {
    const statusEl = getStatusElement(targetId);
    if (!statusEl) return;
    const timeoutKey = statusEl.id;
    if (statusMessageTimeouts[timeoutKey]) {
        clearTimeout(statusMessageTimeouts[timeoutKey]);
        statusMessageTimeouts[timeoutKey] = null;
    }
    statusEl.className = 'status-message';
    statusEl.textContent = '';
}

// Zentrale Logik: Validiert eingegebenen KM-Stand gegen das selektierte Auto,
// berechnet Distanz/start_km und zeigt bzw. versteckt die Bestätigungsbox.
function evaluateSelection(actionType = 'end') {
    clearStatusMessage('status-message');
    const kmInput = document.getElementById('km-input');
    if (!kmInput) return;
    const enteredKm = parseFloat(kmInput.value);
    if (!enteredKm || enteredKm <= 0) {
        showStatus('Bitte gültigen Kilometerstand eingeben!', 'validation', 0);
            hideDialogKeepError();
        return;
    }

    // Wenn kein Auto ausgewählt oder Auswahl automatisch erfolgen soll, auto-select
    if (!selectedCar || selectedCarWasAuto) {
        const auto = findNearestCar(enteredKm);
        if (auto) {
            selectedCar = auto;
            document.querySelectorAll('.car-item').forEach(item => item.classList.remove('selected'));
            document.querySelectorAll('.car-item').forEach(item => {
                if (parseInt(item.dataset.carId) === selectedCar.id) {
                    item.classList.add('selected');
                    selectedCarElement = item;
                }
            });
            selectedCarWasAuto = true;
        } else {
            showStatus('Kein passendes Auto gefunden!', 'validation', 0);
                hideDialogKeepError();
            return;
        }
    }

    const carObj = (typeof carsData !== 'undefined') ? carsData.find(c => c.id === selectedCar.id) : null;

    const carKm = Number(selectedCar.currentKm);

    if (Number.isFinite(carKm) && enteredKm <= carKm) {
        showStatus('Eingegebener KM-Stand ist kleiner als aktueller KM-Stand des Autos (' + new Intl.NumberFormat('de-DE').format(carKm) + ' km).', 'validation', 0);
        // Verhindere Anzeige des Bestätigungsdialogs bei Validierungsfehlern
        hideDialogKeepError();
        return;
    }

    pendingActionType = actionType;
    pendingActionKm = enteredKm;

    if (actionType === 'start') {
        pendingEndKm = enteredKm;
        pendingDistance = null;
        pendingStartKm = null;
        pendingStartWasCorrection = false;
        showConfirmationDialog('start', selectedCar.name, enteredKm);
        return;
    }

    const openStartKm = (carObj && carObj.open_start_km !== undefined && carObj.open_start_km !== null) ? Number(carObj.open_start_km) : null;
    if (Number.isFinite(openStartKm) && enteredKm < openStartKm) {
        showStatus('Eingegebener KM-Stand ist kleiner als Start KM der offenen Fahrt  (' + new Intl.NumberFormat('de-DE').format(openStartKm) + ' km).', 'validation', 0);
        hideDialogKeepError();
        return;
    }

    // Ermittle passenden letzten Eintrag (open_start oder letzter end)
    let lastKm = selectedCar.currentKm;
    let lastEntry = null;

    if (carObj && (carObj.open_start_km !== undefined && carObj.open_start_km !== null)) {
        const openStart = Number(carObj.open_start_km);
        if (Number.isFinite(openStart) && enteredKm >= openStart) {
            lastEntry = { open_start_km: openStart };
            lastKm = openStart;
        } else {
            const found = typeof findLastRecordedForCar === 'function' ? findLastRecordedForCar(selectedCar.id, enteredKm) : null;
            if (found && typeof found.km === 'number') lastKm = found.km;
            lastEntry = found;
        }
    } else {
        const found = typeof findLastRecordedForCar === 'function' ? findLastRecordedForCar(selectedCar.id, enteredKm) : null;
        if (found && typeof found.km === 'number') lastKm = found.km;
        lastEntry = found;
    }

    const distance = enteredKm - lastKm;

    // Setze Pending-Werte und zeige Dialog
    pendingEndKm = enteredKm;
    pendingDistance = distance;
    pendingStartKm = lastKm;
    showConfirmationDialog('end', selectedCar.name, distance, lastEntry);
}

// Auto-Auswahl
document.querySelectorAll('.car-item').forEach(item => {
    item.addEventListener('click', function() {
        // Entferne vorherige Auswahl
        document.querySelectorAll('.car-item').forEach(el => el.classList.remove('selected'));

        // Setze neue Auswahl (manuell durch Nutzer)
        this.classList.add('selected');
        selectedCar = {
            id: parseInt(this.dataset.carId),
            name: this.dataset.carName,
            currentKm: parseFloat(this.dataset.currentKm),
            last_trip_id: this.dataset.lastTripId ? parseInt(this.dataset.lastTripId) : null
        };
        selectedCarElement = this;
        selectedCarWasAuto = false; // Nutzer hat manuell gewählt
        if (pendingActionType === 'start' || pendingActionType === 'end') {
            evaluateSelection(pendingActionType);
        } else {
            evaluateSelection('end');
        }
    });
});

// Start-Button
document.getElementById('btn-start')?.addEventListener('click', function() {
    pendingActionType = 'start';
    evaluateSelection('start');
});

// Note: Bewertung erfolgt nur beim Klick auf 'Ende' oder bei manueller Auto-Auswahl

// Ende-Button
document.getElementById('btn-end')?.addEventListener('click', function() {
    pendingActionType = 'end';
    evaluateSelection('end');
});

// Hinweis: automatische Vorauswahl beim Tippen wurde entfernt.
// Auto-Auswahl erfolgt jetzt nur beim Klick auf "Start" oder "Ende" oder durch Nutzerklick.

// Finde nächstes Auto basierend auf KM (clientseitig)
function findNearestCar(km) {
    if (!carsData || carsData.length === 0) return null;
    
    let nearestCar = null;
    let minDiff = Infinity;
    
    carsData.forEach(car => {
        // Berücksichtige alle Autos und nutze die minimale absolute Differenz
        const diff = Math.abs(km - car.current_km);
        if (diff < minDiff) {
            minDiff = diff;
            nearestCar = {
                id: car.id,
                name: car.name,
                currentKm: car.current_km,
                last_trip_id: car.last_trip_id !== undefined ? car.last_trip_id : null
            };
        }
    });
    
    return nearestCar;
}

// Finde den letzten (größten) bereits eingegebenen KM-Stand für ein Fahrzeug, der kleiner als eingegebener KM ist.
function findLastRecordedForCar(carId, enteredKm) {
    if (!carTripsData || carTripsData.length === 0) return null;
    const car = carTripsData.find(c => c.carId === carId);
    if (!car || !car.trips || car.trips.length === 0) return null;

    let best = null;
    let bestKm = -Infinity;
    car.trips.forEach(t => {
        if (t.type === 'end' && typeof t.km === 'number') {
            if (t.km <= enteredKm && t.km > bestKm) {
                bestKm = t.km;
                best = t;
            }
        }
    });

    // Falls kein kleinerer Eintrag gefunden wurde, verwende die zuletzt eingetragene Ende-Fahrt (neuester)
    if (!best) {
        let latest = null;
        let latestTime = 0;
        car.trips.forEach(t => {
            if (t.type === 'end' && typeof t.km === 'number') {
                const ts = t.timestamp ? Date.parse(t.timestamp) : 0;
                if (ts > latestTime) {
                    latestTime = ts;
                    latest = t;
                }
            }
        });
        if (latest) return latest;
    }

    return best;
}

// Zeige Bestätigungs-Dialog
function showConfirmationDialog(actionType, carName, value) {
    const dialog = document.getElementById('confirmation-dialog');
    const titleEl = document.getElementById('confirm-title');
    const carNameEl = document.getElementById('confirm-car-name');
    const distanceLabelEl = document.getElementById('confirm-distance-label');
    const distanceEl = document.getElementById('confirm-distance');
    const correctionInput = document.getElementById('correction-km');
    const correctionBox = dialog ? dialog.querySelector('.confirmation-correction') : null;
    const lastEntryEl = document.getElementById('confirm-last-entry');

    carNameEl.textContent = carName;
    if (actionType === 'start') {
        if (titleEl) titleEl.textContent = 'Start bestätigen';
        if (distanceLabelEl) distanceLabelEl.textContent = 'KM-Stand:';
        distanceEl.textContent = new Intl.NumberFormat('de-DE').format(value) + ' km';
        if (correctionBox) correctionBox.style.display = 'none';
    } else {
        if (titleEl) titleEl.textContent = 'Fahrt bestätigen';
        if (distanceLabelEl) distanceLabelEl.textContent = 'Gefahrene KM:';
        distanceEl.textContent = new Intl.NumberFormat('de-DE').format(value) + ' km';
        if (correctionBox) correctionBox.style.display = '';
    }

    if (correctionInput) correctionInput.value = '';
    pendingStartWasCorrection = false;

    // Wenn ein letzter Eintrag übergeben wurde, zeige Datum, Fahrer und KM-Stand
    if (actionType === 'end' && arguments.length >= 4 && arguments[3]) {
        const last = arguments[3];
        if (last && last.open_start_km !== undefined) {
            lastEntryEl.innerHTML = `<span class="car-km">Offene Fahrt: ${new Intl.NumberFormat('de-DE').format(last.open_start_km)} km</span>`;
        } else {
            const driver = last.user_id && userMap[last.user_id] ? userMap[last.user_id] : 'Unbekannt';
            const date = last.timestamp ? new Date(last.timestamp) : null;
            const dateStr = date ? date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
            const kmVal = (typeof last.km === 'number') ? last.km : '';
            lastEntryEl.innerHTML = `<span class="car-km">Letzter Eintrag: ${dateStr} — ${driver}` + (kmVal ? ` — ${new Intl.NumberFormat('de-DE').format(kmVal)} km` : '') + `</span>`;
        }
    } else {
        lastEntryEl.textContent = '';
        lastEntryEl.className = '';
    }

    dialog.classList.add('active');
    // Make visible (CSS also governed by .active)
    try { dialog.classList.remove('hidden'); } catch (e) {}

    // Scrolle sanft zum Bestätigungsbereich
    setTimeout(() => {
        dialog.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);

    clearStatusMessage('status-message-dialog');

    // Hinweis: Fehler bewusst nicht automatisch löschen, damit Validierungswarnungen sichtbar bleiben
}

// Verstecke Bestätigungs-Dialog
function hideConfirmationDialog() {
    const dialog = document.getElementById('confirmation-dialog');
    dialog.classList.remove('active');
    try { dialog.classList.add('hidden'); } catch (e) {}
    pendingEndKm = null;
    pendingDistance = null;
    pendingStartKm = null;
    pendingActionKm = null;
    pendingActionType = null;

    // Statusmeldungen beim Schließen löschen
    clearStatusMessage('status-message');
    clearStatusMessage('status-message-dialog');
}

// Verstecke Dialog ohne Fehlerbereich zu löschen (z.B. bei Validierung, damit Fehler angezeigt bleibt)
function hideDialogKeepError() {
    const dialog = document.getElementById('confirmation-dialog');
    if (!dialog) return;
    dialog.classList.remove('active');
    try { dialog.classList.add('hidden'); } catch (e) {}
    pendingEndKm = null;
    pendingDistance = null;
    pendingStartKm = null;
    pendingActionKm = null;
}

// Hilfsfunktionen: Confirm-Buttons deaktivieren/aktivieren (nur Buttons, nicht die Box)
function disableConfirmButtons() {
    const ok = document.getElementById('btn-confirm-ok');
    const corr = document.getElementById('btn-confirm-correction');
    const cancel = document.getElementById('btn-confirm-cancel');
    if (ok) ok.disabled = true;
    if (corr) corr.disabled = true;
    if (cancel) cancel.disabled = true;
}

function enableConfirmButtons() {
    const ok = document.getElementById('btn-confirm-ok');
    const corr = document.getElementById('btn-confirm-correction');
    const cancel = document.getElementById('btn-confirm-cancel');
    if (ok) ok.disabled = false;
    if (corr) corr.disabled = false;
    if (cancel) cancel.disabled = false;
}

// OK Button
document.getElementById('btn-confirm-ok')?.addEventListener('click', function() {
    if (pendingActionType === 'start') {
        if (pendingActionKm === null) return;
        disableConfirmButtons();
        saveTrip(pendingActionKm, 'start', null, 'status-message-dialog');
        return;
    }

    if (pendingEndKm === null || pendingStartKm === null) return;

    // Werte in lokale Variablen kopieren
    const endKm = pendingEndKm;
    const startKm = pendingStartKm;

    // Buttons deaktivieren (nur Buttons, Box bleibt sichtbar)
    disableConfirmButtons();

    // Nur start_km mitschicken, wenn der Nutzer eine Korrektur bestätigt hat
    if (pendingStartWasCorrection) {
        saveTrip(endKm, 'end', startKm, 'status-message-dialog');
    } else {
        saveTrip(endKm, 'end', null, 'status-message-dialog');
    }
});

// Korrektur Button
document.getElementById('btn-confirm-correction')?.addEventListener('click', function() {
    const correctedDistance = parseFloat(document.getElementById('correction-km').value);

    if (!correctedDistance || correctedDistance <= 0) {
        showStatus('Bitte gültige gefahrene KM eingeben!', 'validation', 0, 'status-message-dialog');
        return;
    }

    // Berechne neuen Start-KM
    const newStartKm = pendingEndKm - correctedDistance;

    // Validierung: gefahrene KM dürfen nicht größer sein als Differenz zwischen Eingabe und aktuellem Stand
    if (selectedCar && typeof selectedCar.currentKm === 'number') {
        const maxAllowed = pendingEndKm - selectedCar.currentKm;
        if (correctedDistance > maxAllowed) {
            showStatus('Gefahrene KM dürfen nicht größer sein als ' + new Intl.NumberFormat('de-DE').format(maxAllowed) + ' km', 'validation', 0, 'status-message-dialog');
            return;
        }
        // Zusätzlich: Start-KM darf nicht kleiner sein als aktueller Stand (Sicherheit)
        if (newStartKm < selectedCar.currentKm) {
            showStatus('Start-KM kann nicht kleiner als aktueller Stand sein!', 'validation', 0, 'status-message-dialog');
            return;
        }
    }

    // Werte in lokale Variablen kopieren bevor Dialog geschlossen wird
    const endKm = pendingEndKm;

    // Buttons deaktivieren (nur Buttons, Box bleibt sichtbar)
    disableConfirmButtons();
    // Markiere, dass der Nutzer eine Korrektur gesetzt hat
    pendingStartWasCorrection = true;
    saveTrip(endKm, 'end', newStartKm, 'status-message-dialog');
});

// Abbrechen Button
document.getElementById('btn-confirm-cancel')?.addEventListener('click', function() {
    document.getElementById('km-input').value = '';
    document.getElementById('correction-km').value = '';
    location.reload();
});

// Fahrt speichern
function saveTrip(km, type, startKm = null, statusTargetId = 'status-message') {
    const formData = new FormData();
    formData.append('action', 'save_trip');
    // Wenn Admin-Dropdown vorhanden ist, nutze dessen Wert, sonst die globale userId
    let userToSend = null;
    const adminSelect = document.getElementById('admin-user-select');
    if (adminSelect) {
        userToSend = adminSelect.value;
    } else if (typeof userId !== 'undefined' && userId !== null) {
        userToSend = userId;
    }
    formData.append('user_id', userToSend);
    formData.append('car_id', selectedCar.id);
    formData.append('km', km);
    formData.append('type', type);
    
    // Bei Ende-Fahrten: start_km mitsenden (falls vorhanden)
    if (type === 'end' && startKm !== null) {
        formData.append('start_km', startKm);
    }
    // Inform the server whether the user manually selected the car
    if (type === 'end') {
        formData.append('user_selected', selectedCarWasAuto ? '0' : '1');
        // Include last_trip_id for optimistic check (may be null)
        if (selectedCar && selectedCar.last_trip_id !== undefined && selectedCar.last_trip_id !== null) {
            formData.append('last_trip_id', selectedCar.last_trip_id);
        }
    }
    
    fetch('api.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.text())
    .then(txt => {
        let data = null;
        try {
            data = JSON.parse(txt);
        } catch (err) {
            // Non-JSON response -> critical error
            showStatus('Kritischer Fehler: Unerwartete Server-Antwort', 'error', 0, statusTargetId);
            console.error('Non-JSON response:', txt);
            return;
        }

        if (data && data.success) {
            // Erfolg: entferne Fehleranzeige und zeige ausführliche Statusmeldung
            const carName = (selectedCar && selectedCar.name) ? selectedCar.name : '';
            if (type === 'start') {
                showStatus('Start erfolgreich gespeichert.<br>' + carName + ' - KM-Stand: ' + new Intl.NumberFormat('de-DE').format(km) + ' km', 'success', 0, statusTargetId);
            } else {
                const driven = (startKm !== null && !isNaN(startKm)) ? (Number(km) - Number(startKm)) : (pendingDistance || 0);
                showStatus('Daten erfolgreich gespeichert. Letzte Fahrt:<br>' + carName + ' - ' + new Intl.NumberFormat('de-DE').format(driven) + ' KM - KM-Stand: ' + new Intl.NumberFormat('de-DE').format(km) + ' km', 'success', 0, statusTargetId);
            }

            // Nach 2 Sekunden neu laden, damit Meldung kurz sichtbar bleibt
            setTimeout(() => {
                location.reload();
            }, 2000);
        } else {
            const errMsg = (data && data.message) ? data.message : 'Unbekannter Fehler';
            showStatus('Fehler beim Speichern<br>' + errMsg, 'error', 0, statusTargetId);
            console.error('API error:', data);
            return;
        }
    })
    .catch(error => {
        // Catch-all -> critical error
        showStatus('Kritsicher Fehler: Unerwartete Server-Antwort', 'error', 0, statusTargetId);
        console.error('SaveTrip error:', error);
    });
}

// Status-Nachricht anzeigen
function showStatus(message, type, autoHideMs = 5000, targetId = 'status-message') {
    const statusEl = getStatusElement(targetId);
    if (!statusEl) return;

    const timeoutKey = statusEl.id;
    if (statusMessageTimeouts[timeoutKey]) {
        clearTimeout(statusMessageTimeouts[timeoutKey]);
        statusMessageTimeouts[timeoutKey] = null;
    }

    statusEl.innerHTML = message;
    statusEl.className = 'status-message ' + type;
    focusStatusMessage(statusEl);
    
    if (autoHideMs > 0) {
        statusMessageTimeouts[timeoutKey] = setTimeout(() => {
            clearStatusMessage(timeoutKey);
        }, autoHideMs);
    }
}

// Fokus auf KM-Eingabe beim Laden
window.addEventListener('load', () => {
    document.getElementById('km-input')?.focus();
});
