# Auf dem Mac ausprobieren · Version 0.9.0

Die App bleibt während der Entwicklung auf dem privaten Mac. Verwenden Sie ausschließlich erfundene Daten. Ein Krankenhauszugang ist für diese Übungen nicht nötig.

## Eine Übungsbibliothek öffnen

1. In Chrome oder Edge `http://127.0.0.1:5186` öffnen. Nach einem Update mit `⌘⇧R` neu laden. Die Startseite führt über „Bibliothek öffnen“ zur Ordnerauswahl.
2. „Meine Bibliothek öffnen“ wählen und den Unterordner **Bibliothek** aus der erzeugten Übung auswählen. Der letzte Übungspfad steht in `test-results/demo-latest.json`.
3. Die Bibliothek öffnet im türkis markierten „Ansichts-Modus“: Suchen, Berichte, Verläufe und CSV-Export funktionieren sofort. Für Import oder Änderungen den Modusknopf oben neben dem Bibliotheksnamen anklicken. Im Popup „Niemand sonst bearbeitet gerade diese Bibliothek, auch an anderen PCs.“ anhaken, dann „Fortfahren“ wählen. Der Knopf zeigt anschließend rot „Bearbeitungs-Modus“.

Die Übung enthält 80 erfundene Patienten mit 240 Untersuchungen, wiederholten Aufenthalten, geänderten Fassungen, fehlenden Berichten und allen sieben Untersuchungsarten. Sie ist deutlich als Übungsbibliothek gekennzeichnet.

Falls die lokale Vorschau nicht läuft, im Terminal im Projektordner:

```sh
npm run dev
```

Eine neue Übung erzeugen:

```sh
npm run demo
```

Es wird jedes Mal ein neuer Ordner angelegt. Vorhandene Übungs- oder Archivordner werden nicht ersetzt. Die erzeugten Übungsbibliotheken liegen als eigene Nachbarordner neben dem Projekt und bleiben für spätere lokale Übungen erhalten. Echte Archive gehören in den vorgesehenen dauerhaften Speicher außerhalb des Quellcodes.

## Neue Bibliothek anlegen oder wechseln

„Neue Bibliothek anlegen“ wählen und einen leeren Ordner auswählen. Jetzt kann „Schreib- und Leseprüfung starten“ genau diesen Ordner prüfen; eine zweite Ordnerauswahl ist nicht nötig. Anschließend „Bibliothek hier anlegen“ wählen.

Ist eine Bibliothek geöffnet, zeigt „Bibliothek öffnen“ den Hinweis „Eine Bibliothek ist bereits geöffnet“ und ihren Ordnernamen. Der Browser gibt den vollständigen Laufwerks-/Netzwerkpfad nicht frei. Zum Wechseln zuerst „Bibliothek schließen“ und anschließend die andere Bibliothek öffnen. Bei noch nicht gespeicherten Importdateien fragt die App vor dem Verwerfen nach.

## Neue Dateien übernehmen

1. **Dateien auswählen:** Unter „Importieren“ CSV und PDF für genau einen Patienten und einen Aufenthalt auswählen. Für die Übung liegen sie im Unterordner **Importuebung**.
2. **Patient & Aufenthalt:** iMed Patienten-ID und Aufenthalts-ID einmal eingeben. Alle Dateien dieses Imports erhalten diese Zuordnung. Für neue Untersuchungen zusätzlich die Untersuchungsart auswählen. Ist die Patienten-ID bekannt, zeigt die App Anzahl und Daten der bisherigen Untersuchungen. Mit „Zu diesem Patienten hinzufügen“ bestätigen. Eine neue Patienten-ID wird erst beim Speichern angelegt.
3. **Speichern:** Zusammenfassung prüfen, das verpflichtende Bearbeiterkürzel eingeben und „Importieren“ wählen. Doppelte Dateien werden übersprungen. Erst nach dem Speichern und erneuter Prüfung erscheint die Bestätigung.

PDFs werden automatisch anhand der ersten bis zu 50 Buchstaben/Ziffern des Namens zugeordnet. Trennzeichen und wiederholte Endungen wie `.pdf.pdf` werden dabei ausgelassen; Groß-/Kleinschreibung bleibt relevant. Bei abweichenden oder mehrdeutigen Namen stoppt der Import: die passende PDF auswählen, gegebenenfalls die zugehörige CSV hinzufügen oder die fehlerhafte Datei ausdrücklich aus diesem Import entfernen. Jede Ersatzdatei wird erneut geprüft. CSVs können auch ohne PDF importiert werden. Eine PDF kann später zur gespeicherten CSV ergänzt werden, wenn Namensanfang, eingegebener Patient und Aufenthalt passen. Es gibt keine automatische Ableitung der Patienten-ID aus dem iPad-Export.

