<?php
// DriveJournal - Zentrale Funktionen

//Gibt den Dateinamen für Trips eines bestimmten Autos zurück
 function getTripsFileForCar($carId) {
    return DATA_DIR . 'trips_' . $carId . '.json';
}

//Lädt alle Trips für ein bestimmtes Auto
function loadTripsForCar($carId) {
    $file = getTripsFileForCar($carId);
    return loadJSON($file);
}

// Lädt alle Trips von allen Autos
function loadAllTrips() {
    $allTrips = [];
    $files = glob(DATA_DIR . 'trips_*.json');
    if ($files === false) {
        $files = [];
    }

    foreach ($files as $file) {
        $trips = loadJSON($file);
        $allTrips = array_merge($allTrips, $trips);
    }
    
    // Nach ID sortieren
    usort($allTrips, function($a, $b) {
        return $a['id'] - $b['id'];
    });
    
    return $allTrips;
}

// Speichert einen Trip in der entsprechenden Auto-Datei
function saveTrip($trip) {
    $carId = $trip['car_id'];
    $trips = loadTripsForCar($carId);
    
    // Prüfe ob Trip bereits existiert (Update)
    $found = false;
    foreach ($trips as $key => $existingTrip) {
        if ($existingTrip['id'] == $trip['id']) {
            $trips[$key] = $trip;
            $found = true;
            break;
        }
    }
    
    // Wenn nicht gefunden, hinzufügen
    if (!$found) {
        $trips[] = $trip;
    }
    
    // Sortiere nach ID
    usort($trips, function($a, $b) {
        return $a['id'] - $b['id'];
    });
    
    $file = getTripsFileForCar($carId);
    return saveJSON($file, $trips);
}

/**
 * Generiert eine neue eindeutige Trip-ID über alle Autos hinweg
 * 
 * @return int Die neue ID
 */
function generateTripId() {
    $allTrips = loadAllTrips();
    
    $maxId = 0;
    foreach ($allTrips as $trip) {
        if ($trip['id'] > $maxId) {
            $maxId = $trip['id'];
        }
    }
    
    return $maxId + 1;
}

/**
 * Berechnet die gefahrenen Kilometer für eine Fahrt dynamisch
 * 
 * @param array $trip Die Fahrt, für die die Distanz berechnet werden soll
 * @param array $allTrips Alle Fahrten
 * @param array $cars Alle Autos
 * @return float|null Die gefahrenen Kilometer oder null wenn nicht berechenbar
 */
function calculateTripDistance($trip, $allTrips, $cars) {
    // Nur für "Ende"-Fahrten berechnen
    if ($trip['type'] !== 'end') {
        return null;
    }
    
    // Wenn start_km vorhanden ist, direkt berechnen (neue Einträge)
    if (isset($trip['start_km']) && is_numeric($trip['start_km'])) {
        return $trip['km'] - $trip['start_km'];
    }
    
    // Neue Logik für Einträge ohne start_km:
    // Ignoriere Timestamp — finde den größten vorhandenen "end"-KM
    // für dieses Fahrzeug, der kleiner als der aktuelle KM ist.
    $carId = $trip['car_id'];
    $currentKm = $trip['km'];

    $bestKm = null;
    foreach ($allTrips as $t) {
        if (($t['type'] ?? '') === 'end' && ($t['car_id'] ?? null) == $carId && isset($t['km']) && is_numeric($t['km']) && $t['id'] != $trip['id']) {
            $tKm = (float)$t['km'];
            if ($tKm < $currentKm && ($bestKm === null || $tKm > $bestKm)) {
                $bestKm = $tKm;
            }
        }
    }

    if ($bestKm !== null) {
        return $currentKm - $bestKm;
    }

    // Fallback: verwende initial_km oder current_km des Autos, falls vorhanden
    foreach ($cars as $car) {
        if ($car['id'] == $carId) {
            $initial = null;
            if (isset($car['initial_km']) && is_numeric($car['initial_km'])) $initial = (float)$car['initial_km'];
            elseif (isset($car['current_km']) && is_numeric($car['current_km'])) $initial = (float)$car['current_km'];
            if ($initial !== null) return $currentKm - $initial;
            break;
        }
    }

    return null;
}

/**
 * Reichert eine Fahrt mit der berechneten Distanz an
 * 
 * @param array $trip Die Fahrt
 * @param array $allTrips Alle Fahrten
 * @param array $cars Alle Autos
 * @return array Die Fahrt mit distance-Feld
 */
