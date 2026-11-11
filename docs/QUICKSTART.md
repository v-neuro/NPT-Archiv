# Auf dem Mac ausprobieren · Version 0.2.0

Die App bleibt während der Entwicklung auf dem privaten Mac. Verwenden Sie ausschließlich erfundene Daten. Ein Krankenhauszugang ist für diese Übungen nicht nötig.

## Eine Übungsbibliothek öffnen

1. In Chrome oder Edge `http://127.0.0.1:5186` öffnen. Nach einem Update mit `⌘⇧R` neu laden.
2. „Meine Bibliothek öffnen“ wählen und den Unterordner **Bibliothek** aus der erzeugten Übung auswählen. Der letzte Übungspfad steht in `test-results/demo-latest.json`.
3. Bestätigen, dass Sie die Bibliothek allein bearbeiten. Sie können jetzt suchen, nach Untersuchungsart filtern und Patientenverläufe ansehen.

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

## Neue Dateien übernehmen

1. **Dateien auswählen:** Unter „Importieren“ CSV und PDF auswählen. Für die Übung liegen sie im Unterordner **Importuebung**.
2. **Zuordnen & prüfen:** Für jede CSV Patient, Aufenthalt und Untersuchungsart wählen. Die Datei selbst enthält keine sichere Patienten-ID. Neue Patienten können hier hinzugefügt werden. Gehören mehrere neue Untersuchungen zusammen, lassen sich Angaben ausdrücklich gemeinsam übertragen; jede Datei wird trotzdem einzeln bestätigt.
3. **Gemeinsam speichern:** Die Zusammenfassung zeigt, was noch fehlt. Eine Untersuchungsart ist Pflicht. Bereits vorhandene Dateien werden ausgelassen. Erst nach dem Speichern erscheint die Bestätigung.

Die erfundenen Zuordnungen der Übung stehen in **ZUORDNUNGSHILFE.json**. Die identische und die geänderte CSV derselben Sitzung nacheinander ausprobieren. Die absichtlich fehlerhafte Datei soll abgewiesen werden. Für einen PDF-Bericht eine Untersuchung wählen oder die Zuordnung bewusst offen lassen. Ein passender Dateiname ist nur ein Hinweis.

Ältere Untersuchungen ohne Art erscheinen unter **Noch nicht zugeordnet**. In den Untersuchungsdetails können Patient, Aufenthalt und Art mit Begründung korrigiert werden. Frühere Angaben bleiben in der Historie erhalten.

## Untersuchung und Verlauf ansehen

In „Untersuchungen“ eine Untersuchung öffnen. Zuerst erscheinen Originalberichte, ausgewählte unveränderte Exportwerte und Notizen. CSV-Fassungen, sämtliche Originalfelder und Herkunft stehen in den aufklappbaren Abschnitten.

Unter „Patienten“ nach ID/Kürzel suchen und nach Untersuchungsart filtern. „Exportierte Messwerte laden“ liest und prüft die Originalquellen für den gewählten Patienten. Fehlende Werte bleiben leer; manuelle Eingabe, Abbruch, Unvollständigkeit und exportierte Varianten werden gekennzeichnet. Die App bewertet oder berechnet keine klinischen Ergebnisse neu.

## Sicherung und Wiederöffnung üben

Unter „Sicherung & Hilfe“ eine Sicherheitskopie in einem anderen leeren Ordner erstellen. Danach diese Kopie als Bibliothek öffnen. Patienten, Aufenthalte, Arten, Fassungen und Bericht-Verknüpfungen müssen erhalten sein.

Sie können außerdem alle Browser-Sitedaten löschen und anschließend denselben Bibliotheksordner wieder auswählen. Die Daten werden aus dem Ordner rekonstruiert. Die Suchübersicht ist ersetzbar; „Bibliothek prüfen & Übersicht erneuern“ kontrolliert alle Originaldateien und gespeicherten Vorgänge vollständig.

## Später an IT übergeben

Auf dem Entwicklungs-Mac:

```sh
npm run export:hospital
```

Der neue Ordner unter `releases/` enthält getrennte ZIPs für die statische Anwendung und den passenden Quellcode, SHA-256-Prüfsummen sowie Versions-/Testinformationen. Nur die statische Anwendung gehört ins freigegebene Web-Verzeichnis. Patientenarchive und erzeugte Übungsbibliotheken sind in keinem der ZIPs enthalten. Die Krankenhausprüfung erfolgt bei einem späteren, gelegentlichen Testlauf.