Die erfundenen Zuordnungen der Übung stehen in **ZUORDNUNGSHILFE.json**. Jeweils nur Dateien eines Patienten/Aufenthalts auswählen. Die identische und die geänderte CSV derselben Sitzung nacheinander ausprobieren. Geänderte CSVs benötigen weiterhin eine Entscheidung zur Fassung und eine kurze Begründung. Eine fehlerhafte Datei blockiert das Speichern, bis sie ersetzt oder aus dem Import entfernt wurde.

Ältere Untersuchungen ohne Art erscheinen unter **Noch nicht zugeordnet**. In den Untersuchungsdetails können Patient, Aufenthalt und Art mit Begründung korrigiert werden. Frühere Angaben bleiben in der Historie erhalten.

## Untersuchung und Verlauf ansehen

In „Untersuchungen“ über „Ansehen“ eine Untersuchung öffnen. Unter „Importierte Angaben & Testergebnisse“ stehen alle Felder der gewählten CSV-Fassung in aufklappbaren Gruppen: demografische Angaben, Angaben zur Untersuchung und die einzelnen Tests. Die jeweilige Testversion, Bewertung/Eingabemodus, sämtliche Ergebnisse und Notizen bleiben zusammen. Auch Felder ohne Wert sind sichtbar: „Nicht überliefert“ ist etwas anderes als „Leer exportiert“. Originalfeldnamen stehen unter den lesbaren Bezeichnungen; zusätzliche/unbekannte Felder erscheinen unter „Weitere importierte Felder“. Es wird kein Test aufgrund eines vorhandenen Zahlenwerts als durchgeführt bewertet. Die „Technische Originalansicht“ zeigt zusätzlich die genauen Zellstatus; CSV-Fassungen und Herkunft bleiben darunter verfügbar.

Unter „Patienten“ den Anfang der iMed Patienten-ID tippen: die Trefferliste wird mit jedem Zeichen aktualisiert. Einen Treffer anklicken oder mit Pfeiltasten und Eingabetaste wählen; die vollständige ID muss nicht eingegeben werden. Jeder Treffer zeigt Anzahl und letztes bekanntes Datum der passenden Untersuchungen. Die Untersuchungsart grenzt die Treffer ein. Bei vielen Treffern werden zunächst 20 angezeigt. Escape schließt die Liste; weiteres Tippen öffnet sie wieder. Unter „Messwerte vergleichen“ liest „Exportierte Messwerte laden“ und prüft die Originalquellen für den gewählten Patienten. Fehlende Werte bleiben leer; manuelle Eingabe, Abbruch, Unvollständigkeit und exportierte Varianten werden gekennzeichnet. Die App bewertet oder berechnet keine klinischen Ergebnisse neu.

## Untersuchungen ausschließen und wieder einschließen

In der Untersuchungsübersicht „Datensatz ausschließen“ wählen. Dateien, Patientenzuordnung und alle Fassungen bleiben erhalten. Die Änderung wird im Verlauf gespeichert.

Unter „Untersuchungen“ den **Archivstatus → Nur ausgeschlossene** wählen. Die Untersuchung öffnen und „Datensatz wieder einschließen“ wählen. „Alle Untersuchungen“ zeigt beide Gruppen. Suche und Untersuchungsart lassen sich mit dem Status kombinieren. In der Patienten-Historie bleiben ausgeschlossene Untersuchungen gekennzeichnet sichtbar; „Messwerte vergleichen“ lässt sie aus.

Unter „Weitere Filter“ bietet „Messwert / Feld vorhanden“ numerische Leistungsfelder der aktuell gewählten CSV-Fassungen an, einschließlich unbekannter numerischer Felder. „Messwert suchen“ grenzt nach lesbarem Namen oder Originalfeld ein. Ein ausgewähltes Feld bleibt beim Suchen erhalten und kann über seinen Filter-Chip entfernt werden. Ein numerischer Wert einschließlich 0 zählt als vorhanden; dies bestätigt keine vollständige Testdurchführung. Notizen und Verwaltungsfelder bleiben in Details/CSV erhalten, sind aber keine Messwert-Filteroptionen.

## Sicherung und Wiederöffnung üben