function enrichTripWithDistance($trip, $allTrips, $cars) {
    $distance = calculateTripDistance($trip, $allTrips, $cars);
    if ($distance !== null) {
        $trip['distance'] = $distance;
    }
    return $trip;
}

/**
 * Reichert alle Fahrten mit berechneten Distanzen an
 * 
 * @param array $trips Alle Fahrten
 * @param array $cars Alle Autos
 * @return array Alle Fahrten mit distance-Feldern
 */
function enrichTripsWithDistances($trips, $cars) {
    $enrichedTrips = [];
    foreach ($trips as $trip) {
        $enrichedTrips[] = enrichTripWithDistance($trip, $trips, $cars);
    }
    return $enrichedTrips;
}

/**
 * Baut die Trips pro Fahrzeug auf und erkennt Lücken (gaps).
 * Diese Logik wurde aus der Anzeige-Logik extrahiert, damit sowohl
 * `drive.php` als auch `admin.php` denselben Code verwenden.
 *
 * @param array $cars
 * @param array $trips
 * @return array Array von ['car'=>..., 'trips'=>[...]]
 */
function buildTripsByCar($cars, $trips) {
    $tripsByCar = [];

    foreach ($cars as &$car) {
        $allCarTrips = array_filter($trips, function($trip) use ($car) {
            return $trip['car_id'] == $car['id'];
        });
        $allCarTrips = array_values($allCarTrips);

        usort($allCarTrips, function($a, $b) {
            $aKm = isset($a['km']) && is_numeric($a['km']) ? (float)$a['km'] : null;
            $bKm = isset($b['km']) && is_numeric($b['km']) ? (float)$b['km'] : null;
            if ($aKm !== null && $bKm !== null) {
                if ($aKm == $bKm) return 0;
                return $aKm < $bKm ? -1 : 1;
            }
            $aTs = isset($a['timestamp']) ? strtotime($a['timestamp']) : 0;
            $bTs = isset($b['timestamp']) ? strtotime($b['timestamp']) : 0;
            return $aTs - $bTs;
        });

        $tripsWithGaps = [];
        foreach ($allCarTrips as $index => $trip) {
            if ($trip['type'] === 'end') {
                $prevEndTrip = null;
                for ($i = $index - 1; $i >= 0; $i--) {
                    if ($allCarTrips[$i]['type'] === 'end') {
                        $prevEndTrip = $allCarTrips[$i];
                        break;
                    }
                }

                if ($prevEndTrip !== null) {
                    if (isset($trip['start_km']) && is_numeric($trip['start_km'])) {
                        $expectedStartKm = $prevEndTrip['km'];
                        $actualStartKm = (float)$trip['start_km'];

                        $existsEndAtStartKm = false;
                        foreach ($allCarTrips as $checkTrip) {
                            if (($checkTrip['type'] ?? '') === 'end' && isset($checkTrip['km']) && is_numeric($checkTrip['km'])) {
                                if ((float)$checkTrip['km'] == $actualStartKm) {
                                    $existsEndAtStartKm = true;
                                    break;
                                }
                            }
                        }

                        if ($actualStartKm != $expectedStartKm && !$existsEndAtStartKm) {
                            $gapDistance = $actualStartKm - $expectedStartKm;
                            $tripsWithGaps[] = [
                                'id' => 'gap_' . $prevEndTrip['id'] . '_' . $trip['id'],
                                'car_id' => $car['id'],
                                'user_id' => null,
                                'km' => $actualStartKm,
                                'km_start' => $expectedStartKm,
                                'distance' => $gapDistance,
                                'timestamp' => $trip['timestamp'],
                                'type' => 'gap',
                                'is_gap' => true
                            ];
                        }
                    } else {
                        $kmDiff = $trip['km'] - $prevEndTrip['km'];
                        $recordedDistance = isset($trip['distance']) ? $trip['distance'] : 0;
                        if ($kmDiff > $recordedDistance + 1) {
                            $gapDistance = $kmDiff - $recordedDistance;
                            $tripsWithGaps[] = [
                                'id' => 'gap_' . $prevEndTrip['id'] . '_' . $trip['id'],
                                'car_id' => $car['id'],
                                'user_id' => null,
                                'km' => $trip['km'],
                                'km_start' => $prevEndTrip['km'],
                                'distance' => $gapDistance,
                                'timestamp' => $trip['timestamp'],
                                'type' => 'gap',
                                'is_gap' => true
                            ];
                        }
                    }
                }

                $tripsWithGaps[] = $trip;
            }
        }

        usort($tripsWithGaps, function($a, $b) {
            return $b['km'] - $a['km'];
        });

        $maxTripKm = null;
        foreach ($allCarTrips as $t) {
            $candidate = null;
            if (isset($t['start_source']) && ($t['start_source'] === 'correction' || $t['start_source'] === 'open-start')) {
                if (isset($t['start_km']) && is_numeric($t['start_km'])) {
                    $candidate = (float)$t['start_km'];
                }
            }
            if ($candidate === null && isset($t['km']) && is_numeric($t['km'])) {
                $candidate = (float)$t['km'];
            }

            if ($candidate !== null) {
                if ($maxTripKm === null || $candidate > $maxTripKm) $maxTripKm = $candidate;
            }
        }
        $storedCurrent = isset($car['current_km']) ? (float)$car['current_km'] : (isset($car['initial_km']) ? (float)$car['initial_km'] : 0);
        $computedKm = $maxTripKm !== null ? max($maxTripKm, $storedCurrent) : $storedCurrent;
        $car['current_km'] = $computedKm;

        $maxTripId = null;
        foreach ($allCarTrips as $t) {
            if (isset($t['id']) && is_numeric($t['id'])) {
                $tid = (int)$t['id'];
                if ($maxTripId === null || $tid > $maxTripId) $maxTripId = $tid;
            }
        }
        $car['last_trip_id'] = $maxTripId;

        if (!empty($tripsWithGaps)) {
            $tripsByCar[] = [
                'car' => $car,
                'trips' => $tripsWithGaps
            ];
        }
    }
    unset($car);

    return $tripsByCar;
}

