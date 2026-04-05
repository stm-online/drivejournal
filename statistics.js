// Statistics: compute KM and cost summaries and render the KM/Kosten box
(function(){
    const monthsDE = ['','Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

    function parseTs(s){ return s ? new Date(s.replace(' ', 'T')) : null; }

    function getPeriodBounds(type){
        const now = new Date();
        if (type === 'week'){
            const d = new Date(now);
            const diff = (d.getDay()+6)%7;
            d.setDate(d.getDate()-diff);
            d.setHours(0,0,0,0);
            return {start:d, end: now};
        }
        if (type === 'month'){
            const start = new Date(now.getFullYear(), now.getMonth(), 1); start.setHours(0,0,0,0);
            const end = new Date(now.getFullYear(), now.getMonth()+1, 0); end.setHours(23,59,59,999);
            return {start, end};
        }
        if (type === 'year'){
            const start = new Date(now.getFullYear(), 0, 1); start.setHours(0,0,0,0);
            const end = now;
            return {start, end};
        }
        if (type === 'prev1'){
            const start = new Date(now.getFullYear(), now.getMonth()-1, 1); start.setHours(0,0,0,0);
            const end = new Date(now.getFullYear(), now.getMonth(), 0); end.setHours(23,59,59,999);
            return {start, end};
        }
        if (type === 'prev2'){
            const start = new Date(now.getFullYear(), now.getMonth()-2, 1); start.setHours(0,0,0,0);
            const end = new Date(now.getFullYear(), now.getMonth()-1, 0); end.setHours(23,59,59,999);
            return {start, end};
        }
    }

    function inRange(d, bounds){ if(!d) return false; return d.getTime() >= bounds.start.getTime() && d.getTime() <= bounds.end.getTime(); }

    function prorateMonthCost(car, start, end){
        if (!car || !car.cost_per_month) return 0;
        const s = new Date(start.getFullYear(), start.getMonth(), 1);
        let cursor = new Date(s);
        let cost = 0;
        while (cursor <= end) {
            const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1); monthStart.setHours(0,0,0,0);
            const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth()+1, 0); monthEnd.setHours(23,59,59,999);
            const overlapStart = monthStart < start ? start : monthStart;
            const overlapEnd = monthEnd > end ? end : monthEnd;
            if (overlapStart <= overlapEnd) {
                const daysInMonth = monthEnd.getDate();
                const overlapDays = Math.floor((overlapEnd.getTime() - overlapStart.getTime())/86400000) + 1;
                cost += car.cost_per_month * (overlapDays / daysInMonth);
            }
            cursor.setMonth(cursor.getMonth()+1);
        }
        return cost;
    }

    function computeTotalsForPeriod(bounds, carsData, carTripsData, userTripsData){
        const perCar = {};
        (carTripsData||[]).forEach(function(c){
            const cid = c.carId;
            perCar[cid] = perCar[cid] || {userKm:0, totalKm:0};
            (c.trips||[]).forEach(function(t){
                if ((t.type||'') !== 'end') return;
                const ts = parseTs(t.timestamp);
                if (!inRange(ts,bounds)) return;
                const dist = (typeof t.distance === 'number') ? t.distance : (t.km && t.start_km ? (t.km - t.start_km) : null);
                if (dist === null || isNaN(dist)) return;
                perCar[cid].totalKm += dist;
            });
        });

        (userTripsData||[]).forEach(function(t){
            if ((t.type||'') !== 'end') return;
            const ts = parseTs(t.timestamp);
            if (!inRange(ts,bounds)) return;
            const cid = t.car_id;
            const dist = (typeof t.distance === 'number') ? t.distance : (t.km && t.start_km ? (t.km - t.start_km) : null);
            if (dist === null || isNaN(dist)) return;
            perCar[cid] = perCar[cid] || {userKm:0, totalKm:0};
            perCar[cid].userKm += dist;
        });

        let totalKm = 0; let totalCost = 0;
        (carsData||[]).forEach(function(car){
            const cid = car.id;
            const vals = perCar[cid] || {userKm:0, totalKm:0};
            const userKm = vals.userKm || 0;
            const totalKmCar = vals.totalKm || 0;
            totalKm += userKm;
            if (car.cost_per_km) totalCost += userKm * car.cost_per_km;
            if (car.cost_per_month) {
                // Weekly view uses monthly/4, monthly view uses full month; default to prorated span
                let monthCost = prorateMonthCost(car, bounds.start, bounds.end);
                // If bounds length suggests a week (start and end within same calendar week), approximate by month/4
                const days = Math.floor((bounds.end.getTime() - bounds.start.getTime())/86400000) + 1;
                if (days <= 8) {
                    monthCost = (car.cost_per_month || 0) / 4.0;
                }
                const numUsers = (typeof userMap !== 'undefined') ? Object.keys(userMap).length : 0;
                const share = numUsers > 0 ? (1.0 / numUsers) : 0.0;
                totalCost += monthCost * share;
            }
        });

        return { km: Math.round(totalKm), cost: Math.round(totalCost*100)/100 };
    }

    function renderKmCostBox(carsData, carTripsData, userTripsData){
        const periods = ['week','month','prev1','prev2'];
        periods.forEach(function(p){
            const bounds = getPeriodBounds(p);
            const res = computeTotalsForPeriod(bounds, carsData, carTripsData, userTripsData);
            const costEl = document.getElementById('cost-'+p);
            if (costEl) costEl.textContent = res.cost.toFixed(2).replace('.',',');
        });

        const monthBounds = getPeriodBounds('month');
        const currentName = monthsDE[monthBounds.start.getMonth()+1];
        const currentNameEl = document.getElementById('current-month-name');
        if (currentNameEl) currentNameEl.textContent = currentName;

        const prev1Bounds = getPeriodBounds('prev1');
        const prev2Bounds = getPeriodBounds('prev2');
        const prev1Name = monthsDE[prev1Bounds.start.getMonth()+1];
        const prev2Name = monthsDE[prev2Bounds.start.getMonth()+1];
        const prev1NameEl = document.getElementById('prev1-name');
        const prev2NameEl = document.getElementById('prev2-name');
        if (prev1NameEl) prev1NameEl.textContent = prev1Name;
        if (prev2NameEl) prev2NameEl.textContent = prev2Name;
    }

    function getLastThreePastMonths() {
        const now = new Date();
        const months = [];
        for (let i = 3; i >= 1; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const start = new Date(d.getFullYear(), d.getMonth(), 1); start.setHours(0,0,0,0);
            const end = new Date(d.getFullYear(), d.getMonth() + 1, 0); end.setHours(23,59,59,999);
            months.push({
                key: 'prev' + i,
                label: monthsDE[d.getMonth() + 1],
                start: start,
                end: end
            });
        }
        return months;
    }

    function computeAdminUserCostsForBounds(bounds, carsData, carTripsData, userMap) {
        const users = Object.keys(userMap || {});
        const UNASSIGNED = '__unassigned__';
        const costs = {};

        users.forEach(function(uid) { costs[uid] = 0; });
        costs[UNASSIGNED] = 0;

        (carTripsData || []).forEach(function(c) {
            const car = (carsData || []).find(function(x) { return String(x.id) === String(c.carId); });
            const costPerKm = car && car.cost_per_km ? Number(car.cost_per_km) : 0;

            (c.trips || []).forEach(function(t) {
                if ((t.type || '') !== 'end') return;
                const ts = parseTs(t.timestamp);
                if (!inRange(ts, bounds)) return;

                const dist = (typeof t.distance === 'number')
                    ? t.distance
                    : (t.km && t.start_km ? (t.km - t.start_km) : null);

                if (dist === null || isNaN(dist) || !costPerKm) return;

                const uid = (t.user_id === null || typeof t.user_id === 'undefined' || t.user_id === '')
                    ? UNASSIGNED
                    : String(t.user_id);

                if (typeof costs[uid] === 'undefined') costs[uid] = 0;
                costs[uid] += dist * costPerKm;
            });
        });

        // Compute gaps between consecutive 'end' trips per car and assign gap distances
        // to UNASSIGNED if the gap's midpoint falls into the bounds.
        (carTripsData || []).forEach(function(c) {
            const car = (carsData || []).find(function(x) { return String(x.id) === String(c.carId); });
            const costPerKm = car && car.cost_per_km ? Number(car.cost_per_km) : 0;
            if (!c.trips || !c.trips.length) return;

            // collect end trips with numeric km
            const endTrips = (c.trips || []).filter(function(t){ return (t.type||'') === 'end' && t.km !== undefined && t.km !== null && !isNaN(Number(t.km)); })
                .map(function(t){ return Object.assign({}, t, { kmN: Number(t.km), ts: parseTs(t.timestamp) }); });

            // sort by km ascending to find previous/next
            endTrips.sort(function(a,b){ return a.kmN - b.kmN; });

            for (let i = 1; i < endTrips.length; i++) {
                const prev = endTrips[i-1];
                const cur = endTrips[i];
                let gapDistance = 0;

                if (cur.start_km !== undefined && cur.start_km !== null && !isNaN(Number(cur.start_km))) {
                    const actualStartKm = Number(cur.start_km);
                    const expectedStartKm = prev.kmN;
                    if (actualStartKm !== expectedStartKm) {
                        gapDistance = actualStartKm - expectedStartKm;
                    }
                } else {
                    const kmDiff = cur.kmN - prev.kmN;
                    const recordedDistance = (typeof cur.distance === 'number') ? cur.distance : ( (cur.start_km !== undefined && cur.km !== undefined) ? (Number(cur.km) - Number(cur.start_km)) : null );
                    const rec = (recordedDistance === null || isNaN(Number(recordedDistance))) ? 0 : Number(recordedDistance);
                    if (kmDiff > rec + 1) {
                        gapDistance = kmDiff - rec;
                    }
                }

                if (gapDistance > 0) {
                    // compute midpoint timestamp between prev and cur
                    const t1 = prev.ts instanceof Date && !isNaN(prev.ts) ? prev.ts : null;
                    const t2 = cur.ts instanceof Date && !isNaN(cur.ts) ? cur.ts : null;
                    let mid = null;
                    if (t1 && t2) {
                        mid = new Date(Math.floor((t1.getTime() + t2.getTime()) / 2));
                    } else if (t1) {
                        mid = t1;
                    } else if (t2) {
                        mid = t2;
                    }

                    if (mid && inRange(mid, bounds)) {
                        if (costPerKm) {
                            costs[UNASSIGNED] = (costs[UNASSIGNED] || 0) + gapDistance * costPerKm;
                        }
                    }
                }
            }
        });

        // Distribute monthly fixed costs among participants in the period.
        // Participants = users who have trips in the bounds + 'unassigned' if there are trips without user.
        const participantsSet = new Set();
        (carTripsData || []).forEach(function(c) {
            (c.trips || []).forEach(function(t) {
                if ((t.type || '') !== 'end') return;
                const ts = parseTs(t.timestamp);
                if (!inRange(ts, bounds)) return;
                const uid = (t.user_id === null || typeof t.user_id === 'undefined' || t.user_id === '')
                    ? UNASSIGNED
                    : String(t.user_id);
                participantsSet.add(uid);
            });
        });

        // Fallback: if no participants found in period, use all known users
        if (participantsSet.size === 0) {
            (users || []).forEach(function(uid) { participantsSet.add(uid); });
        }

        const participants = Array.from(participantsSet);
        const numParticipants = participants.length;
        if (numParticipants > 0) {
            (carsData || []).forEach(function(car) {
                if (!car.cost_per_month) return;
                const monthCost = prorateMonthCost(car, bounds.start, bounds.end);
                const share = monthCost / numParticipants;
                participants.forEach(function(uid) {
                    if (typeof costs[uid] === 'undefined') costs[uid] = 0;
                    costs[uid] += share;
                });
            });
        }

        Object.keys(costs).forEach(function(k) {
            costs[k] = Math.round(costs[k] * 100) / 100;
        });

        return costs;
    }

    function renderAdminUserCostSummary(carsData, carTripsData, userMap) {
        const body = document.getElementById('user-cost-summary-body');
        if (!body) return;

        const label1 = document.getElementById('user-cost-month-label-1');
        const label2 = document.getElementById('user-cost-month-label-2');
        const label3 = document.getElementById('user-cost-month-label-3');
        const yearLabel = document.getElementById('user-cost-year-label');

        const months = getLastThreePastMonths();
        const yearBounds = getPeriodBounds('year');

        if (label1) label1.textContent = months[0].label;
        if (label2) label2.textContent = months[1].label;
        if (label3) label3.textContent = months[2].label;
        if (yearLabel) yearLabel.textContent = String(new Date().getFullYear());

        const monthCosts = months.map(function(m) {
            return computeAdminUserCostsForBounds({ start: m.start, end: m.end }, carsData, carTripsData, userMap);
        });
        const yearCosts = computeAdminUserCostsForBounds(yearBounds, carsData, carTripsData, userMap);

        const users = Object.entries(userMap || {}).sort(function(a, b) {
            return a[1].localeCompare(b[1], 'de');
        });

        const rows = users.map(function(entry) {
            return { key: String(entry[0]), label: entry[1] };
        });
        rows.push({ key: '__unassigned__', label: 'Nicht erfasst' });

        body.innerHTML = '';

        const totals = { prev3: 0, prev2: 0, prev1: 0, year: 0 };

        rows.forEach(function(r) {
            const v1 = monthCosts[0][r.key] || 0;
            const v2 = monthCosts[1][r.key] || 0;
            const v3 = monthCosts[2][r.key] || 0;
            const vy = yearCosts[r.key] || 0;

            totals.prev3 += v1;
            totals.prev2 += v2;
            totals.prev1 += v3;
            totals.year += vy;

            const tr = document.createElement('tr');

            const tdName = document.createElement('td');
            tdName.textContent = r.label;
            tr.appendChild(tdName);

            [v1, v2, v3, vy].forEach(function(v) {
                const td = document.createElement('td');
                td.className = 'col-right';
                td.textContent = v.toFixed(2).replace('.', ',') + ' €';
                tr.appendChild(td);
            });

            body.appendChild(tr);
        });

        const totalPrev3 = document.getElementById('user-cost-total-prev3');
        const totalPrev2 = document.getElementById('user-cost-total-prev2');
        const totalPrev1 = document.getElementById('user-cost-total-prev1');
        const totalYear = document.getElementById('user-cost-total-year');

        if (totalPrev3) totalPrev3.textContent = totals.prev3.toFixed(2).replace('.', ',') + ' €';
        if (totalPrev2) totalPrev2.textContent = totals.prev2.toFixed(2).replace('.', ',') + ' €';
        if (totalPrev1) totalPrev1.textContent = totals.prev1.toFixed(2).replace('.', ',') + ' €';
        if (totalYear) totalYear.textContent = totals.year.toFixed(2).replace('.', ',') + ' €';
    }

    function toNumericOrNull(v) {
        if (v === null || typeof v === 'undefined' || v === '') return null;
        const n = Number(v);
        return isNaN(n) ? null : n;
    }

    function formatMidTimestamp(tsA, tsB) {
        const a = parseTs(tsA);
        const b = parseTs(tsB);
        let dt = null;
        if (a && !isNaN(a) && b && !isNaN(b)) {
            dt = new Date(Math.floor((a.getTime() + b.getTime()) / 2));
        } else if (a && !isNaN(a)) {
            dt = a;
        } else if (b && !isNaN(b)) {
            dt = b;
        }
        if (!dt) return '';
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        const hh = String(dt.getHours()).padStart(2, '0');
        const mm = String(dt.getMinutes()).padStart(2, '0');
        const ss = String(dt.getSeconds()).padStart(2, '0');
        return y + '-' + m + '-' + d + ' ' + hh + ':' + mm + ':' + ss;
    }

    function escapeCsvCell(v) {
        const s = String(v === null || typeof v === 'undefined' ? '' : v);
        if (s.indexOf('"') >= 0 || s.indexOf(',') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }

    function exportAllTripsCsv() {
        const trips = (typeof allTripsData !== 'undefined' && Array.isArray(allTripsData)) ? allTripsData : [];
        const cars = (typeof carsData !== 'undefined' && Array.isArray(carsData)) ? carsData : [];
        const users = (typeof userMap !== 'undefined' && userMap) ? userMap : {};

        const tripsByCar = {};
        trips.forEach(function(t) {
            if ((t.type || '') !== 'end') return;
            const cid = String(t.car_id);
            if (!tripsByCar[cid]) tripsByCar[cid] = [];
            tripsByCar[cid].push(t);
        });

        const sortedCars = cars.slice().sort(function(a, b) {
            return Number(a.id) - Number(b.id);
        });

        const rows = [];
        sortedCars.forEach(function(car) {
            const cid = String(car.id);
            const carTrips = (tripsByCar[cid] || []).slice();

            carTrips.sort(function(a, b) {
                const aStartRaw = toNumericOrNull(a.start_km);
                const bStartRaw = toNumericOrNull(b.start_km);
                const aStart = aStartRaw !== null ? aStartRaw : toNumericOrNull(a.km);
                const bStart = bStartRaw !== null ? bStartRaw : toNumericOrNull(b.km);
                if (aStart !== null && bStart !== null && aStart !== bStart) return aStart - bStart;
                if (aStart === null && bStart !== null) return 1;
                if (aStart !== null && bStart === null) return -1;
                const aEnd = toNumericOrNull(a.km);
                const bEnd = toNumericOrNull(b.km);
                if (aEnd !== null && bEnd !== null && aEnd !== bEnd) return aEnd - bEnd;
                return Number(a.id || 0) - Number(b.id || 0);
            });

            let prev = null;
            carTrips.forEach(function(t) {
                const startKmRaw = toNumericOrNull(t.start_km);
                const endKm = toNumericOrNull(t.km);
                const startKm = startKmRaw !== null ? startKmRaw : endKm;
                const userName = (t.user_id !== null && typeof t.user_id !== 'undefined' && users[String(t.user_id)])
                    ? users[String(t.user_id)]
                    : 'nicht erfasst';

                if (prev) {
                    const prevEnd = toNumericOrNull(prev.km);
                    const nextStart = startKm;
                    if (prevEnd !== null && nextStart !== null && prevEnd !== nextStart) {
                        rows.push({
                            id: 'gap_' + String(prev.id || '') + '_' + String(t.id || ''),
                            autoId: cid,
                            benutzer: 'nicht erfasst',
                            startKm: prevEnd,
                            endKm: nextStart,
                            timestamp: formatMidTimestamp(prev.timestamp, t.timestamp)
                        });
                    }
                }

                rows.push({
                    id: String(t.id || ''),
                    autoId: cid,
                    benutzer: userName,
                    startKm: startKm !== null ? startKm : '',
                    endKm: endKm !== null ? endKm : '',
                    timestamp: t.timestamp || ''
                });

                prev = t;
            });
        });

        rows.sort(function(a, b) {
            const aCar = Number(a.autoId || 0);
            const bCar = Number(b.autoId || 0);
            if (aCar !== bCar) return aCar - bCar;
            const aStart = toNumericOrNull(a.startKm);
            const bStart = toNumericOrNull(b.startKm);
            if (aStart === null && bStart === null) return 0;
            if (aStart === null) return 1;
            if (bStart === null) return -1;
            return aStart - bStart;
        });

        const header = ['ID', 'Auto', 'Benutzer', 'start_KM', 'end_km', 'timestamp'];
        const csvLines = [header.map(escapeCsvCell).join(',')];
        rows.forEach(function(r) {
            csvLines.push([
                r.id,
                r.autoId,
                r.benutzer,
                r.startKm,
                r.endKm,
                r.timestamp
            ].map(escapeCsvCell).join(','));
        });

        const bom = '\uFEFF';
        const csv = bom + csvLines.join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        link.href = URL.createObjectURL(blob);
        link.download = 'trips_export_' + y + m + d + '.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }

    window.renderKmCostBox = renderKmCostBox;
    
    // Compute per-car KM and cost for given periods (array of period keys)
    function computePerCarForPeriods(userId, carsData, carTripsData, periods) {
        // allow caller to omit carTripsData and use the global bootstrapped `carTripsData`
        carTripsData = carTripsData || (typeof window !== 'undefined' ? window.carTripsData : []);
        periods = periods || ['week','month','prev1','prev2'];
        const perCar = {};

        // initialize per car
        (carsData||[]).forEach(function(car){
            perCar[car.id] = perCar[car.id] || { carName: car.name, km: {}, totalKm: {}, cost: {}, car: car };
            periods.forEach(function(p){ perCar[car.id].km[p]=0; perCar[car.id].totalKm[p]=0; perCar[car.id].cost[p]=0; });
        });

        // aggregate totalKm per car from carTripsData
        (carTripsData||[]).forEach(function(c){
            const cid = c.carId;
            (c.trips||[]).forEach(function(t){
                if ((t.type||'') !== 'end') return;
                const ts = parseTs(t.timestamp);
                periods.forEach(function(p){
                    const b = getPeriodBounds(p);
                    if (inRange(ts,b)) {
                        const dist = (typeof t.distance === 'number') ? t.distance : (t.km && t.start_km ? (t.km - t.start_km) : null);
                        if (dist===null || isNaN(dist)) return;
                        perCar[cid] = perCar[cid] || { carName: c.carName, km:{}, totalKm:{}, cost:{}, car: null };
                        perCar[cid].totalKm[p] = (perCar[cid].totalKm[p]||0) + dist;
                    }
                });
            });
        });

        // aggregate user km per car (from carTripsData which contains trips for all users)
        (carTripsData||[]).forEach(function(c){
            const cid = c.carId;
            (c.trips||[]).forEach(function(t){
                if ((t.type||'') !== 'end') return;
                if ((t.user_id||null) != userId) return;
                const ts = parseTs(t.timestamp);
                periods.forEach(function(p){
                    const b = getPeriodBounds(p);
                    if (!b) return;
                    if (inRange(ts,b)) {
                        const dist = (typeof t.distance === 'number') ? t.distance : (t.km && t.start_km ? (t.km - t.start_km) : null);
                        if (dist===null || isNaN(dist)) return;
                        perCar[cid] = perCar[cid] || { carName: c.carName, km:{}, totalKm:{}, cost:{}, car: null };
                        perCar[cid].km[p] = (perCar[cid].km[p]||0) + dist;
                    }
                });
            });
        });

        // compute costs per car per period
        (carsData||[]).forEach(function(car){
            const cid = car.id;
            periods.forEach(function(p){
                const userKm = perCar[cid] && perCar[cid].km[p] ? perCar[cid].km[p] : 0;
                const totalKmCar = perCar[cid] && perCar[cid].totalKm[p] ? perCar[cid].totalKm[p] : 0;
                let cost = 0;
                if (car.cost_per_km) cost += userKm * car.cost_per_km;
                if (car.cost_per_month) {
                    const bounds = getPeriodBounds(p);
                    // For weekly period show monthly/4, for month show full month, otherwise prorated
                    let monthCost;
                    if (p === 'week') {
                        monthCost = (car.cost_per_month || 0) / 4.0;
                    } else if (p === 'month') {
                        // prorateMonthCost over the month bounds will equal full month
                        monthCost = prorateMonthCost(car, bounds.start, bounds.end);
                    } else {
                        monthCost = prorateMonthCost(car, bounds.start, bounds.end);
                    }
                    const numUsers = (typeof userMap !== 'undefined') ? Object.keys(userMap).length : 0;
                    const share = numUsers > 0 ? (1.0 / numUsers) : 0.0;
                    cost += monthCost * share;
                }
                perCar[cid] = perCar[cid] || { carName: car.name, km:{}, totalKm:{}, cost:{}, car: car };
                perCar[cid].cost[p] = Math.round(cost*100)/100;
                perCar[cid].car = car;
            });
        });

        return perCar;
    }

    // Render summary tables: KM and Cost. Expects table bodies with ids 'km-summary-body' and 'cost-summary-body'
    function renderSummaryTables(userId, carsData, carTripsData, periods) {
        periods = periods || ['week','month','year'];
        const perCar = computePerCarForPeriods(userId, carsData, carTripsData, periods);

        // render KM table
        const kmBody = document.getElementById('km-summary-body');
        const costBody = document.getElementById('cost-summary-body');
        if (kmBody) kmBody.innerHTML = '';
        if (costBody) costBody.innerHTML = '';

        let totalsKm = {}; let totalsCost = {};
        periods.forEach(p=>{ totalsKm[p]=0; totalsCost[p]=0; });

        Object.keys(perCar).forEach(function(cid){
            const entry = perCar[cid];
            const trKm = document.createElement('tr');
            const tdName = document.createElement('td'); tdName.textContent = entry.carName || ('Car '+cid);
            trKm.appendChild(tdName);
            periods.forEach(function(p){
                const td = document.createElement('td'); td.className='col-right';
                const v = Math.round((entry.km[p]||0));
                td.textContent = v.toLocaleString('de-DE');
                trKm.appendChild(td);
                totalsKm[p] += v;
            });
            if (kmBody) kmBody.appendChild(trKm);

            const trCost = document.createElement('tr');
            const tdNameC = document.createElement('td'); tdNameC.textContent = entry.carName || ('Car '+cid);
            trCost.appendChild(tdNameC);
            periods.forEach(function(p){
                const td = document.createElement('td'); td.className='col-right';
                const v = (entry.cost[p]||0);
                td.textContent = v.toFixed(2).replace('.',',') + ' €';
                trCost.appendChild(td);
                totalsCost[p] += v;
            });
            if (costBody) costBody.appendChild(trCost);
        });

        // render totals into tfoot cells if present
        periods.forEach(function(p){
            const kmTotEl = document.getElementById('km-summary-'+p);
            if (kmTotEl) kmTotEl.textContent = totalsKm[p].toLocaleString('de-DE');
            const costTotEl = document.getElementById('cost-summary-'+p);
            if (costTotEl) costTotEl.textContent = totalsCost[p].toFixed(2).replace('.',',') + ' €';
        });
    }

    window.computePerCarForPeriods = computePerCarForPeriods;
    window.renderSummaryTables = renderSummaryTables;
    window.renderAdminUserCostSummary = renderAdminUserCostSummary;
    window.exportAllTripsCsv = exportAllTripsCsv;
})();

// Car time-filter tabs — works with render_trip_history_ui() structure
(function(){
    const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

    function parseTs(s){ return s ? new Date(s.replace(' ', 'T')) : null; }

    function buildTabsForCar(carId, trips) {
        const container = document.getElementById('car-time-tabs-' + carId);
        if (!container) return;
        container.innerHTML = '';

        const years = new Set();
        (trips || []).forEach(t => {
            if (!t.timestamp) return;
            const d = parseTs(t.timestamp);
            if (d && !isNaN(d)) years.add(d.getFullYear());
        });
        const yearList = Array.from(years).sort();

        const now = new Date();
        const months = [];
        for (let i = 2; i >= 0; i--) {
            const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ year: m.getFullYear(), month: m.getMonth() });
        }

        function makeBtn(label, filter) {
            const btn = document.createElement('button');
            btn.className = 'car-tab';
            btn.textContent = label;
            btn.dataset.filter = JSON.stringify(filter);
            btn.addEventListener('click', function() {
                onTimeTabClick(carId, trips, btn);
            });
            return btn;
        }

        const allBtn = makeBtn('Alle', { type: 'all' });
        allBtn.classList.add('active');
        container.appendChild(allBtn);

        yearList.forEach(y => container.appendChild(makeBtn(String(y), { type: 'year', year: y })));
        months.forEach(m => container.appendChild(makeBtn(monthNames[m.month], { type: 'month', year: m.year, month: m.month + 1 })));
    }

    function onTimeTabClick(carId, trips, btn) {
        Array.from(btn.parentElement.querySelectorAll('.car-tab')).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderFilteredCarTrips(carId, trips, JSON.parse(btn.dataset.filter));
    }

    function renderFilteredCarTrips(carId, trips, filter) {
        const filtered = (trips || []).filter(t => {
            if (!filter || filter.type === 'all') return true;
            if (!t.timestamp) return false;
            const d = parseTs(t.timestamp);
            if (!d || isNaN(d)) return false;
            if (filter.type === 'year') return d.getFullYear() === parseInt(filter.year, 10);
            if (filter.type === 'month') {
                return d.getFullYear() === parseInt(filter.year, 10) && (d.getMonth() + 1) === parseInt(filter.month, 10);
            }
            return true;
        });

        if (typeof TripsPager !== 'undefined' && typeof renderCarTripRow !== 'undefined') {
            new TripsPager(filtered, 'car-trips-body-' + carId, 'car-trips-pagination-' + carId, renderCarTripRow);
        }
    }

    function initCarTimeTabs() {
        if (typeof carTripsData === 'undefined') return;
        carTripsData.forEach(function(item) {
            buildTabsForCar(item.carId, item.trips || []);
        });
    }

    function activateFirstCarWithAll() {
        if (typeof carTripsData === 'undefined' || !carTripsData.length) return;

        const first = carTripsData[0];
        const firstCarId = first.carId;
        const firstTrips = first.trips || [];

        if (typeof window.switchCarTab === 'function') {
            window.switchCarTab(firstCarId);
        }

        const timeTabs = document.getElementById('car-time-tabs-' + firstCarId);
        if (timeTabs) {
            const buttons = Array.from(timeTabs.querySelectorAll('.car-tab'));
            buttons.forEach(b => b.classList.remove('active'));
            if (buttons.length > 0) {
                buttons[0].classList.add('active');
            }
        }

        renderFilteredCarTrips(firstCarId, firstTrips, { type: 'all' });
    }

    window.buildTabsForCar = buildTabsForCar;
    window.renderFilteredCarTrips = renderFilteredCarTrips;
    window.initCarTimeTabs = initCarTimeTabs;
    window.activateFirstCarWithAll = activateFirstCarWithAll;

    document.addEventListener('DOMContentLoaded', function() {
        initCarTimeTabs();

        const statsBtn = document.querySelector('.tab-button[data-tab="stats"]');
        if (statsBtn) {
            statsBtn.addEventListener('click', function() {
                activateFirstCarWithAll();
            });
        }

        const statsPanel = document.getElementById('tab-stats');
        if (statsPanel && statsPanel.classList.contains('active')) {
            activateFirstCarWithAll();
        }
    });
})();