Über „Sicherung & Hilfe“ unten in der Seitenleiste eine Sicherheitskopie in einem anderen leeren Ordner erstellen. Danach diese Kopie als Bibliothek öffnen. Patienten, Aufenthalte, Arten, Fassungen und Bericht-Verknüpfungen müssen erhalten sein.

Sie können außerdem alle Browser-Sitedaten löschen und anschließend denselben Bibliotheksordner wieder auswählen. Die Daten werden aus dem Ordner rekonstruiert. Die Suchübersicht ist ersetzbar; „Bibliothek prüfen“ kontrolliert alle Originaldateien und gespeicherten Vorgänge vollständig.

## Später an IT übergeben

Auf dem Entwicklungs-Mac:

```sh
npm run export:hospital
```

Der neue Ordner unter `releases/` enthält getrennte ZIPs für die statische Anwendung, den passenden Quellcode und das synthetische Krankenhaus-Testpaket, SHA-256-Prüfsummen sowie Versions-/Testinformationen. Nur die statische Anwendung gehört ins freigegebene Web-Verzeichnis. Das Testpaket enthält ausschließlich eine neu erzeugte erfundene Übungsbibliothek; vorhandene Archive und private Übungsordner werden nie eingepackt. Die Krankenhausprüfung erfolgt bei einem späteren, gelegentlichen Testlauf.

## Messwerte vergleichen und CSV exportieren

Unter „Patienten“ die ID beginnen und einen Treffer auswählen. „Messwerte vergleichen“ startet mit „Alle Messwerte“, dem ersten Eintrag der Auswahl. Nach „Exportierte Messwerte laden“ steht jeder passende numerische Messwert in einer Zeile; jede eingeschlossene, zur Art passende Untersuchung hat eine eigene Spalte. Über die Suche lassen sich die Liste und die Zeilen der Gesamtansicht eingrenzen. Ein einzelner Messwert kann weiterhin ausgewählt werden. „Exportierte Messwerte laden“ liest die unveränderten Originalwerte; Notizen und Verwaltungsfelder erscheinen nicht in der Messwertauswahl. Die gleiche Auswahlregel gilt für den Filter „Messwert / Feld vorhanden“ unter „Untersuchungen“.

Für einen CSV-Export die gewünschten Zeilen mit Häkchen auswählen oder „Alle gefilterten Treffer auswählen“ verwenden. Das wählt auch Treffer auf anderen Seiten bzw. jenseits der ersten 20 Patienten. „Exportiere als CSV“ lädt die Datei über den normalen Browser-Download herunter. Die Auswahl bleibt beim Filtern erhalten; die App nennt auch ausgewählte Einträge außerhalb der aktuellen Filter. „Auswahl aufheben“ entfernt alle Häkchen.

Untersuchungsexport: genau die ausgewählten Untersuchungen. Patientexport: alle Untersuchungen der ausgewählten Patienten, einschließlich ausgeschlossener und anderer Untersuchungsarten. Jede Zeile enthält IDs, Datum/Art, Archivstatus und alle ursprünglichen CSV-Felder der gewählten Fassung, auch Notizen. `archive.excluded` ist `1` für ausgeschlossen und `0` für eingeschlossen. Der Export verändert die Bibliothek nicht.

Beim Öffnen in Excel über **Daten → Aus Text/CSV** die Patient-/Aufenthalts-IDs als **Text** importieren, damit Excel führende Nullen nicht selbst entfernt. Die Datei verwendet UTF-8 und Semikolons. Details zu Spalten und Leerwerten stehen in [CSV-EXPORT.md](CSV-EXPORT.md). Für eine vollständige Wiederherstellung weiterhin „Sicherung erstellen“ verwenden; der Tabellenexport enthält keine PDF-Dateien und keine früheren Fassungen.

## Nach dem Import

„Import abgeschlossen“ bleibt sichtbar und zeigt IDs, gespeicherte CSV/PDF-Dateien, neue Untersuchungen/zusätzliche Fassungen und übersprungene Duplikate. Direkt darunter können Sie die Untersuchung oder den Bericht öffnen. „Nächsten Patienten importieren“ beginnt ohne die vorherigen Dateien und IDs. Bei mehreren PDFs erscheint eine kurze Auswahl; fehlende PDFs sind als „Kein PDF“ markiert. Diese direkten Berichtsaktionen stehen auch in Untersuchungsliste und Patientenverlauf.