/**
 * Rendert die Fahrten-Übersicht (Tabs + Tabellen) und die Bestätigungs-Dialog-HTML.
 * Kann von `drive.php` und `admin.php` verwendet werden. Wenn $isAdmin true ist,
 * wird zusätzlich ein User-Dropdown im Bestätigungsdialog ausgegeben.
 *
 * @param array $tripsByCar
 * @param array $cars
 * @param array $users
 * @param int|null $currentUserId
 * @param bool $isAdmin
 */
function render_trip_history_ui($tripsByCar, $cars, $users, $currentUserId = null, $isAdmin = false) {
    // Nutzer- und Auto-Maps für JS
    $userMap = [];
    foreach ($users as $u) $userMap[$u['id']] = $u['name'];
    $carMap = [];
    foreach ($cars as $c) $carMap[$c['id']] = $c['name'];

    // HTML: Tabs + Tabellen (JS füllt tbody)
    echo "<div class=\"trips-history\">\n";
    echo "    <h3>🚗 Alle Fahrzeuge</h3>\n";
    echo "    <div class=\"car-tabs\">\n";
    foreach ($tripsByCar as $index => $carData) {
        $name = htmlspecialchars($carData['car']['name']);
        $active = $index === 0 ? 'active' : '';
        $id = $carData['car']['id'];
        echo "        <button class=\"car-tab $active\" data-car-id=\"$id\" onclick=\"switchCarTab($id)\">$name</button>\n";
    }
    echo "    </div>\n";
    echo "    <div class=\"car-tab-contents\">\n";
    foreach ($tripsByCar as $index => $carData) {
        $active = $index === 0 ? 'active' : '';
        $id = $carData['car']['id'];
        echo "        <div class=\"tab-panel $active\" id=\"car-tab-$id\">\n";
        echo "            <table class=\"table-inline\">\n";
        echo "                <thead>\n";
        echo "                    <tr>\n";
        echo "                        <th>Datum</th>\n";
        echo "                        <th>Fahrer</th>\n";
        echo "                        <th>KM</th>\n";
        echo "                        <th>KM-Stand</th>\n";
        echo "                    </tr>\n";
        echo "                </thead>\n";
        echo "                <tbody id=\"car-trips-body-$id\">\n";
        echo "                </tbody>\n";
        echo "            </table>\n";
        echo "            <div class=\"pagination\" id=\"car-trips-pagination-$id\"></div>\n";
        echo "        </div>\n";
    }
    echo "    </div>\n";
    echo "</div>\n";

    // render_trip_history_ui only outputs the tabs/tables. Dialog is rendered
    // separately where needed so it can appear above the trips list.
}

/**
 * Rendert das Bestätigungs-Dialog-HTML (versteckt).
 */
