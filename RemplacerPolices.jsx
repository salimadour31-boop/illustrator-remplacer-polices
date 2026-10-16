//@target illustrator
/*
 * RemplacerPolices.jsx  —  v1.0.0
 * ----------------------------------------------------------------------------
 * FR : Remplacement en masse des polices dans un document Illustrator.
 *      Portée : document entier, calque actif, ou sélection.
 *      Liste les polices réellement utilisées, choisit source → cible,
 *      bouton Analyser (compte sans modifier), puis Appliquer.
 *      Ignore textes / calques verrouillés ou masqués.
 *      Option : mettre à jour aussi les styles de caractère / paragraphe
 *      qui référencent la police source (si l'API le permet).
 * EN : Bulk font replacement in an Illustrator document.
 *      Scope: entire document, active layer, or selection.
 *      Lists fonts actually used, picks source → target,
 *      Analyze button (count without changing), then Apply.
 *      Skips locked / hidden text frames and layers.
 *      Option: also update character / paragraph styles that reference
 *      the source font (when the API allows).
 *
 * Cible / Target : Illustrator CC 2018–2026
 * Statut / Status : NON TESTÉ DANS ILLUSTRATOR — syntaxe ES3 vérifiée (acorn).
 *                   NOT TESTED IN ILLUSTRATOR — ES3 syntax checked (acorn).
 * Annulation / Undo : toutes les modifications sont faites dans un seul
 *      passage script ; Illustrator annule souvent le script entier avec
 *      un seul Ctrl+Z / Cmd+Z (pas de beginUndoGroup fiable partout).
 *      All changes run in one script pass; Illustrator often undoes the
 *      whole script with one Ctrl+Z / Cmd+Z (no reliable beginUndoGroup).
 * Conseil : travaillez sur une copie de votre fichier.
 * Tip     : work on a copy of your file.
 * Aucune connexion réseau, aucune collecte de données.
 * No network access, no data collection.
 *
 * Licence MIT — (c) 2026 Amirouche Amwanes. Code original.
 */