Die Messwertlisten sind nach Test gruppiert. Zu jedem bekannten Leistungsfeld gibt es einen lesbaren Namen und den unveränderten CSV-Feldnamen. Die Suche findet beides. Unbekannte neue Felder stehen unter „Weitere Felder“.

## Nur ansehen, bearbeiten und aktualisieren

Beim Öffnen wird noch keine Schreibsperre belegt. Über den Knopf „Ansichts-Modus“ oben neben dem Bibliotheksnamen wechseln Sie nach Bestätigung im Popup in den „Bearbeitungs-Modus“. Ohne Häkchen bleibt „Fortfahren“ gesperrt. „Abbrechen“ oder Escape aktiviert keine Bearbeitung. Ein Klick auf den roten Knopf „Bearbeitungs-Modus“ schaltet zurück in den „Ansichts-Modus“ und gibt die Sperre frei; nicht gespeicherte Importdateien müssen dabei ausdrücklich verworfen werden. Andere Leser können geöffnet bleiben. Nach Änderungen durch eine andere Person das Aktualisieren-Symbol oben neben dem Modusknopf verwenden („Ansicht aktualisieren“); das lädt die Übersicht neu. Ein noch offener Import wird dabei neu geprüft und die Bestätigung eines vorhandenen Patienten muss erneut erfolgen. Die vollständige Dateiprüfung bleibt unter „Sicherung & Hilfe“.

## Wenn Speichern unterbrochen wird

Die App zeigt dauerhaft „Nicht gespeichert“ oder „Speicherstand noch unklar“ und sperrt erneutes Speichern. Zuerst die Laufwerksverbindung wiederherstellen, dann **„Verbindung erneut prüfen“** wählen. Die Prüfung benutzt denselben Ordner, ohne ihn noch einmal auszuwählen. Bei verlorenem Zugriff gibt es zusätzlich „Bibliotheksordner erneut auswählen“; eine andere Bibliothek wird abgewiesen.

Ist der genaue Vorgang vollständig angekommen, wird er bestätigt und der Importabschluss angezeigt, ohne erneut zu speichern. Ist er im jetzt geprüften Stand nicht vorhanden, Dateien/IDs neu prüfen und den „Bearbeitungs-Modus“ im Popup erneut bestätigen. Beschädigte oder uneindeutige Stände bleiben gesperrt; unter „Sicherung & Hilfe“ die Hinweise lesen und IT hinzuziehen. Die App löscht oder repariert dabei keine Dateien. Nach einem Browser-Neustart die Bibliothek wieder öffnen und vorhandene Vorgänge/Duplikate prüfen; nicht gespeicherte Dateiauswahlen bleiben nicht im Browser erhalten.

## Gelegentlicher Krankenhaustest

`npm run export:hospital` erzeugt zusätzlich `hospital-test-kit.zip`. Entpacken und **TESTPLAN.html** lokal im Browser öffnen; das ist ein druckbares Dokument, die App selbst wird über HTTPS geöffnet. IT stellt die exakt passende Anwendung aus `static-application.zip` bereit. `IT-PROTOKOLL.html` und `FREEZE.json` halten Testversion und Ergebnisse nachvollziehbar fest. Alle Übungen sind erfunden; die enthaltene Übungsbibliothek bleibt getrennt vom echten Archiv und vom Hosting.

## Startseite

Das Logo links oben führt jederzeit zur Startseite. Ohne geöffnete Bibliothek gibt es dort den direkten Weg zu „Bibliothek öffnen“. Mit Bibliothek sehen Sie die Gesamtzahl der Patienten und Untersuchungen. Ausgeschlossene Untersuchungen sind mitgezählt und zusätzlich kenntlich gemacht; CSV-Fassungen zählen nicht als weitere Untersuchungen. Die Karten öffnen die vollständigen Listen ohne vorherige Such-/Typ-/Statusfilter. Über „Ansicht aktualisieren“ lassen sich Änderungen anderer Bearbeiter nachladen.

## Logo und Verknüpfungssymbol

Das bereitgestellte rote Bild ist jetzt das Logo links oben und führt wie bisher zur Startseite. Dieselbe Grafik wird als Favicon, Touch-Symbol und in den Symbolangaben für Browser-/Desktopverknüpfungen mitgeliefert. Die App bleibt ein normaler Browseraufruf; eine Installation ist nicht nötig. Beim späteren Krankenhaustest eine neue Verknüpfung aus dem tatsächlichen Edge/HTTPS-Aufruf anlegen und ihr Symbol prüfen. Bereits vorhandene Verknüpfungen können ein zuvor gespeichertes Symbol behalten.
