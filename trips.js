// DriveJournal - Trips & Paging (zusammengefasst)

const ITEMS_PER_PAGE = 10;

// Tab-Switching für Auto-Listen
window.switchCarTab = function(carId) {
    // Deaktiviere alle Tabs
    document.querySelectorAll('.car-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Verstecke alle Tab-Inhalte
    document.querySelectorAll('.car-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Aktiviere gewählten Tab
    const selectedTab = document.querySelector(`.car-tab[data-car-id="${carId}"]`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Zeige gewählten Tab-Inhalt
    const selectedContent = document.getElementById(`car-tab-${carId}`);
    if (selectedContent) {
        selectedContent.classList.add('active');
    }
};

// Utility-Funktionen
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function formatNumber(num) {
    if (num === null || num === undefined) return '-';
    return new Intl.NumberFormat('de-DE').format(num);
}

// Paging-Klasse
class TripsPager {
    constructor(trips, bodyId, paginationId, renderRowFn) {
        this.trips = trips;
        this.bodyElement = document.getElementById(bodyId);
        this.paginationElement = document.getElementById(paginationId);
        this.renderRowFn = renderRowFn;
        this.currentPage = 1;
        this.totalPages = Math.ceil(trips.length / ITEMS_PER_PAGE);
        
        this.render();
    }
    
    render() {
        this.renderTable();
        this.renderPagination();
    }
    
    renderTable() {
        if (!this.bodyElement) return;
        
        const start = (this.currentPage - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const pageTrips = this.trips.slice(start, end);
        
        this.bodyElement.innerHTML = '';
        
        pageTrips.forEach(trip => {
            const row = document.createElement('tr');
            
            // Markiere Lücken-Zeilen
            if (trip.is_gap) {
                row.classList.add('trip-gap');
            }
            // Markiere initiale Einträge (grau dargestellt)
            if (trip.is_initial) {
                row.classList.add('trip-initial');
            }
            
            row.innerHTML = this.renderRowFn(trip);
            this.bodyElement.appendChild(row);
        });
    }
    
    renderPagination() {
        if (!this.paginationElement) return;
        
        // Wenn nur eine Seite, verstecke Pagination
        if (this.totalPages <= 1) {
            this.paginationElement.classList.add('hidden');
            return;
        }

        this.paginationElement.classList.remove('hidden');
        this.paginationElement.innerHTML = '';
        
        // Zurück-Button
        if (this.currentPage > 1) {
                const backBtn = document.createElement('button');
                backBtn.className = 'btn btn--primary btn--small';
            backBtn.textContent = '← Zurück';
            backBtn.onclick = () => this.goToPage(this.currentPage - 1);
            this.paginationElement.appendChild(backBtn);
        }
        
        // Seiteninformation
        const info = document.createElement('span');
        info.className = 'page-info';
        info.textContent = `Seite ${this.currentPage} von ${this.totalPages}`;
        this.paginationElement.appendChild(info);
        
        // Weiter-Button
        if (this.currentPage < this.totalPages) {
            const nextBtn = document.createElement('button');
            nextBtn.className = 'btn btn--primary btn--small';
            nextBtn.textContent = 'Weiter →';
            nextBtn.onclick = () => this.goToPage(this.currentPage + 1);
            this.paginationElement.appendChild(nextBtn);
        }
    }
    
    goToPage(page) {
        this.currentPage = page;
        this.render();
    }
}

// Render-Funktionen für verschiedene Tabellentypen
function renderUserTripRow(trip) {
    const carName = carMap[trip.car_id] || '?';
    const distance = trip.distance !== undefined ? formatNumber(trip.distance) : '-';
    let carDisplay = carName;
    if (trip.is_initial) {
        carDisplay = `${carName} <span class="initial-badge">Initialstand</span>`;
    }

    return `
        <td class="trip-date">
            <strong>${formatDate(trip.timestamp)}</strong> ${formatTime(trip.timestamp)}
        </td>
        <td>${carDisplay}</td>
        <td class="trip-distance">${distance}</td>
        <td class="trip-km-stand">${formatNumber(trip.km)}</td>
    `;
}

function renderCarTripRow(trip) {
    // Prüfe ob es eine Lücke ist
    if (trip.is_gap) {
        const kmEnd = formatNumber(trip.km);
        const distance = trip.distance !== undefined ? formatNumber(trip.distance) : '-';
        const kmStart = trip.km_start !== undefined ? formatNumber(trip.km_start) : '';

        return `
            <td class="trip-date">
                <strong>${formatDate(trip.timestamp)}</strong> ${formatTime(trip.timestamp)}
            </td>
            <td class="trip-gap-label">
                <button type="button" class="btn btn--critical btn--small btn-gap-correction" data-car-id="${trip.car_id}" data-km="${trip.km}" data-km-start="${trip.km_start || ''}">nicht erfasst</button>
            </td>
            <td class="trip-distance">${distance}</td>
            <td class="trip-km-stand">${kmEnd}</td>
        `;
    }
    
    // Normale Fahrt
    const distance = trip.distance !== undefined ? formatNumber(trip.distance) : '-';
    let userName = userMap[trip.user_id] || '?';
    if (trip.is_initial) {
        userName = '<span class="initial-badge">Initialstand</span>';
    }

    return `
        <td class="trip-date">
            <strong>${formatDate(trip.timestamp)}</strong> ${formatTime(trip.timestamp)}
        </td>
        <td>${userName}</td>
        <td class="trip-distance">${distance}</td>
        <td class="trip-km-stand">${formatNumber(trip.km)}</td>
    `;
}

// Initialisierung beim Laden der Seite
document.addEventListener('DOMContentLoaded', function() {
    // Benutzer-Fahrten Paging
    if (typeof userTripsData !== 'undefined' && userTripsData.length > 0) {
        new TripsPager(
            userTripsData,
            'user-trips-body',
            'user-trips-pagination',
            renderUserTripRow
        );
    }
    
    // Auto-Fahrten Paging
    if (typeof carTripsData !== 'undefined') {
        carTripsData.forEach(carData => {
            if (carData.trips.length > 0) {
                new TripsPager(
                    carData.trips,
                    `car-trips-body-${carData.carId}`,
                    `car-trips-pagination-${carData.carId}`,
                    renderCarTripRow
                );
            }
        });
    }

    // Delegation: Handle gap correction button clicks
    document.addEventListener('click', function(e) {
        const btn = e.target.closest && e.target.closest('.btn-gap-correction');
        if (!btn) return;
        const tr = btn.closest('tr');
        if (!tr) return;

        // If already has a correction row below, remove it
        const next = tr.nextElementSibling;
        if (next && next.classList.contains('gap-correction-row')) {
            next.remove();
            return;
        }

        // Determine upper and lower bounds by searching nearest sibling rows
        function parseKmFromTd(row) {
            if (!row) return null;
            const el = row.querySelector('.trip-km-stand');
            if (!el) return null;
            const txt = el.textContent || '';
            const digits = txt.replace(/[^0-9]/g, '');
            return digits ? parseInt(digits, 10) : null;
        }

        function findNeighborKm(startRow, direction) {
            // direction: -1 = up (previous), +1 = down (next)
            let cur = startRow;
            while (cur) {
                cur = direction === -1 ? cur.previousElementSibling : cur.nextElementSibling;
                if (!cur) break;
                // skip rows that are correction rows or other structural rows
                if (cur.classList && cur.classList.contains('gap-correction-row')) continue;
                const v = parseKmFromTd(cur);
                if (v !== null) return v;
            }
            return null;
        }

        const upperBound = findNeighborKm(tr, -1); // nearest KM above (should be larger)
        const lowerBound = findNeighborKm(tr, +1); // nearest KM below (should be smaller)

        // Prefill values: if button has data attributes, use them as sensible defaults
        const dataKm = btn.getAttribute('data-km');
        const dataKmStart = btn.getAttribute('data-km-start');
        const preEnd = dataKm ? parseInt(String(dataKm).replace(/[^0-9]/g,''),10) : (upperBound !== null ? upperBound : '');
        const preStart = dataKmStart ? parseInt(String(dataKmStart).replace(/[^0-9]/g,''),10) : (lowerBound !== null ? lowerBound : '');

        // Create correction row
        const correctionRow = document.createElement('tr');
        correctionRow.classList.add('gap-correction-row');
        const cell = document.createElement('td');
        cell.colSpan = 4;
        // Optional user select for admin pages
        let userSelectHtml = '';
        try {
            if (typeof isAdmin !== 'undefined' && isAdmin) {
                const entries = Object.entries(userMap || {});
                const options = entries.map(e => `<option value="${e[0]}">${e[1]}</option>`).join('');
                userSelectHtml = `<label>Benutzer <select class="corr-user">${options}</select></label>`;
            }
        } catch (e) {}

        cell.innerHTML = `
            <div class="gap-correction-box">
                <div class="corr-row">
                    <label>Start KM <input type="number" class="corr-start" value="${preStart !== '' ? preStart : ''}" inputmode="numeric"></label>
                    <label>Ende KM <input type="number" class="corr-end" value="${preEnd !== '' ? preEnd : ''}" inputmode="numeric"></label>
                    ${userSelectHtml}
                    <button type="button" class="btn btn--critical btn--small btn-gap-capture">Fahrt erfassen</button>
                </div>
                <div class="corr-msg"></div>
                <div class="debug-bounds"></div>
            </div>
        `;
        correctionRow.appendChild(cell);
        tr.parentNode.insertBefore(correctionRow, tr.nextSibling);

        // Handler for capture button
        const captureBtn = correctionRow.querySelector('.btn-gap-capture');
        const inputEnd = correctionRow.querySelector('.corr-end');
        const inputStart = correctionRow.querySelector('.corr-start');
        const msgEl = correctionRow.querySelector('.corr-msg');
        const debugEl = correctionRow.querySelector('.debug-bounds');

        // Set numeric input min/max based on prefilled displayed values.
        // Use the displayed Start/End KM as allowed min/max.
        try {
            const preStartNum = (preStart !== '' && preStart !== null) ? Number(preStart) : null;
            const preEndNum = (preEnd !== '' && preEnd !== null) ? Number(preEnd) : null;
            if (preStartNum !== null && !Number.isNaN(preStartNum)) {
                inputStart.setAttribute('min', String(preStartNum));
                inputEnd.setAttribute('min', String(preStartNum));
            }
            if (preEndNum !== null && !Number.isNaN(preEndNum)) {
                inputStart.setAttribute('max', String(preEndNum));
                inputEnd.setAttribute('max', String(preEndNum));
            }
        } catch (e) {}

        // Robust parsing: strip non-digit characters (thousand separators, etc.)
        function parseKmInput(val) {
            if (val === null || val === undefined) return null;
            const s = String(val).trim();
            if (s === '') return null;
            const digits = s.replace(/[^0-9\-\.]/g, '');
            if (digits === '') return null;
            const n = parseFloat(digits);
            return Number.isFinite(n) ? n : null;
        }




        captureBtn.addEventListener('click', function() {
            msgEl.textContent = '';

            // Robust parsing: strip non-digit characters (thousand separators, etc.)
            function parseKmInput(val) {
                if (val === null || val === undefined) return null;
                const s = String(val).trim();
                if (s === '') return null;
                const digits = s.replace(/[^0-9\-\.]/g, '');
                if (digits === '') return null;
                const n = parseFloat(digits);
                return Number.isFinite(n) ? n : null;
            }

            const endKm = parseKmInput(inputEnd.value);
            const startKm = parseKmInput(inputStart.value);

            // Validation order: required -> numeric -> start < end -> bounds
            if (startKm === null || endKm === null) {
                msgEl.textContent = 'Bitte Start- und Ende-KM ausfüllen.';
                return;
            }
            if (startKm >= endKm) {
                msgEl.textContent = 'Start KM muss kleiner als Ende KM sein.';
                return;
            }

            // Enforce min/max attributes on the inputs if present
            const sMin = inputStart.getAttribute('min');
            const sMax = inputStart.getAttribute('max');
            const eMin = inputEnd.getAttribute('min');
            const eMax = inputEnd.getAttribute('max');

            if (sMin !== null) {
                const v = Number(sMin);
                if (Number.isFinite(v) && startKm < v) {
                    msgEl.textContent = `Start KM muss mindestens ${v} sein.`;
                    return;
                }
            }
            if (sMax !== null) {
                const v = Number(sMax);
                if (Number.isFinite(v) && startKm > v) {
                    msgEl.textContent = `Start KM darf maximal ${v} sein.`;
                    return;
                }
            }
            if (eMin !== null) {
                const v = Number(eMin);
                if (Number.isFinite(v) && endKm < v) {
                    msgEl.textContent = `Ende KM muss mindestens ${v} sein.`;
                    return;
                }
            }
            if (eMax !== null) {
                const v = Number(eMax);
                if (Number.isFinite(v) && endKm > v) {
                    msgEl.textContent = `Ende KM darf maximal ${v} sein.`;
                    return;
                }
            }

            // Send to API: create an 'end' trip with provided start_km and km
            const carId = btn.getAttribute('data-car-id');

            const fd = new FormData();
            fd.append('action', 'save_trip');
            // if admin selected a user via the corr-user select, use that, otherwise fallback to global userId
            const corrUserEl = correctionRow.querySelector('.corr-user');
            const userToSend = (corrUserEl && corrUserEl.value) ? corrUserEl.value : userId;
            fd.append('user_id', userToSend);
            fd.append('car_id', carId);
            fd.append('km', endKm);
            fd.append('start_km', startKm);
            fd.append('is_gap', '1');
            fd.append('type', 'end');
            // include last_trip_id for optimistic check if available in carsData
            try {
                const cid = parseInt(carId, 10);
                if (typeof carsData !== 'undefined' && Array.isArray(carsData)) {
                    const c = carsData.find(x => x.id == cid);
                    if (c && (c.last_trip_id !== undefined && c.last_trip_id !== null)) {
                        fd.append('last_trip_id', c.last_trip_id);
                    }
                }
            } catch (e) {}

            const boxEl = correctionRow.querySelector('.gap-correction-box');
            captureBtn.disabled = true;
            if (boxEl) boxEl.classList.add('disabled');

            fetch('api.php', { method: 'POST', body: fd })
                .then(r => r.json())
                .then(resp => {
                    if (resp && resp.success) {
                        // Erfolg: zeige Erfolgsmeldung direkt in der Korrektur-Box (grün)
                        msgEl.classList.remove('msg-warning');
                        msgEl.classList.add('msg-success');
                        msgEl.textContent = 'Daten erfolgreich gespeichert. Letzte Fahrt ' + new Intl.NumberFormat('de-DE').format(endKm) + ' KM.';
                        // Reload nach 2s
                        setTimeout(() => window.location.reload(), 2000);
                    } else {
                        // Keep capture button disabled on error (do not re-enable or remove disabled styling)
                        captureBtn.textContent = 'Fahrt erfassen';
                        const m = (resp && resp.message) ? resp.message : 'Fehler beim Speichern';
                        msgEl.classList.remove('msg-success');
                        msgEl.classList.add('msg-warning');
                        msgEl.textContent = m;
                        // If parallel-write conflict, reload after 5s so user can read message
                        if (m.toLowerCase().includes('parallelen zugriff')) {
                            setTimeout(() => window.location.reload(), 5000);
                        }
                    }
                }).catch(err => {
                    // Keep capture button disabled on network error
                    captureBtn.textContent = 'Fahrt erfassen';
                    msgEl.classList.remove('msg-success');
                    msgEl.classList.add('msg-warning');
                    msgEl.textContent = 'Netzwerkfehler';
                });
        });
    });
});