(function () {

    var VERSION = "1.0.0";

    // ------------------------------------------------------------------
    // Langue / Language
    // ------------------------------------------------------------------
    var FR = String($.locale || app.locale || "").toLowerCase().indexOf("fr") === 0;
    function t(fr, en) { return FR ? fr : en; }

    // ------------------------------------------------------------------
    // Garde-fous / Guards
    // ------------------------------------------------------------------
    if (app.documents.length === 0) {
        alert(t("Aucun document ouvert.\nOuvrez un document puis relancez le script.",
                "No document open.\nOpen a document and run the script again."));
        return;
    }

    var doc = app.activeDocument;

    // ------------------------------------------------------------------
    // Utilitaires calques / Layer helpers (ES3)
    // ------------------------------------------------------------------

    /**
     * Calque ou ancêtre verrouillé ?
     * Is the layer or any ancestor locked?
     */
    function isLayerLocked(layer) {
        var L = layer;
        while (L) {
            try {
                if (L.locked) { return true; }
            } catch (eLock) { /* ignore */ }
            try {
                L = L.parent;
                if (!L || L.typename === "Document") { break; }
                if (L.typename !== "Layer") { break; }
            } catch (ePar) {
                break;
            }
        }
        return false;
    }

    /**
     * Calque ou ancêtre masqué ?
     * Is the layer or any ancestor hidden?
     */
    function isLayerHidden(layer) {
        var L = layer;
        while (L) {
            try {
                if (!L.visible) { return true; }
            } catch (eVis) { /* ignore */ }
            try {
                L = L.parent;
                if (!L || L.typename === "Document") { break; }
                if (L.typename !== "Layer") { break; }
            } catch (ePar2) {
                break;
            }
        }
        return false;
    }

    /**
     * TextFrame modifiable (non verrouillé, calque visible et non verrouillé).
     * Whether a TextFrame can be edited.
     */
    function isFrameEditable(tf) {
        try {
            if (tf.locked) { return false; }
        } catch (e1) { return false; }
        try {
            if (tf.hidden) { return false; }
        } catch (eHid) { /* certaines versions n'exposent pas .hidden */ }
        try {
            if (isLayerLocked(tf.layer)) { return false; }
            if (isLayerHidden(tf.layer)) { return false; }
        } catch (e2) { return false; }
        return true;
    }

    // ------------------------------------------------------------------
    // Collecte TextFrame / TextFrame collection
    // ------------------------------------------------------------------

    function collectTextFramesFromItem(item, out) {
        if (!item) { return; }
        var tn;
        try { tn = item.typename; } catch (eTn) { return; }

        if (tn === "TextFrame") {
            out.push(item);
            return;
        }
        if (tn === "GroupItem") {
            var gItems = item.pageItems;
            var gi;
            for (gi = 0; gi < gItems.length; gi++) {
                collectTextFramesFromItem(gItems[gi], out);
            }
            return;
        }
    }

    function collectTextFramesFromLayer(layer, out) {
        var i;
        var items = layer.pageItems;
        for (i = 0; i < items.length; i++) {
            collectTextFramesFromItem(items[i], out);
        }
        var subs = layer.layers;
        for (i = 0; i < subs.length; i++) {
            collectTextFramesFromLayer(subs[i], out);
        }
    }

    function getSelectionArray() {
        var s = doc.selection;
        var out = [];
        if (!s) { return out; }
        if (s.typename) { return out; }
        var i;
        for (i = 0; i < s.length; i++) {
            out.push(s[i]);
        }
        return out;
    }

    /**
     * TextFrames selon la portée.
     * TextFrames for the chosen scope.
     * scopeKey : "document" | "layer" | "selection"
     */
    function getTargetFrames(scopeKey) {
        var frames = [];
        var i;

        if (scopeKey === "document") {
            var all = doc.textFrames;
            for (i = 0; i < all.length; i++) {
                frames.push(all[i]);
            }
            return frames;
        }

        if (scopeKey === "layer") {
            collectTextFramesFromLayer(doc.activeLayer, frames);
            return frames;
        }

        var sel = getSelectionArray();
        if (sel.length === 0) { return frames; }
        for (i = 0; i < sel.length; i++) {
            collectTextFramesFromItem(sel[i], frames);
        }
        var unique = [];
        var j;
        var seen;
        for (i = 0; i < frames.length; i++) {
            seen = false;
            for (j = 0; j < unique.length; j++) {
                if (unique[j] === frames[i]) { seen = true; break; }
            }
            if (!seen) { unique.push(frames[i]); }
        }
        return unique;
    }

    // ------------------------------------------------------------------
    // Polices / Fonts
    // ------------------------------------------------------------------

    /**
     * Clé stable d'une TextFont (nom PostScript / interne).
     * Stable key for a TextFont (internal / PostScript name).
     */
    function fontKey(font) {
        if (!font) { return ""; }
        try {
            return String(font.name);
        } catch (eN) {
            return "";
        }
    }

    /**
     * Libellé affichable : famille + style si disponibles.
     * Display label: family + style when available.
     */
    function fontLabel(font) {
        if (!font) { return ""; }
        var fam = "";
        var sty = "";
        var nam = "";
        try { fam = String(font.family); } catch (eF) { fam = ""; }
        try { sty = String(font.style); } catch (eS) { sty = ""; }
        try { nam = String(font.name); } catch (eN2) { nam = ""; }
        if (fam && sty) { return fam + " — " + sty; }
        if (fam) { return fam; }
        return nam;
    }

    /**
     * Récupère la TextFont d'un caractère (ou null).
     * Get TextFont of a character (or null).
     */
    function getCharFont(ch) {
        try {
            return ch.characterAttributes.textFont;
        } catch (e) {
            return null;
        }
    }

    /**
     * Polices réellement utilisées dans les cadres (éditable + non éditable).
     * Fonts actually used in the frames (editable + non-editable).
     * Retourne tableau d'objets { key, label, font } trié par label.
     */
    function collectUsedFonts(frames) {
        var map = {};
        var list = [];
        var i, j, tf, chars, ch, f, key, lab;

        for (i = 0; i < frames.length; i++) {
            tf = frames[i];
            try {
                chars = tf.textRange.characters;
            } catch (eTr) {
                continue;
            }
            for (j = 0; j < chars.length; j++) {
                try {
                    ch = chars[j];
                    f = getCharFont(ch);
                    key = fontKey(f);
                    if (!key) { continue; }
                    if (!map[key]) {
                        lab = fontLabel(f);
                        map[key] = true;
                        list.push({ key: key, label: lab, font: f });
                    }
                } catch (eCh) {
                    /* caractère inaccessible */
                }
            }
        }

        list.sort(function (a, b) {
            var la = a.label.toLowerCase();
            var lb = b.label.toLowerCase();
            if (la < lb) { return -1; }
            if (la > lb) { return 1; }
            return 0;
        });
        return list;
    }

    /**
     * Construit l'index des polices installées (app.textFonts).
     * Build index of installed fonts (app.textFonts).
     * Retourne { byKey: {}, families: [noms], stylesByFamily: { fam: [{style, font, key, label}] } }
     */
    function buildInstalledFontIndex() {
        var byKey = {};
        var families = [];
        var famSeen = {};
        var stylesByFamily = {};
        var i, f, key, fam, sty, lab, entry;

        var all;
        try {
            all = app.textFonts;
        } catch (eAll) {
            return { byKey: byKey, families: families, stylesByFamily: stylesByFamily };
        }

        for (i = 0; i < all.length; i++) {
            try {
                f = all[i];
                key = fontKey(f);
                if (!key) { continue; }
                byKey[key] = f;
                try { fam = String(f.family); } catch (eFam) { fam = key; }
                try { sty = String(f.style); } catch (eSty) { sty = ""; }
                if (!fam) { fam = key; }
                if (!famSeen[fam]) {
                    famSeen[fam] = true;
                    families.push(fam);
                    stylesByFamily[fam] = [];
                }
                lab = fontLabel(f);
                entry = { style: sty || "(Regular)", font: f, key: key, label: lab };
                stylesByFamily[fam].push(entry);
            } catch (eOne) {
                /* police inaccessible */
            }
        }

        families.sort(function (a, b) {
            var la = a.toLowerCase();
            var lb = b.toLowerCase();
            if (la < lb) { return -1; }
            if (la > lb) { return 1; }
            return 0;
        });

        return { byKey: byKey, families: families, stylesByFamily: stylesByFamily };
    }

    /**
     * Résout une TextFont cible depuis clés / famille+style / nom.
     * Resolve a target TextFont from key / family+style / name.
     */
    function resolveTargetFont(installed, familyName, styleName, typedName) {
        var i, f, key, fam, sty;
        var typed = typedName ? String(typedName).replace(/^\s+|\s+$/g, "") : "";

        if (typed) {
            if (installed.byKey[typed]) {
                return installed.byKey[typed];
            }
            try {
                return app.textFonts.getByName(typed);
            } catch (eGet) { /* suite */ }
            for (key in installed.byKey) {
                if (!installed.byKey.hasOwnProperty(key)) { continue; }
                f = installed.byKey[key];
                try { fam = String(f.family); } catch (e1) { fam = ""; }
                try { sty = String(f.style); } catch (e2) { sty = ""; }
                if (fontLabel(f).toLowerCase() === typed.toLowerCase()) { return f; }
                if (key.toLowerCase() === typed.toLowerCase()) { return f; }
                if (fam && sty && (fam + " " + sty).toLowerCase() === typed.toLowerCase()) { return f; }
            }
        }

        if (familyName && installed.stylesByFamily[familyName]) {
            var arr = installed.stylesByFamily[familyName];
            if (styleName) {
                for (i = 0; i < arr.length; i++) {
                    if (arr[i].style === styleName) { return arr[i].font; }
                }
            }
            if (arr.length > 0) { return arr[0].font; }
        }

        return null;
    }

    // ------------------------------------------------------------------
    // Analyse / remplacement
    // Analyze / replace
    // ------------------------------------------------------------------

    /**
     * Compte ou remplace les caractères dont la police = sourceKey.
     * Count or replace characters whose font matches sourceKey.
     * mode : "count" | "replace"
     * Retourne { framesTotal, framesHit, framesIgnored, runs, chars, stylesUpdated, errors }
     */
    function processFonts(frames, sourceKey, targetFont, mode, updateStyles) {
        var result = {
            framesTotal: frames.length,
            framesHit: 0,
            framesIgnored: 0,
            runs: 0,
            chars: 0,
            stylesUpdated: 0,
            errors: 0
        };

        if (!sourceKey) { return result; }

        var i, j, tf, chars, ch, f, key, inRun, frameHad;

        for (i = 0; i < frames.length; i++) {
            tf = frames[i];

            if (!isFrameEditable(tf)) {
                result.framesIgnored++;
                continue;
            }

            try {
                chars = tf.textRange.characters;
            } catch (eTr) {
                result.framesIgnored++;
                continue;
            }

            frameHad = false;
            inRun = false;

            for (j = 0; j < chars.length; j++) {
                try {
                    ch = chars[j];
                    f = getCharFont(ch);
                    key = fontKey(f);
                    if (key === sourceKey) {
                        result.chars++;
                        if (!inRun) {
                            result.runs++;
                            inRun = true;
                        }
                        frameHad = true;
                        if (mode === "replace" && targetFont) {
                            try {
                                ch.characterAttributes.textFont = targetFont;
                            } catch (eSet) {
                                result.errors++;
                            }
                        }
                    } else {
                        inRun = false;
                    }
                } catch (eCh) {
                    inRun = false;
                    result.errors++;
                }
            }

            if (frameHad) { result.framesHit++; }
        }

        // Styles de caractère / paragraphe (limite documentée)
        // Character / paragraph styles (documented limit)
        if (updateStyles && mode === "replace" && targetFont) {
            result.stylesUpdated += updateStyleCollection(doc.characterStyles, sourceKey, targetFont);
            result.stylesUpdated += updateStyleCollection(doc.paragraphStyles, sourceKey, targetFont);
        } else if (updateStyles && mode === "count") {
            result.stylesUpdated += countStyleCollection(doc.characterStyles, sourceKey);
            result.stylesUpdated += countStyleCollection(doc.paragraphStyles, sourceKey);
        }

        return result;
    }

    /**
     * Met à jour textFont sur une collection de styles (characterStyles / paragraphStyles).
     * Update textFont on a style collection.
     * Limite : seuls les attributs de police du style sont touchés ; les overrides
     * locaux dans le texte sont gérés par la boucle caractères ci-dessus.
     * Limit: only the style's own font attribute is changed; local overrides
     * in text are handled by the character loop above.
     */
    function updateStyleCollection(styles, sourceKey, targetFont) {
        var n = 0;
        var i, st, f, key;
        if (!styles) { return 0; }
        try {
            for (i = 0; i < styles.length; i++) {
                try {
                    st = styles[i];
                    // [NormalCharacterStyle] / styles système : tenter quand même
                    f = st.characterAttributes.textFont;
                    key = fontKey(f);
                    if (key === sourceKey) {
                        st.characterAttributes.textFont = targetFont;
                        n++;
                    }
                } catch (eSt) {
                    /* style non modifiable (système / protégé) */
                }
            }
        } catch (eCol) { /* collection absente */ }
        return n;
    }

    function countStyleCollection(styles, sourceKey) {
        var n = 0;
        var i, st, f, key;
        if (!styles) { return 0; }
        try {
            for (i = 0; i < styles.length; i++) {
                try {
                    st = styles[i];
                    f = st.characterAttributes.textFont;
                    key = fontKey(f);
                    if (key === sourceKey) { n++; }
                } catch (eSt2) { /* ignore */ }
            }
        } catch (eCol2) { /* ignore */ }
        return n;
    }

    // ------------------------------------------------------------------
    // Dialogue ScriptUI
    // ------------------------------------------------------------------

    function buildDialog() {
        var installed = buildInstalledFontIndex();
        var usedFonts = [];
        var sourceKeys = [];

        var w = new Window("dialog", t("Remplacer les polices", "Replace Fonts") + "  v" + VERSION);
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        w.margins = 16;
        w.spacing = 10;

        // Langue
        var langGrp = w.add("group");
        langGrp.orientation = "row";
        langGrp.alignChildren = ["left", "center"];
        var langLbl = langGrp.add("statictext", undefined, t("Langue :", "Language:"));
        var radioFR = langGrp.add("radiobutton", undefined, "FR");
        var radioEN = langGrp.add("radiobutton", undefined, "EN");
        if (FR) { radioFR.value = true; } else { radioEN.value = true; }

        // Portée
        var scopePanel = w.add("panel", undefined, t("Portée", "Scope"));
        scopePanel.orientation = "column";
        scopePanel.alignChildren = ["left", "top"];
        scopePanel.margins = 12;
        var scopeDoc = scopePanel.add("radiobutton", undefined, t("Document entier", "Entire document"));
        var scopeLayer = scopePanel.add("radiobutton", undefined, t("Calque actif", "Active layer"));
        var scopeSel = scopePanel.add("radiobutton", undefined, t("Sélection (textes sélectionnés ou contenus)", "Selection (selected or nested text)"));
        scopeDoc.value = true;

        // Police source
        var srcPanel = w.add("panel", undefined, t("Police source (utilisée dans la portée)", "Source font (used in scope)"));
        srcPanel.orientation = "column";
        srcPanel.alignChildren = ["fill", "top"];
        srcPanel.margins = 12;
        var srcRow = srcPanel.add("group");
        srcRow.orientation = "row";
        srcRow.alignChildren = ["left", "center"];
        var srcLbl = srcRow.add("statictext", undefined, t("Source :", "Source:"));
        srcLbl.preferredSize.width = 70;
        var srcDrop = srcRow.add("dropdownlist", undefined, [t("(Analyser d'abord)", "(Analyze first)")]);
        srcDrop.preferredSize.width = 320;
        srcDrop.selection = 0;
        var btnRefresh = srcPanel.add("button", undefined, t("Actualiser la liste des polices utilisées", "Refresh used-fonts list"));

        // Police cible
        var tgtPanel = w.add("panel", undefined, t("Police cible (installée)", "Target font (installed)"));
        tgtPanel.orientation = "column";
        tgtPanel.alignChildren = ["fill", "top"];
        tgtPanel.margins = 12;

        var famRow = tgtPanel.add("group");
        famRow.orientation = "row";
        famRow.alignChildren = ["left", "center"];
        var famLbl = famRow.add("statictext", undefined, t("Famille :", "Family:"));
        famLbl.preferredSize.width = 70;
        var famDrop = famRow.add("dropdownlist", undefined, installed.families.length ? installed.families : ["(aucune)"]);
        famDrop.preferredSize.width = 320;
        if (installed.families.length) { famDrop.selection = 0; }

        var styRow = tgtPanel.add("group");
        styRow.orientation = "row";
        styRow.alignChildren = ["left", "center"];
        var styLbl = styRow.add("statictext", undefined, t("Style :", "Style:"));
        styLbl.preferredSize.width = 70;
        var styDrop = styRow.add("dropdownlist", undefined, ["(Regular)"]);
        styDrop.preferredSize.width = 320;
        styDrop.selection = 0;

        var nameRow = tgtPanel.add("group");
        nameRow.orientation = "row";
        nameRow.alignChildren = ["left", "center"];
        var nameLbl = nameRow.add("statictext", undefined, t("Ou nom :", "Or name:"));
        nameLbl.preferredSize.width = 70;
        var nameEdit = nameRow.add("edittext", undefined, "");
        nameEdit.characters = 36;
        var nameHint = tgtPanel.add("statictext", undefined,
            t("Nom interne / PostScript optionnel (prioritaire si rempli).",
              "Optional internal / PostScript name (wins if filled)."),
            { multiline: true });
        nameHint.preferredSize.width = 400;

        function refillStyles() {
            styDrop.removeAll();
            var fam = famDrop.selection ? String(famDrop.selection.text) : "";
            var arr = (fam && installed.stylesByFamily[fam]) ? installed.stylesByFamily[fam] : [];
            var i;
            if (arr.length === 0) {
                styDrop.add("item", "(Regular)");
                styDrop.selection = 0;
                return;
            }
            for (i = 0; i < arr.length; i++) {
                styDrop.add("item", arr[i].style);
            }
            styDrop.selection = 0;
        }
        refillStyles();
        famDrop.onChange = refillStyles;

        // Options
        var optPanel = w.add("panel", undefined, t("Options", "Options"));
        optPanel.orientation = "column";
        optPanel.alignChildren = ["left", "top"];
        optPanel.margins = 12;
        var stylesCb = optPanel.add("checkbox", undefined,
            t("Mettre à jour aussi les styles de caractère / paragraphe liés",
              "Also update linked character / paragraph styles"));
        stylesCb.value = true;
        var limNote = optPanel.add("statictext", undefined,
            t("Limite : les styles système protégés peuvent être ignorés ; les remplacements locaux passent par les caractères.",
              "Limit: protected system styles may be skipped; local overrides go through characters."),
            { multiline: true });
        limNote.preferredSize.width = 420;

        var note = w.add("statictext", undefined,
            t("Conseil : travaillez sur une copie. Annulation : souvent un seul Ctrl+Z pour tout le script.",
              "Tip: work on a copy. Undo: often one Ctrl+Z for the whole script."),
            { multiline: true });
        note.preferredSize.width = 420;

        var statusTxt = w.add("statictext", undefined, t("Prêt.", "Ready."), { multiline: true });
        statusTxt.preferredSize.width = 420;

        // Boutons
        var btnGrp = w.add("group");
        btnGrp.orientation = "row";
        btnGrp.alignment = ["center", "top"];
        var btnAnalyze = btnGrp.add("button", undefined, t("Analyser", "Analyze"));
        var btnApply = btnGrp.add("button", undefined, t("Appliquer", "Apply"));
        var btnClose = btnGrp.add("button", undefined, t("Fermer", "Close"), { name: "cancel" });

        function currentScope() {
            if (scopeLayer.value) { return "layer"; }
            if (scopeSel.value) { return "selection"; }
            return "document";
        }

        function refillSourceDrop(list) {
            srcDrop.removeAll();
            sourceKeys = [];
            usedFonts = list;
            var i;
            if (!list || list.length === 0) {
                srcDrop.add("item", t("(aucune police trouvée)", "(no font found)"));
                srcDrop.selection = 0;
                return;
            }
            for (i = 0; i < list.length; i++) {
                srcDrop.add("item", list[i].label + "  [" + list[i].key + "]");
                sourceKeys.push(list[i].key);
            }
            srcDrop.selection = 0;
        }

        function getSelectedSourceKey() {
            if (!srcDrop.selection) { return ""; }
            var idx = srcDrop.selection.index;
            if (idx < 0 || idx >= sourceKeys.length) { return ""; }
            return sourceKeys[idx];
        }

        function getTargetFont() {
            var fam = famDrop.selection ? String(famDrop.selection.text) : "";
            var sty = styDrop.selection ? String(styDrop.selection.text) : "";
            return resolveTargetFont(installed, fam, sty, nameEdit.text);
        }

        function refreshUsedList() {
            var frames = getTargetFrames(currentScope());
            if (frames.length === 0) {
                refillSourceDrop([]);
                statusTxt.text = t("Aucun TextFrame dans la portée.", "No TextFrame in scope.");
                alert(t("Aucun bloc de texte (TextFrame) trouvé dans la portée choisie.",
                        "No text frame (TextFrame) found in the selected scope."));
                return frames;
            }
            var list = collectUsedFonts(frames);
            refillSourceDrop(list);
            statusTxt.text = t(
                "TextFrames : " + frames.length + " — polices distinctes : " + list.length,
                "TextFrames: " + frames.length + " — distinct fonts: " + list.length
            );
            return frames;
        }

        function refreshLabels() {
            w.text = t("Remplacer les polices", "Replace Fonts") + "  v" + VERSION;
            langLbl.text = t("Langue :", "Language:");
            scopePanel.text = t("Portée", "Scope");
            scopeDoc.text = t("Document entier", "Entire document");
            scopeLayer.text = t("Calque actif", "Active layer");
            scopeSel.text = t("Sélection (textes sélectionnés ou contenus)", "Selection (selected or nested text)");
            srcPanel.text = t("Police source (utilisée dans la portée)", "Source font (used in scope)");
            srcLbl.text = t("Source :", "Source:");
            btnRefresh.text = t("Actualiser la liste des polices utilisées", "Refresh used-fonts list");
            tgtPanel.text = t("Police cible (installée)", "Target font (installed)");
            famLbl.text = t("Famille :", "Family:");
            styLbl.text = t("Style :", "Style:");
            nameLbl.text = t("Ou nom :", "Or name:");
            nameHint.text = t("Nom interne / PostScript optionnel (prioritaire si rempli).",
                              "Optional internal / PostScript name (wins if filled).");
            optPanel.text = t("Options", "Options");
            stylesCb.text = t("Mettre à jour aussi les styles de caractère / paragraphe liés",
                              "Also update linked character / paragraph styles");
            limNote.text = t("Limite : les styles système protégés peuvent être ignorés ; les remplacements locaux passent par les caractères.",
                             "Limit: protected system styles may be skipped; local overrides go through characters.");
            note.text = t("Conseil : travaillez sur une copie. Annulation : souvent un seul Ctrl+Z pour tout le script.",
                          "Tip: work on a copy. Undo: often one Ctrl+Z for the whole script.");
            btnAnalyze.text = t("Analyser", "Analyze");
            btnApply.text = t("Appliquer", "Apply");
            btnClose.text = t("Fermer", "Close");
        }

        radioFR.onClick = function () { FR = true; refreshLabels(); };
        radioEN.onClick = function () { FR = false; refreshLabels(); };

        btnRefresh.onClick = function () {
            refreshUsedList();
        };

        btnAnalyze.onClick = function () {
            var frames = refreshUsedList();
            if (!frames || frames.length === 0) { return; }

            var srcKey = getSelectedSourceKey();
            if (!srcKey) {
                alert(t("Choisissez une police source dans la liste.",
                        "Choose a source font from the list."));
                return;
            }

            var tgt = getTargetFont();
            var r = processFonts(frames, srcKey, null, "count", stylesCb.value);
            var msg = t(
                "Analyse (sans modification)\n" +
                    "Police source : " + srcKey + "\n" +
                    "TextFrames dans la portée : " + r.framesTotal + "\n" +
                    "TextFrames concernés : " + r.framesHit + "\n" +
                    "TextFrames ignorés (verrouillés / masqués) : " + r.framesIgnored + "\n" +
                    "Plages (runs) concernées : " + r.runs + "\n" +
                    "Caractères concernés : " + r.chars +
                    (stylesCb.value ? ("\nStyles caractère/paragraphe liés : " + r.stylesUpdated) : "") +
                    (tgt ? ("\nPolice cible résolue : " + fontLabel(tgt) + " [" + fontKey(tgt) + "]") :
                           ("\nPolice cible : non résolue (vérifiez famille/style ou nom)")),
                "Analyze (no changes)\n" +
                    "Source font: " + srcKey + "\n" +
                    "TextFrames in scope: " + r.framesTotal + "\n" +
                    "TextFrames affected: " + r.framesHit + "\n" +
                    "TextFrames skipped (locked / hidden): " + r.framesIgnored + "\n" +
                    "Affected runs: " + r.runs + "\n" +
                    "Affected characters: " + r.chars +
                    (stylesCb.value ? ("\nLinked character/paragraph styles: " + r.stylesUpdated) : "") +
                    (tgt ? ("\nResolved target font: " + fontLabel(tgt) + " [" + fontKey(tgt) + "]") :
                           ("\nTarget font: unresolved (check family/style or name)"))
            );
            statusTxt.text = t(
                "Analyse : " + r.framesHit + " cadres, " + r.runs + " runs, " + r.chars + " caractères",
                "Analyze: " + r.framesHit + " frames, " + r.runs + " runs, " + r.chars + " chars"
            );
            alert(msg);
        };

        btnApply.onClick = function () {
            var frames = getTargetFrames(currentScope());
            if (frames.length === 0) {
                alert(t("Aucun bloc de texte (TextFrame) trouvé dans la portée choisie.",
                        "No text frame (TextFrame) found in the selected scope."));
                return;
            }

            // S'assurer que la liste source est à jour / Ensure source list is current
            if (sourceKeys.length === 0) {
                refreshUsedList();
            }

            var srcKey = getSelectedSourceKey();
            if (!srcKey) {
                alert(t("Choisissez une police source dans la liste (Actualiser si besoin).",
                        "Choose a source font from the list (Refresh if needed)."));
                return;
            }

            var tgt = getTargetFont();
            if (!tgt) {
                alert(t("Police cible introuvable. Choisissez une famille/style ou un nom interne valide.",
                        "Target font not found. Pick a family/style or a valid internal name."));
                return;
            }

            if (fontKey(tgt) === srcKey) {
                alert(t("La police source et la police cible sont identiques.",
                        "Source and target fonts are the same."));
                return;
            }

            // Un seul bloc de modifications — pas de checkpoints intermédiaires
            // Single modification block — no intermediate checkpoints
            var r = processFonts(frames, srcKey, tgt, "replace", stylesCb.value);

            try { app.redraw(); } catch (eRedraw) { /* ignore */ }

            var msg = t(
                "Remplacement terminé.\n" +
                    "Source : " + srcKey + "\n" +
                    "Cible : " + fontLabel(tgt) + " [" + fontKey(tgt) + "]\n" +
                    "TextFrames modifiés : " + r.framesHit + "\n" +
                    "Plages (runs) : " + r.runs + "\n" +
                    "Caractères : " + r.chars + "\n" +
                    "Ignorés (verrouillés / masqués) : " + r.framesIgnored +
                    (stylesCb.value ? ("\nStyles mis à jour : " + r.stylesUpdated) : "") +
                    (r.errors > 0 ? ("\nErreurs partielles : " + r.errors) : "") +
                    "\n\nAnnulation : essayez Ctrl+Z / Cmd+Z (souvent tout le script).",
                "Replacement done.\n" +
                    "Source: " + srcKey + "\n" +
                    "Target: " + fontLabel(tgt) + " [" + fontKey(tgt) + "]\n" +
                    "TextFrames modified: " + r.framesHit + "\n" +
                    "Runs: " + r.runs + "\n" +
                    "Characters: " + r.chars + "\n" +
                    "Skipped (locked / hidden): " + r.framesIgnored +
                    (stylesCb.value ? ("\nStyles updated: " + r.stylesUpdated) : "") +
                    (r.errors > 0 ? ("\nPartial errors: " + r.errors) : "") +
                    "\n\nUndo: try Ctrl+Z / Cmd+Z (often the whole script)."
            );

            if (r.framesHit === 0 && r.chars === 0 && r.stylesUpdated === 0) {
                msg = t(
                    "Aucun caractère remplacé." +
                        (r.framesIgnored > 0 ? ("\nCadres ignorés : " + r.framesIgnored) : ""),
                    "No characters replaced." +
                        (r.framesIgnored > 0 ? ("\nSkipped frames: " + r.framesIgnored) : "")
                );
            }

            statusTxt.text = t(
                "Appliqué : " + r.chars + " caractères, " + r.framesHit + " cadres",
                "Applied: " + r.chars + " chars, " + r.framesHit + " frames"
            );
            alert(msg);

            // Rafraîchir la liste source après remplacement
            // Refresh source list after replacement
            refreshUsedList();
        };

        btnClose.onClick = function () {
            w.close();
        };

        // Premier chargement de la liste / Initial used-fonts load
        try {
            refreshUsedList();
        } catch (eInit) {
            statusTxt.text = t("Prêt (liste non chargée).", "Ready (list not loaded).");
        }

        w.show();
    }

    buildDialog();

})();
