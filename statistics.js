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
})();