function render_confirmation_dialog() {
    echo '<div class="confirmation-section" id="confirmation-dialog" hidden>' . "\n";
    echo '  <div class="confirmation-content">' . "\n";
    echo '    <div class="confirmation-info">' . "\n";
    echo '      <h3 id="confirm-title">Fahrt bestätigen</h3>' . "\n";
    echo '      <div class="confirmation-details">' . "\n";
    echo '        <p><strong id="confirm-car-name"></strong></p>' . "\n";
    echo '        <p><span id="confirm-distance-label">Gefahrene KM:</span> <strong id="confirm-distance"></strong></p>' . "\n";
    echo '        <p class="confirm-last-entry small" id="confirm-last-entry"></p>' . "\n";
    echo '      </div>' . "\n";
    echo '      <div class="confirmation-actions">' . "\n";
    echo '        <button class="btn btn--primary btn--normal" id="btn-confirm-ok">OK</button>' . "\n";
    echo '        <div class="confirmation-correction">' . "\n";
    echo '          <label for="correction-km">Korrektur - Gefahrene KM:</label>' . "\n";
    echo '          <input id="correction-km" type="number" inputmode="numeric" pattern="[0-9]*" placeholder="Gefahrene KM">' . "\n";
    echo '          <button class="btn btn--critical btn--normal" id="btn-confirm-correction">Korrektur</button>' . "\n";
    echo '        </div>' . "\n";
    echo '        <button class="btn btn--secondary btn--normal" id="btn-confirm-cancel">Abbrechen</button>' . "\n";
    echo '      </div>' . "\n";
    echo '    </div>' . "\n";
    echo '  </div>' . "\n";
    echo '</div>' . "\n";
}

/**
 * Rendert das JS-Bootstrap-Script mit App-Daten (Fahrten, Autos, Nutzer, Maps).
 * Wird idealerweise am Ende des <body> aufgerufen.
 *
 * @param array $users
 * @param array $cars
 * @param int|null $currentUserId
 * @param bool $isAdmin
 * @param array $userTrips
 * @param array $tripsByCar
 */
function render_app_data_script($users, $cars, $currentUserId = null, $isAdmin = false, $userTrips = [], $tripsByCar = []) {
    // JS data
    $userMap = [];
    foreach ($users as $u) $userMap[$u['id']] = $u['name'];
    $carMap = [];
    foreach ($cars as $c) $carMap[$c['id']] = $c['name'];
    $carTripsJs = array_map(function($item){
        return [ 'carId' => $item['car']['id'], 'carName' => $item['car']['name'], 'trips' => $item['trips'] ];
    }, $tripsByCar);

    echo "<script>\n";
    echo "const isAdmin = " . ($isAdmin ? 'true' : 'false') . ";\n";
    echo "const userId = " . ($currentUserId !== null ? (int)$currentUserId : 'null') . ";\n";
    // Build an enriched cars array for JS that includes computed current_km and last_trip_id
    $cars_for_js = [];
    foreach ($cars as $c) {
        $entry = [
            'id' => $c['id'],
            'name' => $c['name'],
            'current_km' => isset($c['current_km']) ? $c['current_km'] : (isset($c['initial_km']) ? $c['initial_km'] : 0),
            'open_start_km' => isset($c['open_start_km']) ? $c['open_start_km'] : null,
            'last_trip_id' => null,
            'cost_per_km' => isset($c['cost_per_km']) ? (float)$c['cost_per_km'] : null,
            'cost_per_month' => isset($c['cost_per_month']) ? (float)$c['cost_per_month'] : null,
            'remaining_range' => !empty($c['remaining_range']),
            'remaining_range_value' => isset($c['remaining_range_value']) ? $c['remaining_range_value'] : null,
        ];
        // try to find matching entry in tripsByCar to get last_trip_id/current_km if computed there
        foreach ($tripsByCar as $tb) {
            if (isset($tb['car']) && isset($tb['car']['id']) && $tb['car']['id'] == $c['id']) {
                if (isset($tb['car']['last_trip_id'])) $entry['last_trip_id'] = $tb['car']['last_trip_id'];
                if (isset($tb['car']['current_km'])) $entry['current_km'] = $tb['car']['current_km'];
                if (isset($tb['car']['open_start_km'])) $entry['open_start_km'] = $tb['car']['open_start_km'];
                break;
            }
        }
        $cars_for_js[] = $entry;
    }

    echo "const carsData = " . json_encode($cars_for_js, JSON_UNESCAPED_UNICODE) . ";\n";
    echo "const userTripsData = " . json_encode($userTrips, JSON_UNESCAPED_UNICODE) . ";\n";
    echo "const carTripsData = " . json_encode($carTripsJs, JSON_UNESCAPED_UNICODE) . ";\n";
    echo "const userMap = " . json_encode($userMap, JSON_UNESCAPED_UNICODE) . ";\n";
    echo "const carMap = " . json_encode($carMap, JSON_UNESCAPED_UNICODE) . ";\n";
    echo "</script>\n";
}
