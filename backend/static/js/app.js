/**
 * AI Video Dubber & Translation - Frontend Controller
 * Minimalist, Simple Neutral Theme (No colorful elements)
 * All UI alerts and texts are in Khmer Language (ភាសាខ្មែរ)
 */

const initializeDubbingApp = () => {
    // --- Application State ---
    
    const CHARACTER_VOICE_ICONS = {
        "km-KH-PisethNeural": "👨",
        "km-KH-SreymomNeural": "👩",
        "km-character-old-man": "👴",
        "km-character-old-woman": "👵",
        "km-character-young-boy": "👦",
        "km-character-young-girl": "👧",
        "km-character-villain": "🧙‍♂️",
        "km-character-narrator": "📢"
    };

    const CHARACTER_VOICE_NAMES = {
        "km-KH-PisethNeural": "Piseth (ប្រុស)",
        "km-KH-SreymomNeural": "Sreymom (ស្រី)",
        "km-character-old-man": "លោកតា (ចាស់)",
        "km-character-old-woman": "លោកយាយ (ចាស់)",
        "km-character-young-boy": "ក្មេងប្រុស",
        "km-character-young-girl": "ក្មេងស្រី",
        "km-character-villain": "តួអាក្រក់",
        "km-character-narrator": "អ្នកនិទាន"
    };

    function getVoiceIcon(profile) {
        return CHARACTER_VOICE_ICONS[profile] || "🎙️";
    }

    function getVoiceShortName(profile) {
        return CHARACTER_VOICE_NAMES[profile] || "Piseth";
    }

    const defaultRightsReview = () => ({ footage: false, audio: false, third_party: false, license_terms: false, notes: "" });
    const defaultSpeakerProfiles = () => [
        { id: "speaker_1", name: "Speaker 1", voice_profile: "km-KH-PisethNeural" },
        { id: "speaker_2", name: "Speaker 2", voice_profile: "km-KH-SreymomNeural" }
    ];

    function normalizeSpeakerProfiles(profiles) {
        if (!Array.isArray(profiles)) return defaultSpeakerProfiles();
        const normalized = profiles
            .filter(profile => profile && typeof profile.id === "string" && /^[a-zA-Z0-9_-]+$/.test(profile.id))
            .map((profile, index) => ({
                id: profile.id,
                name: String(profile.name || `Speaker ${index + 1}`).trim().slice(0, 60) || `Speaker ${index + 1}`,
                voice_profile: CHARACTER_VOICE_NAMES[profile.voice_profile] ? profile.voice_profile : "km-KH-PisethNeural"
            }));
        return normalized.length ? normalized : defaultSpeakerProfiles();
    }

    function setSegmentVoiceProfile(segment, voiceProfile) {
        if (segment.voice_profile === voiceProfile) return false;
        segment.voice_profile = voiceProfile;
        segment.audio_url = null;
        segment.status = "បានប្ដូរសំឡេង - ត្រូវបង្កើតសំឡេងឡើងវិញ";
        return true;
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>\"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
        })[character]);
    }

    const state = {
        copyrightReview: defaultRightsReview(),
        speakerProfiles: defaultSpeakerProfiles(),
        currentVideoFile: null,
        currentVideoFilename: "",
        currentVideoDuration: 0,
        backgroundAudioUrl: null,
        backgroundAudioVideoFilename: "",
        segments: [],
        isPlaying: false,
        activeSegmentId: null,
        selectedSegmentId: null,
        selectedSegmentIds: [],
        showLiveSubtitles: true,
        segmentTablePage: 0,
        timelineZoom: 1,
        timelineVerticalZoom: 1
    };

    let isRetryingFailedVoice = false;
    let isCheckingAudioFit = false;
    function failedVoiceSegments() {
        return state.segments.filter(seg => String(seg.status || "").startsWith("បរាជ័យ:"));
    }
    function updateRetryFailedVoiceButton() {
        if (!btnRetryFailedVoice) return;
        const count = failedVoiceSegments().length;
        btnRetryFailedVoice.disabled = isRetryingFailedVoice || count === 0;
        const label = btnRetryFailedVoice.querySelector("span");
        if (label) label.textContent = count ? `សាកម្ដងទៀត (${count})` : "សាកបង្កើតសំឡេងឡើងវិញ";
    }
    function updateAudioFitButton() {
        if (btnCheckAudioFit) btnCheckAudioFit.disabled = isCheckingAudioFit || !state.segments.some(seg => Boolean(seg.audio_url));
    }
    function updateDialogueSeparationButton() {
        const label = btnSeparateDialogue?.querySelector("span");
        if (label) {
            label.textContent = state.backgroundAudioUrl && state.backgroundAudioVideoFilename === state.currentVideoFilename
                ? "Use Original Audio"
                : "Separate Dialogue";
        }
    }

    // --- DOM Elements ---
    const videoFileInput = document.getElementById("videoFileInput");
    const projectFileInput = document.getElementById("projectFileInput");
    const btnLoadVideo = document.getElementById("btnLoadVideo");
    const btnOpenLinkModal = document.getElementById("btnOpenLinkModal");
    const btnTranscribe = document.getElementById("btnTranscribe");
    const btnTranslate = document.getElementById("btnTranslate");
    const btnRemoveVoice = document.getElementById("btnRemoveVoice");
    const btnSeparateDialogue = document.getElementById("btnSeparateDialogue");
    const btnOpenSettings = document.getElementById("btnOpenSettings");
    const btnGenerateVoice = document.getElementById("btnGenerateVoice");
    const btnRetryFailedVoice = document.getElementById("btnRetryFailedVoice");
    const btnCheckAudioFit = document.getElementById("btnCheckAudioFit");
    const audioFitStatus = document.getElementById("audioFitStatus");
    const btnExportVideo = document.getElementById("btnExportVideo");
    const btnAutoReel = document.getElementById("btnAutoReel");
    const autoReelModal = document.getElementById("autoReelModal");
    const btnCloseAutoReel = document.getElementById("btnCloseAutoReel");
    const btnCancelAutoReel = document.getElementById("btnCancelAutoReel");
    const btnCreateAutoReels = document.getElementById("btnCreateAutoReels");
    const autoReelCount = document.getElementById("autoReelCount");
    const autoReelLength = document.getElementById("autoReelLength");
    const autoReelCaptions = document.getElementById("autoReelCaptions");
    const autoReelRemoveDialogue = document.getElementById("autoReelRemoveDialogue");
    const autoReelBlurCaptions = document.getElementById("autoReelBlurCaptions");
    const autoReelProgress = document.getElementById("autoReelProgress");
    const autoReelResults = document.getElementById("autoReelResults");
    const autoReelResultList = document.getElementById("autoReelResultList");
    const btnExportSrt = document.getElementById("btnExportSrt");
    const btnExportVtt = document.getElementById("btnExportVtt");
    const btnAddSegment = document.getElementById("btnAddSegment");
    const btnUndo = document.getElementById("btnUndo");
    const btnRedo = document.getElementById("btnRedo");
    const btnThemeToggle = document.getElementById("btnThemeToggle");
    const themeToggleIcon = document.getElementById("themeToggleIcon");

    function applyTheme(theme) {
        const isLight = theme === "light";
        document.documentElement.classList.toggle("light", isLight);
        document.documentElement.classList.toggle("dark", !isLight);
        try { localStorage.setItem("ai_dubber_theme", isLight ? "light" : "dark"); } catch (error) { /* Theme still applies for this session. */ }
        if (themeToggleIcon) themeToggleIcon.textContent = isLight ? "☾" : "☀";
        if (btnThemeToggle) {
            const nextTheme = isLight ? "Dark" : "Light";
            btnThemeToggle.title = `ប្តូរទៅ ${nextTheme} mode`;
            btnThemeToggle.setAttribute("aria-label", `ប្តូរទៅ ${nextTheme} mode`);
            btnThemeToggle.setAttribute("aria-pressed", String(isLight));
        }
    }

    applyTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
    if (btnThemeToggle) btnThemeToggle.addEventListener("click", () => {
        applyTheme(document.documentElement.classList.contains("light") ? "dark" : "light");
    });

    const undoHistory = [];
    const redoHistory = [];
    const HISTORY_LIMIT = 50;
    const SEGMENT_PAGE_SIZE = 100;
    let savedProjectSnapshot = null;

    function currentProjectSnapshot() {
        return JSON.stringify({
            video_filename: state.currentVideoFilename,
            video_duration: state.currentVideoDuration,
            background_audio_url: state.backgroundAudioUrl,
            background_audio_video_filename: state.backgroundAudioVideoFilename,
            copyright_review: state.copyrightReview,
            speaker_profiles: state.speakerProfiles,
            segments: state.segments
        });
    }

    function markProjectClean() {
        savedProjectSnapshot = currentProjectSnapshot();
        updateProjectDirtyStatus();
    }

    function updateProjectDirtyStatus() {
        if (!projectDirtyStatus) return;
        if (!state.currentVideoFilename && !state.segments.length) {
            projectDirtyStatus.textContent = "គម្រោងថ្មី";
            projectDirtyStatus.className = "max-w-36 truncate rounded-md bg-base-850 px-2 py-1 text-[10px] text-base-500";
        } else if (savedProjectSnapshot === currentProjectSnapshot()) {
            projectDirtyStatus.textContent = "បានរក្សាទុក";
            projectDirtyStatus.className = "max-w-36 truncate rounded-md bg-emerald-950/60 px-2 py-1 text-[10px] text-emerald-300";
        } else {
            projectDirtyStatus.textContent = "មានការកែប្រែមិនទាន់រក្សាទុក";
            projectDirtyStatus.className = "max-w-44 truncate rounded-md bg-amber-950/60 px-2 py-1 text-[10px] text-amber-300";
        }
    }

    function updateHistoryButtons() {
        if (btnUndo) btnUndo.disabled = undoHistory.length === 0;
        if (btnRedo) btnRedo.disabled = redoHistory.length === 0;
        [btnUndo, btnRedo].filter(Boolean).forEach(button => {
            button.classList.toggle("opacity-40", button.disabled);
            button.classList.toggle("cursor-not-allowed", button.disabled);
        });
    }

    function historySnapshot() {
        return JSON.stringify({ segments: state.segments, speaker_profiles: state.speakerProfiles });
    }

    function recordUndo() {
        undoHistory.push(historySnapshot());
        if (undoHistory.length > HISTORY_LIMIT) undoHistory.shift();
        redoHistory.length = 0;
        updateHistoryButtons();
    }

    function resetHistory() {
        undoHistory.length = 0;
        redoHistory.length = 0;
        updateHistoryButtons();
    }

    function restoreHistorySnapshot(snapshot) {
        const parsed = JSON.parse(snapshot);
        state.segments = Array.isArray(parsed) ? parsed : parsed.segments;
        if (!Array.isArray(parsed)) state.speakerProfiles = normalizeSpeakerProfiles(parsed.speaker_profiles);
        state.selectedSegmentIds = (state.selectedSegmentIds || []).filter(id => state.segments.some(seg => seg.id === id));
        if (state.selectedSegmentId && !state.segments.some(seg => seg.id === state.selectedSegmentId)) {
            state.selectedSegmentId = null;
        }
        if (state.selectedSegmentId && !state.selectedSegmentIds.includes(state.selectedSegmentId)) {
            state.selectedSegmentIds = [state.selectedSegmentId];
        }
        renderSegmentsTable();
        renderTimelineTracks();
        updateSubtitleOverlay();
        if (state.selectedSegmentId) selectSegment(state.selectedSegmentId, false);
        updateHistoryButtons();
    }

    function undo() {
        if (!undoHistory.length) return;
        redoHistory.push(historySnapshot());
        restoreHistorySnapshot(undoHistory.pop());
    }

    function redo() {
        if (!redoHistory.length) return;
        undoHistory.push(historySnapshot());
        restoreHistorySnapshot(redoHistory.pop());
    }

    if (btnUndo) btnUndo.addEventListener("click", undo);
    if (btnRedo) btnRedo.addEventListener("click", redo);
    updateHistoryButtons();

    const btnOpenProject = document.getElementById("btnOpenProject");
    const btnSaveProject = document.getElementById("btnSaveProject");
    const btnExportPackage = document.getElementById("btnExportPackage");
    const projectDirtyStatus = document.getElementById("projectDirtyStatus");
    const btnAutoDetectSpeakers = document.getElementById("btnAutoDetectSpeakers");
    const btnManageSpeakers = document.getElementById("btnManageSpeakers");
    const speakerProfilesModal = document.getElementById("speakerProfilesModal");
    const speakerProfilesList = document.getElementById("speakerProfilesList");
    const btnCloseSpeakerProfiles = document.getElementById("btnCloseSpeakerProfiles");
    const btnCancelSpeakerProfiles = document.getElementById("btnCancelSpeakerProfiles");
    const btnSaveSpeakerProfiles = document.getElementById("btnSaveSpeakerProfiles");
    const btnAddSpeaker = document.getElementById("btnAddSpeaker");
    let speakerProfilesDraft = [];
    const btnAlternateVoices = document.getElementById("btnAlternateVoices");
    const btnAllMale = document.getElementById("btnAllMale");
    const btnAllFemale = document.getElementById("btnAllFemale");

    const videoElement = document.getElementById("videoElement");
    const videoEmptyPlaceholder = document.getElementById("videoEmptyPlaceholder");
    const liveSubtitleOverlay = document.getElementById("liveSubtitleOverlay");
    const btnToggleLiveSubtitles = document.getElementById("btnToggleLiveSubtitles");
    const videoDurationBadge = document.getElementById("videoDurationBadge");
    const lblCurrentFilename = document.getElementById("lblCurrentFilename");
    const lblAudioStatus = document.getElementById("lblAudioStatus");
    const previewAudioElement = document.getElementById("previewAudioElement");

    const segmentsTableBody = document.getElementById("segmentsTableBody");
    const tableEmptyRow = document.getElementById("tableEmptyRow");
    const segmentsCountBadge = document.getElementById("segmentsCountBadge");
    const segmentsPagination = document.getElementById("segmentsPagination");
    const segmentsPageLabel = document.getElementById("segmentsPageLabel");
    const btnSegmentsPrev = document.getElementById("btnSegmentsPrev");
    const btnSegmentsNext = document.getElementById("btnSegmentsNext");
    const findReplaceText = document.getElementById("findReplaceText");
    const findReplaceWith = document.getElementById("findReplaceWith");
    const findReplaceScope = document.getElementById("findReplaceScope");
    const segmentReviewFilter = document.getElementById("segmentReviewFilter");
    const btnFindReplace = document.getElementById("btnFindReplace");
    const findReplaceStatus = document.getElementById("findReplaceStatus");
    const btnCheckTiming = document.getElementById("btnCheckTiming");
    const timingIssueStatus = document.getElementById("timingIssueStatus");
    const btnFixDuplicateSegments = document.getElementById("btnFixDuplicateSegments");
    const duplicateSegmentStatus = document.getElementById("duplicateSegmentStatus");
    const autosaveStatus = document.getElementById("autosaveStatus");
    const AUTOSAVE_KEY = "ai_dubber_autosave_v1";
    let autosaveTimer = null;
    let timingIssueById = new Map();
    let audioFitIssueById = new Map();

    function saveAutosaveSnapshot() {
        const snapshot = {
            app: "AI_DUBBER",
            version: 1,
            saved_at: new Date().toISOString(),
            video_filename: state.currentVideoFilename,
            video_duration: state.currentVideoDuration,
            background_audio_url: state.backgroundAudioUrl,
            background_audio_video_filename: state.backgroundAudioVideoFilename,
            copyright_review: state.copyrightReview,
            speaker_profiles: state.speakerProfiles,
            segments: state.segments
        };
        try {
            localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot));
            if (autosaveStatus) autosaveStatus.textContent = "បានរក្សាទុកស្វ័យប្រវត្តិ";
            return true;
        } catch (error) {
            console.warn("Autosave failed:", error);
            if (autosaveStatus) autosaveStatus.textContent = "រក្សាទុកស្វ័យប្រវត្តិមិនបាន (Storage ពេញ)";
            return false;
        }
    }

    function scheduleAutosave() {
        updateProjectDirtyStatus();
        if (autosaveTimer) clearTimeout(autosaveTimer);
        if (autosaveStatus) autosaveStatus.textContent = "កំពុងរក្សាទុក...";
        autosaveTimer = setTimeout(saveAutosaveSnapshot, 700);
    }

    window.addEventListener("pagehide", () => {
        if (state.currentVideoFilename || state.segments.length) saveAutosaveSnapshot();
    });

    async function restoreAutosaveIfAvailable() {
        try {
            const raw = localStorage.getItem(AUTOSAVE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (!saved || !Array.isArray(saved.segments)) return;
            const savedSegments = saved.segments;
            const savedVideoFilename = typeof saved.video_filename === "string" ? saved.video_filename.trim() : "";
            if (!savedVideoFilename && !savedSegments.length) return;
            if (savedSegments.length) {
                const savedAt = saved.saved_at ? new Date(saved.saved_at).toLocaleString() : "";
                if (!(await showAppConfirm(`មានគម្រោងរក្សាទុកស្វ័យប្រវត្តិ${savedAt ? ` (${savedAt})` : ""} ដែលមាន ${savedSegments.length} segments។

តើអ្នកចង់ស្តារវាវិញទេ?`, { title: "ស្តារគម្រោង", confirmText: "ស្តារគម្រោង" }))) return;
            }
            state.segments = savedSegments;
            state.copyrightReview = { ...defaultRightsReview(), ...(saved.copyright_review || {}) };
            state.speakerProfiles = normalizeSpeakerProfiles(saved.speaker_profiles);
            state.currentVideoFilename = savedVideoFilename;
            state.currentVideoDuration = Number(saved.video_duration) || 0;
            state.backgroundAudioUrl = saved.background_audio_url || null;
            state.backgroundAudioVideoFilename = saved.background_audio_video_filename || "";
            updateDialogueSeparationButton();
            markProjectClean();
            if (state.currentVideoFilename) {
                lblCurrentFilename.textContent = state.currentVideoFilename;
                enableButton(btnTranscribe);
                try {
                    const videoUrl = `/uploads/${encodeURIComponent(state.currentVideoFilename)}`;
                    const videoCheck = await fetch(videoUrl, { method: "HEAD", cache: "no-store" });
                    if (!videoCheck.ok) throw new Error(`Video file unavailable (${videoCheck.status}).`);
                    videoElement.src = videoUrl;
                    videoElement.controls = true;
                    videoEmptyPlaceholder.classList.add("hidden");
                    videoElement.onloadedmetadata = () => {
                        if (videoElement.duration && videoElement.duration > 0) {
                            state.currentVideoDuration = videoElement.duration;
                            videoDurationBadge.textContent = `00:00 / ${formatTime(videoElement.duration)}`;
                            saveAutosaveSnapshot();
                        }
                    };
                    videoElement.load();
                    enableButton(btnRemoveVoice);
                } catch (videoError) {
                    console.warn("Could not restore the uploaded video:", videoError);
                    disableButton(btnTranscribe);
                    showToast("The saved video is no longer on the server. Load the video again to transcribe it.");
                }
            }
            if (state.currentVideoDuration) videoDurationBadge.textContent = `00:00 / ${formatTime(state.currentVideoDuration)}`;
            renderSegmentsTable();
            renderTimelineTracks();
            syncRightsReviewControls();
            if (state.segments.length) {
                enableButton(btnTranslate);
                enableButton(btnGenerateVoice);
                if (btnExportSrt) enableButton(btnExportSrt);
                if (btnExportVtt) enableButton(btnExportVtt);
            }
            if (state.segments.some(seg => seg.audio_url)) enableButton(btnExportVideo);
            if (autosaveStatus) autosaveStatus.textContent = "បានស្តារគម្រោងស្វ័យប្រវត្តិ";
            setStatus("ស្តារគម្រោង", state.segments.length
                ? "បានស្តារគម្រោង និងចំណងជើងរងពីការរក្សាទុកស្វ័យប្រវត្តិ។"
                : "បានស្តារវីដេអូរួចរាល់។ ចុច Transcribe ដើម្បីបង្កើតចំណងជើងរង។");
        } catch (error) {
            console.warn("Could not restore autosave:", error);
        }
    }

    function applyFindReplace() {
        const search = findReplaceText?.value ?? "";
        const replacement = findReplaceWith?.value ?? "";
        if (!search) {
            if (findReplaceStatus) findReplaceStatus.textContent = "បញ្ចូលពាក្យស្វែងរកជាមុនសិន។";
            return;
        }
        const scope = findReplaceScope?.value || "translated_text";
        const fields = scope === "both" ? ["original_text", "translated_text"] : [scope];
        let replacementCount = 0;
        const before = historySnapshot();
        state.segments.forEach(seg => {
            fields.forEach(field => {
                const current = String(seg[field] || "");
                const pieces = current.split(search);
                const count = pieces.length - 1;
                if (count) {
                    seg[field] = pieces.join(replacement);
                    if (field === "translated_text") {
                        seg.audio_url = null;
                        seg.status = "បានកែប្រែ - ត្រូវបង្កើតសំឡេងឡើងវិញ";
                    }
                    replacementCount += count;
                }
            });
        });
        if (replacementCount) {
            undoHistory.push(before);
            if (undoHistory.length > HISTORY_LIMIT) undoHistory.shift();
            redoHistory.length = 0;
            updateHistoryButtons();
        }
        if (findReplaceStatus) {
            findReplaceStatus.textContent = replacementCount
                ? `បានជំនួស ${replacementCount} កន្លែង។`
                : "រកមិនឃើញពាក្យនេះទេ។";
        }
        if (replacementCount) {
            // Rebuild controls from the updated segment data and persist the result.
            renderSegmentsTable();
            renderTimelineTracks();
            updateSubtitleOverlay();
        }
    }

    function computeTimingIssues() {
        const issues = new Map();
        const addIssue = (id, issue) => {
            if (!issues.has(id)) issues.set(id, []);
            issues.get(id).push(issue);
        };
        const ordered = [...state.segments].sort((a, b) => Number(a.start) - Number(b.start));
        let previousWithLatestEnd = null;
        ordered.forEach(seg => {
            const start = Number(seg.start);
            const end = Number(seg.end);
            if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
                addIssue(seg.id, { type: "invalid", text: "ពេលបញ្ចប់ត្រូវតែធំជាងពេលចាប់ផ្តើម" });
            }
            if (previousWithLatestEnd) {
                const previousEnd = Number(previousWithLatestEnd.end);
                const gap = start - previousEnd;
                if (gap < -0.02) {
                    const seconds = Math.abs(gap).toFixed(2);
                    addIssue(previousWithLatestEnd.id, { type: "overlap", text: `ត្រួតគ្នា ${seconds} វិនាទីជាមួយ Segment #${seg.id}` });
                    addIssue(seg.id, { type: "overlap", text: `ត្រួតគ្នា ${seconds} វិនាទីជាមួយ Segment #${previousWithLatestEnd.id}` });
                } else if (gap >= 5) {
                    addIssue(seg.id, { type: "gap", text: `មានចន្លោះ ${gap.toFixed(1)} វិនាទីពី Segment #${previousWithLatestEnd.id}` });
                }
            }
            if (!previousWithLatestEnd || end > Number(previousWithLatestEnd.end)) previousWithLatestEnd = seg;
        });
        return issues;
    }

    function buildExportPreflight() {
        const issues = computeTimingIssues();
        const allTimingIssues = [...issues.values()].flat();
        const overlapPairs = allTimingIssues.filter(issue => issue.type === "overlap").length / 2;
        const longGaps = allTimingIssues.filter(issue => issue.type === "gap").length;
        const invalidTimes = allTimingIssues.filter(issue => issue.type === "invalid").length;
        const missingTranslations = state.segments.filter(seg => !String(seg.translated_text || "").trim()).length;
        const missingAudio = state.segments.filter(seg => String(seg.translated_text || "").trim() && !seg.audio_url).length;
        const subtitleSegmenter = typeof Intl.Segmenter === "function"
            ? new Intl.Segmenter("km", { granularity: "grapheme" })
            : null;
        const countSubtitleCharacters = text => {
            const compact = String(text || "").replace(/\s/g, "");
            if (subtitleSegmenter) return Array.from(subtitleSegmenter.segment(compact)).length;
            return Array.from(compact).length;
        };
        const captionsTooFast = state.segments.filter(seg => {
            const text = String(seg.translated_text || "").trim();
            const duration = Number(seg.end) - Number(seg.start);
            return text && Number.isFinite(duration) && duration > 0 && countSubtitleCharacters(text) / duration > 24;
        }).length;
        const captionsTooLong = state.segments.filter(seg => countSubtitleCharacters(seg.translated_text || seg.original_text) > 84).length;
        const rows = [
            { label: `មាន ${state.segments.length} segments`, ok: state.segments.length > 0 },
            { label: state.currentVideoFilename ? `បានភ្ជាប់វីដេអូ: ${state.currentVideoFilename}` : "មិនទាន់មានវីដេអូដើម", ok: Boolean(state.currentVideoFilename) },
            { label: missingTranslations ? `ខ្វះអត្ថបទបកប្រែ ${missingTranslations} segments` : "អត្ថបទបកប្រែគ្រប់ segments", ok: missingTranslations === 0 },
            { label: captionsTooFast ? `មាន subtitle លឿនជាង 24 តួអក្សរ/វិនាទី ${captionsTooFast} segments` : "ល្បឿនអាន subtitle សមរម្យ", ok: captionsTooFast === 0 },
            { label: captionsTooLong ? `មាន subtitle វែងជាង 2 បន្ទាត់ ${captionsTooLong} segments` : "ប្រវែង subtitle សមរម្យសម្រាប់ 2 បន្ទាត់", ok: captionsTooLong === 0 },
            { label: missingAudio ? `ខ្វះសំឡេងបញ្ចូល ${missingAudio} segments` : "មានសំឡេងបញ្ចូលគ្រប់អត្ថបទបកប្រែ", ok: missingAudio === 0 },
            { label: overlapPairs ? `មាន segment ត្រួតគ្នា ${overlapPairs} កន្លែង` : "មិនឃើញ segment ត្រួតគ្នា", ok: overlapPairs === 0 },
            { label: invalidTimes ? `មានពេលវេលាមិនត្រឹមត្រូវ ${invalidTimes} segments` : "ពេលចាប់ផ្តើម/បញ្ចប់ត្រឹមត្រូវ", ok: invalidTimes === 0 },
            { label: longGaps ? `មានចន្លោះលើស 5 វិនាទី ${longGaps} កន្លែង` : "មិនឃើញចន្លោះវែង", ok: longGaps === 0 }
        ];
        const warnings = rows.filter(row => !row.ok);
        return { rows, warnings, blocking: !state.currentVideoFilename || !state.segments.length };
    }

    function syncRightsReviewControls() {
        const review = state.copyrightReview || defaultRightsReview();
        rightsReviewCheckboxes.forEach(input => {
            input.checked = Boolean(review[input.dataset.rightsKey]);
        });
        if (rightsReviewNotes) rightsReviewNotes.value = review.notes || "";
        updateRightsReviewProgress();
    }

    function updateRightsReviewProgress() {
        const clearedCount = rightsReviewCheckboxes.filter(input => input.checked).length;
        if (rightsReviewProgress) {
            rightsReviewProgress.textContent = `${clearedCount} / ${rightsReviewCheckboxes.length} បានពិនិត្យ`;
            rightsReviewProgress.className = `text-[10px] ${clearedCount === rightsReviewCheckboxes.length ? "text-emerald-300" : "text-amber-300"}`;
        }
    }

    function renderExportPreflight() {
        const report = buildExportPreflight();
        if (exportPreflightList) {
            exportPreflightList.replaceChildren();
            report.rows.forEach(row => {
                const item = document.createElement("li");
                item.className = `flex items-start gap-2 ${row.ok ? "text-emerald-300" : "text-amber-300"}`;
                const icon = document.createElement("span");
                icon.textContent = row.ok ? "✓" : "⚠";
                icon.className = "font-semibold";
                const label = document.createElement("span");
                label.textContent = row.label;
                item.append(icon, label);
                exportPreflightList.appendChild(item);
            });
        }
        if (exportPreflightSummary) {
            exportPreflightSummary.textContent = report.warnings.length
                ? `រកឃើញចំណុចត្រូវពិនិត្យ ${report.warnings.length}`
                : "ការត្រួតពិនិត្យរួចរាល់";
            exportPreflightSummary.className = `text-[11px] font-medium ${report.warnings.length ? "text-amber-300" : "text-emerald-300"}`;
        }
        return report;
    }

    function updateTimingIssueSummary() {
        if (!timingIssueStatus) return;
        const issues = [...timingIssueById.values()].flat();
        const overlapCount = issues.filter(issue => issue.type === "overlap").length / 2;
        const gapCount = issues.filter(issue => issue.type === "gap").length;
        const invalidCount = issues.filter(issue => issue.type === "invalid").length;
        timingIssueStatus.textContent = issues.length
            ? `បញ្ហា: ត្រួតគ្នា ${overlapCount}, ចន្លោះវែង ${gapCount}, ពេលមិនត្រឹមត្រូវ ${invalidCount}`
            : (state.segments.length ? "ពេលវេលាមិនមានបញ្ហា" : "មិនទាន់មាន segments");
        timingIssueStatus.className = issues.length ? "text-[10px] text-amber-300" : "text-[10px] text-emerald-400";
    }

    if (btnFindReplace) btnFindReplace.addEventListener("click", applyFindReplace);
    [findReplaceText, findReplaceWith].filter(Boolean).forEach(input => input.addEventListener("keydown", e => {
        if (e.key === "Enter") applyFindReplace();
    }));
    if (btnCheckTiming) btnCheckTiming.addEventListener("click", () => {
        timingIssueById = computeTimingIssues();
        updateTimingIssueSummary();
        renderSegmentsTable();
        const firstIssueId = timingIssueById.keys().next().value;
        if (firstIssueId !== undefined) selectSegment(firstIssueId, true);
        setStatus("ពិនិត្យពេលវេលា", timingIssueStatus?.textContent || "បានពិនិត្យរួចរាល់។");
    });

    function readAudioDuration(url) {
        return new Promise(resolve => {
            const audio = new Audio();
            let finished = false;
            const finish = duration => {
                if (finished) return;
                finished = true;
                clearTimeout(timeout);
                audio.removeAttribute("src");
                audio.load();
                resolve(Number.isFinite(duration) && duration > 0 ? duration : null);
            };
            const timeout = setTimeout(() => finish(null), 12000);
            audio.preload = "metadata";
            audio.addEventListener("loadedmetadata", () => finish(audio.duration), { once: true });
            audio.addEventListener("error", () => finish(null), { once: true });
            audio.src = url;
            audio.load();
        });
    }

    if (btnCheckAudioFit) btnCheckAudioFit.addEventListener("click", async () => {
        const candidates = state.segments.filter(seg => seg.audio_url);
        if (!candidates.length) return;
        isCheckingAudioFit = true;
        updateAudioFitButton();
        audioFitIssueById = new Map();
        if (audioFitStatus) audioFitStatus.textContent = `កំពុងពិនិត្យ ${candidates.length} segments...`;
        try {
            const results = await Promise.all(candidates.map(async seg => ({ seg, duration: await readAudioDuration(seg.audio_url) })));
            let unreadable = 0;
            results.forEach(({ seg, duration }) => {
                if (duration === null) { unreadable += 1; return; }
                const target = Math.max(0, Number(seg.end) - Number(seg.start));
                const difference = duration - target;
                const tolerance = Math.max(0.25, target * 0.08);
                if (difference > tolerance || difference < -tolerance) {
                    const text = difference > 0
                        ? `សំឡេងវែងជាង Segment ${difference.toFixed(2)} វិនាទី`
                        : `សំឡេងខ្លីជាង Segment ${Math.abs(difference).toFixed(2)} វិនាទី`;
                    audioFitIssueById.set(seg.id, [{ type: "audio-fit", text }]);
                }
            });
            const issueCount = audioFitIssueById.size;
            if (audioFitStatus) {
                audioFitStatus.textContent = issueCount ? `ត្រូវពិនិត្យ ${issueCount} segments${unreadable ? ` · មិនអាចអាន ${unreadable}` : ""}` : `ប្រវែងសំឡេងស៊ីគ្នា${unreadable ? ` · មិនអាចអាន ${unreadable}` : ""}`;
                audioFitStatus.className = `text-[10px] ${issueCount || unreadable ? "text-amber-300" : "text-emerald-400"}`;
            }
            renderSegmentsTable();
            setStatus("ពិនិត្យប្រវែងសំឡេង", issueCount ? `រកឃើញ ${issueCount} segments ដែលប្រវែងសំឡេងខុសពី timeline។` : "បានពិនិត្យប្រវែងសំឡេង AI រួចរាល់។");
        } catch (error) {
            console.error(error);
            if (audioFitStatus) audioFitStatus.textContent = "ពិនិត្យប្រវែងសំឡេងមិនបាន";
            showToast(`កំហុសក្នុងការពិនិត្យសំឡេង: ${error.message}`);
        } finally {
            isCheckingAudioFit = false;
            updateAudioFitButton();
        }
    });

    const timelinePanel = document.getElementById("timelinePanel");
    const timelineResizeHandle = document.getElementById("timelineResizeHandle");
    const timelineBody = document.getElementById("timelineBody");
    const timelineTrackLabels = document.getElementById("timelineTrackLabels");
    const timelineContainer = document.getElementById("timelineContainer");
    const timelineContentWrapper = document.getElementById("timelineContentWrapper");
    const timelineTimeRuler = document.getElementById("timelineTimeRuler");
    const timelinePlayhead = document.getElementById("timelinePlayhead");
    const timelineCurrentTime = document.getElementById("timelineCurrentTime");
    const trackText = document.getElementById("trackText");
    const trackVoice = document.getElementById("trackVoice");
    const btnZoomIn = document.getElementById("btnZoomIn");
    const btnZoomOut = document.getElementById("btnZoomOut");
    const btnZoomFit = document.getElementById("btnZoomFit");
    const lblZoomLevel = document.getElementById("lblZoomLevel");
    const btnTimelineVerticalZoomOut = document.getElementById("btnTimelineVerticalZoomOut");
    const btnTimelineVerticalZoomIn = document.getElementById("btnTimelineVerticalZoomIn");
    const btnTimelineVerticalZoomFit = document.getElementById("btnTimelineVerticalZoomFit");
    const lblTimelineVerticalZoom = document.getElementById("lblTimelineVerticalZoom");
    const trackBg = document.getElementById("trackBg");

    const TIMELINE_HEIGHT_KEY = "ai_dubber_timeline_panel_height";
    const getTimelineHeightLimits = () => ({ min: 130, max: Math.max(130, Math.floor(window.innerHeight * 0.7)) });
    const setTimelinePanelHeight = (height, persist = false) => {
        if (!timelinePanel || !timelineResizeHandle) return;
        const limits = getTimelineHeightLimits();
        const clampedHeight = Math.max(limits.min, Math.min(limits.max, Math.round(height)));
        timelinePanel.style.height = `${clampedHeight}px`;
        timelineResizeHandle.setAttribute("aria-valuemin", String(limits.min));
        timelineResizeHandle.setAttribute("aria-valuemax", String(limits.max));
        timelineResizeHandle.setAttribute("aria-valuenow", String(clampedHeight));
        if (persist) {
            try { localStorage.setItem(TIMELINE_HEIGHT_KEY, String(clampedHeight)); } catch (error) { /* Height still applies for this session. */ }
        }
    };
    if (timelinePanel && timelineResizeHandle) {
        try {
            const savedHeight = Number(localStorage.getItem(TIMELINE_HEIGHT_KEY));
            if (Number.isFinite(savedHeight) && savedHeight > 0) setTimelinePanelHeight(savedHeight);
            else setTimelinePanelHeight(timelinePanel.getBoundingClientRect().height);
        } catch (error) {
            setTimelinePanelHeight(timelinePanel.getBoundingClientRect().height);
        }

        timelineResizeHandle.addEventListener("pointerdown", event => {
            if (event.button !== 0) return;
            event.preventDefault();
            const startY = event.clientY;
            const startHeight = timelinePanel.getBoundingClientRect().height;
            timelineResizeHandle.setPointerCapture(event.pointerId);
            document.body.style.cursor = "row-resize";
            const onMove = moveEvent => setTimelinePanelHeight(startHeight + startY - moveEvent.clientY);
            const onEnd = endEvent => {
                timelineResizeHandle.removeEventListener("pointermove", onMove);
                timelineResizeHandle.removeEventListener("pointerup", onEnd);
                timelineResizeHandle.removeEventListener("pointercancel", onEnd);
                document.body.style.cursor = "";
                setTimelinePanelHeight(timelinePanel.getBoundingClientRect().height, true);
                if (timelineResizeHandle.hasPointerCapture(endEvent.pointerId)) timelineResizeHandle.releasePointerCapture(endEvent.pointerId);
            };
            timelineResizeHandle.addEventListener("pointermove", onMove);
            timelineResizeHandle.addEventListener("pointerup", onEnd);
            timelineResizeHandle.addEventListener("pointercancel", onEnd);
        });
        timelineResizeHandle.addEventListener("keydown", event => {
            const limits = getTimelineHeightLimits();
            const currentHeight = timelinePanel.getBoundingClientRect().height;
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                setTimelinePanelHeight(currentHeight + (event.key === "ArrowUp" ? 16 : -16), true);
            } else if (event.key === "Home") {
                event.preventDefault();
                setTimelinePanelHeight(limits.min, true);
            } else if (event.key === "End") {
                event.preventDefault();
                setTimelinePanelHeight(limits.max, true);
            }
        });
        window.addEventListener("resize", () => setTimelinePanelHeight(timelinePanel.getBoundingClientRect().height));
    }
    const lblSelectedSegment = document.getElementById("lblSelectedSegment");
    const btnSetStartToCurrent = document.getElementById("btnSetStartToCurrent");
    const btnSetEndToCurrent = document.getElementById("btnSetEndToCurrent");
    const btnNudgeLeft = document.getElementById("btnNudgeLeft");
    const btnNudgeRight = document.getElementById("btnNudgeRight");
    const btnShiftAll = document.getElementById("btnShiftAll");
    const btnEditSelected = document.getElementById("btnEditSelected");
    const btnSplitAtPlayhead = document.getElementById("btnSplitAtPlayhead");
    const btnDeleteSelected = document.getElementById("btnDeleteSelected");

    // Segment Quick Editor Modal DOM Elements
    const segmentEditModal = document.getElementById("segmentEditModal");
    const btnCloseSegmentModal = document.getElementById("btnCloseSegmentModal");
    const btnCancelSegmentModal = document.getElementById("btnCancelSegmentModal");
    const btnSaveSegmentModal = document.getElementById("btnSaveSegmentModal");
    const segmentModalTitle = document.getElementById("segmentModalTitle");
    const segModalStart = document.getElementById("segModalStart");
    const segModalEnd = document.getElementById("segModalEnd");
    const segModalDuration = document.getElementById("segModalDuration");
    const btnModalSetStartToVideo = document.getElementById("btnModalSetStartToVideo");
    const btnModalSetEndToVideo = document.getElementById("btnModalSetEndToVideo");
    const btnModalPlaySegment = document.getElementById("btnModalPlaySegment");
    const segModalOriginal = document.getElementById("segModalOriginal");
    const segModalTranslated = document.getElementById("segModalTranslated");
    const segModalSpeaker = document.getElementById("segModalSpeaker");
    const segModalVoice = document.getElementById("segModalVoice");
    const btnModalSplit = document.getElementById("btnModalSplit");
    const btnModalDelete = document.getElementById("btnModalDelete");

    const settingsModal = document.getElementById("settingsModal");
    const btnCloseSettingsModal = document.getElementById("btnCloseSettingsModal");
    const btnCancelSettings = document.getElementById("btnCancelSettings");
    const btnSaveKey = document.getElementById("btnSaveKey");
    const btnTestKey = document.getElementById("btnTestKey");
    const testKeyStatus = document.getElementById("testKeyStatus");
    const geminiApiKeyInput = document.getElementById("geminiApiKeyInput");
    const geminiModelSelect = document.getElementById("geminiModelSelect");
    const translationToneSelect = document.getElementById("translationToneSelect");
    const customGlossaryInput = document.getElementById("customGlossaryInput");
    const maleRateInput = document.getElementById("maleRateInput");
    const malePitchInput = document.getElementById("malePitchInput");
    const femaleRateInput = document.getElementById("femaleRateInput");
    const femalePitchInput = document.getElementById("femalePitchInput");

    const exportModal = document.getElementById("exportModal");
    const btnCloseExportModal = document.getElementById("btnCloseExportModal");
    const btnCancelExport = document.getElementById("btnCancelExport");
    const btnConfirmExport = document.getElementById("btnConfirmExport");
    const chkBurnSubtitles = document.getElementById("chkBurnSubtitles");
    const exportSubFontSize = document.getElementById("exportSubFontSize");
    const exportSubColor = document.getElementById("exportSubColor");
    const exportSubStyle = document.getElementById("exportSubStyle");
    const exportSubPosition = document.getElementById("exportSubPosition");
    const exportPreflightSummary = document.getElementById("exportPreflightSummary");
    const exportPreflightList = document.getElementById("exportPreflightList");
    const rightsReviewProgress = document.getElementById("rightsReviewProgress");
    const rightsReviewNotes = document.getElementById("rightsReviewNotes");
    const rightsReviewCheckboxes = [...document.querySelectorAll("[data-rights-key]")];
    const btnRefreshExportCheck = document.getElementById("btnRefreshExportCheck");
    const exportProgressContainer = document.getElementById("exportProgressContainer");
    const exportProgressText = document.getElementById("exportProgressText");
    const exportSuccessContainer = document.getElementById("exportSuccessContainer");
    const exportDownloadLink = document.getElementById("exportDownloadLink");

    const urlDownloadModal = document.getElementById("urlDownloadModal");
    const btnCloseUrlModal = document.getElementById("btnCloseUrlModal");
    const btnCancelUrlDownload = document.getElementById("btnCancelUrlDownload");
    const btnConfirmDownloadUrl = document.getElementById("btnConfirmDownloadUrl");
    const videoUrlInput = document.getElementById("videoUrlInput");
    const urlDownloadProgress = document.getElementById("urlDownloadProgress");
    const urlDownloadProgressText = document.getElementById("urlDownloadProgressText");
    const urlDownloadPercent = document.getElementById("urlDownloadPercent");
    const urlDownloadProgressTrack = document.getElementById("urlDownloadProgressTrack");
    const urlDownloadProgressBar = document.getElementById("urlDownloadProgressBar");
    const urlDownloadMetrics = document.getElementById("urlDownloadMetrics");

    const publisherModal = document.getElementById("publisherModal");
    const btnOpenPublisher = document.getElementById("btnOpenPublisher");
    const btnClosePublisher = document.getElementById("btnClosePublisher");
    const btnClosePublisherFooter = document.getElementById("btnClosePublisherFooter");
    const googleOAuthClientInput = document.getElementById("googleOAuthClientInput");
    const btnChooseGoogleClient = document.getElementById("btnChooseGoogleClient");
    const btnConnectYoutube = document.getElementById("btnConnectYoutube");
    const btnDisconnectYoutube = document.getElementById("btnDisconnectYoutube");
    const youtubeConnectionStatus = document.getElementById("youtubeConnectionStatus");
    const metaAppIdInput = document.getElementById("metaAppIdInput");
    const metaAppSecretInput = document.getElementById("metaAppSecretInput");
    const btnSaveMetaConfig = document.getElementById("btnSaveMetaConfig");
    const btnConnectFacebook = document.getElementById("btnConnectFacebook");
    const btnDisconnectFacebook = document.getElementById("btnDisconnectFacebook");
    const facebookConnectionStatus = document.getElementById("facebookConnectionStatus");
    const facebookPageSelect = document.getElementById("facebookPageSelect");
    const metaCallbackUri = document.getElementById("metaCallbackUri");
    const publisherVideoSelect = document.getElementById("publisherVideoSelect");
    const btnRefreshPublisherVideos = document.getElementById("btnRefreshPublisherVideos");
    const publisherTargetYoutube = document.getElementById("publisherTargetYoutube");
    const publisherTargetFacebook = document.getElementById("publisherTargetFacebook");
    const publisherTitleInput = document.getElementById("publisherTitleInput");
    const publisherTagsInput = document.getElementById("publisherTagsInput");
    const publisherDescriptionInput = document.getElementById("publisherDescriptionInput");
    const publisherScheduleInput = document.getElementById("publisherScheduleInput");
    const youtubePrivacyWrap = document.getElementById("youtubePrivacyWrap");
    const youtubePrivacySelect = document.getElementById("youtubePrivacySelect");
    const publisherAiDisclosure = document.getElementById("publisherAiDisclosure");
    const publisherRightsConfirm = document.getElementById("publisherRightsConfirm");
    const publisherProgress = document.getElementById("publisherProgress");
    const publisherResult = document.getElementById("publisherResult");
    const btnSubmitPublisher = document.getElementById("btnSubmitPublisher");

    const statusNotificationBox = document.getElementById("statusNotificationBox");
    const statusNotificationTitle = document.getElementById("statusNotificationTitle");
    const statusNotificationText = document.getElementById("statusNotificationText");

    const toastRegion = document.getElementById("toastRegion");
    const appDialog = document.getElementById("appDialog");
    const appDialogTitle = document.getElementById("appDialogTitle");
    const appDialogMessage = document.getElementById("appDialogMessage");
    const appDialogInput = document.getElementById("appDialogInput");
    const appDialogConfirm = document.getElementById("appDialogConfirm");
    const appDialogCancel = document.getElementById("appDialogCancel");
    let appDialogResolver = null;
    let appDialogMode = "confirm";

    function showToast(message, type) {
        if (!toastRegion) return;
        const text = String(message ?? "");
        const inferredType = type || (/កំហុស|បរាជ័យ|មិនត្រឹមត្រូវ|មិនអាច|failed|error/i.test(text) ? "error" : (/ជោគជ័យ|សម្រេច|រួចរាល់/i.test(text) ? "success" : "info"));
        const toast = document.createElement("div");
        const palette = inferredType === "error"
            ? "border-red-800 bg-red-950/95 text-red-100"
            : (inferredType === "success" ? "border-emerald-800 bg-emerald-950/95 text-emerald-100" : "border-base-700 bg-base-850/95 text-base-100");
        toast.className = `pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-xs shadow-2xl backdrop-blur transition-all ${palette}`;
        toast.setAttribute("role", inferredType === "error" ? "alert" : "status");
        const messageNode = document.createElement("p");
        messageNode.className = "flex-1 whitespace-pre-line leading-relaxed";
        messageNode.textContent = text;
        const close = document.createElement("button");
        close.type = "button";
        close.className = "shrink-0 text-current opacity-60 hover:opacity-100";
        close.setAttribute("aria-label", "បិទសារ");
        close.textContent = "×";
        close.addEventListener("click", () => toast.remove());
        toast.append(messageNode, close);
        toastRegion.appendChild(toast);
        setTimeout(() => toast.remove(), inferredType === "error" ? 8000 : 4500);
    }

    function showAppDialog(message, options = {}) {
        if (!appDialog) return Promise.resolve(options.mode === "prompt" ? null : false);
        if (appDialogResolver) appDialogResolver(options.mode === "prompt" ? null : false);
        appDialogMode = options.mode || "confirm";
        appDialogTitle.textContent = options.title || (appDialogMode === "prompt" ? "បញ្ចូលតម្លៃ" : "បញ្ជាក់សកម្មភាព");
        appDialogMessage.textContent = String(message ?? "");
        appDialogInput.classList.toggle("hidden", appDialogMode !== "prompt");
        appDialogInput.value = options.defaultValue ?? "";
        appDialogConfirm.textContent = options.confirmText || (appDialogMode === "prompt" ? "យល់ព្រម" : "បន្ត");
        appDialogCancel.textContent = options.cancelText || "បោះបង់";
        appDialogConfirm.className = `px-4 py-2 rounded-lg text-xs font-semibold transition ${options.danger ? "bg-red-500 hover:bg-red-400 text-white" : "bg-base-100 hover:bg-base-200 text-base-950"}`;
        appDialog.classList.remove("hidden");
        appDialog.classList.add("flex");
        if (appDialogMode === "prompt") appDialogInput.focus(); else appDialogConfirm.focus();
        return new Promise(resolve => { appDialogResolver = resolve; });
    }

    function finishAppDialog(confirmed) {
        if (!appDialogResolver) return;
        const resolve = appDialogResolver;
        appDialogResolver = null;
        appDialog.classList.add("hidden");
        appDialog.classList.remove("flex");
        resolve(confirmed ? (appDialogMode === "prompt" ? appDialogInput.value : true) : (appDialogMode === "prompt" ? null : false));
    }

    function showAppConfirm(message, options = {}) {
        return showAppDialog(message, { ...options, mode: "confirm" });
    }

    function showAppPrompt(message, defaultValue = "", options = {}) {
        return showAppDialog(message, { ...options, mode: "prompt", defaultValue });
    }

    appDialogConfirm?.addEventListener("click", () => finishAppDialog(true));
    appDialogCancel?.addEventListener("click", () => finishAppDialog(false));
    appDialog?.addEventListener("click", event => {
        if (event.target === appDialog) finishAppDialog(false);
    });
    appDialogInput?.addEventListener("keydown", event => {
        if (event.key === "Enter") finishAppDialog(true);
    });
    window.addEventListener("keydown", event => {
        if (event.key === "Escape" && appDialog && !appDialog.classList.contains("hidden")) finishAppDialog(false);
    });

    const liveProgressContainer = document.getElementById("liveProgressContainer");
    const liveProgressTitle = document.getElementById("liveProgressTitle");
    const liveProgressPercent = document.getElementById("liveProgressPercent");
    const liveProgressBar = document.getElementById("liveProgressBar");
    const liveProgressLatestText = document.getElementById("liveProgressLatestText");
    const liveProgressTime = document.getElementById("liveProgressTime");

    // --- Utility Functions ---

    function setStatus(title, message, isError = false) {
        statusNotificationTitle.textContent = title;
        statusNotificationText.textContent = message;
        if (isError) {
            statusNotificationBox.className = "rounded-lg p-3 bg-base-850 border border-zinc-700 text-xs flex items-start gap-2.5 transition text-zinc-300";
        } else {
            statusNotificationBox.className = "rounded-lg p-3 bg-base-850 border border-base-800 text-xs flex items-start gap-2.5 transition";
        }
    }

    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "00:00";
        const totalSecs = Math.floor(seconds);
        const hrs = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        if (hrs > 0) {
            return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
        }
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }

    function formatTimeDetailed(seconds) {
        if (isNaN(seconds) || seconds < 0) return "00:00.00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
    }

    // Table timestamps are displayed and edited as minutes:seconds, while the
    // application continues to store and process time in seconds internally.
    function formatSegmentTime(seconds) {
        if (!Number.isFinite(Number(seconds)) || Number(seconds) < 0) return "00:00.00";
        const totalCentiseconds = Math.round(Number(seconds) * 100);
        const mins = Math.floor(totalCentiseconds / 6000);
        const secs = Math.floor((totalCentiseconds % 6000) / 100);
        const centiseconds = totalCentiseconds % 100;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${centiseconds.toString().padStart(2, "0")}`;
    }

    function parseSegmentTime(value) {
        const input = String(value).trim();
        if (input.includes(":")) {
            const parts = input.split(":").map(Number);
            if (parts.length === 2 && parts.every(Number.isFinite)) {
                return Math.max(0, parts[0] * 60 + parts[1]);
            }
            if (parts.length === 3 && parts.every(Number.isFinite)) {
                return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
            }
            return NaN;
        }
        // A plain number is interpreted as decimal minutes for convenient entry.
        const minutes = Number(input);
        return Number.isFinite(minutes) ? Math.max(0, minutes * 60) : NaN;
    }

    function enableButton(button) {
        button.disabled = false;
        button.classList.remove("opacity-50", "cursor-not-allowed");
    }

    function disableButton(button) {
        button.disabled = true;
        button.classList.add("opacity-50", "cursor-not-allowed");
    }

    // --- Settings & LocalStorage Management ---

    function loadSavedSettings() {
        const savedKey = localStorage.getItem("gemini_api_key");
        if (savedKey) {
            geminiApiKeyInput.value = savedKey;
        }
        const supportedGeminiModels = [
            "gemini-3.8-flash",
            "gemini-3.5-flash",
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite"
        ];
        let savedModel = localStorage.getItem("gemini_model");
        if (!supportedGeminiModels.includes(savedModel)) {
            savedModel = "gemini-3.8-flash";
            localStorage.setItem("gemini_model", savedModel);
        }
        if (geminiModelSelect) {
            geminiModelSelect.value = savedModel;
        }
        if (testKeyStatus) {
            testKeyStatus.classList.add("hidden");
            testKeyStatus.textContent = "";
        }
        const savedTone = localStorage.getItem("translation_tone") || "conversational";
        if (translationToneSelect) {
            translationToneSelect.value = savedTone;
        }
        const savedGlossary = localStorage.getItem("custom_glossary") || "";
        if (customGlossaryInput) {
            customGlossaryInput.value = savedGlossary;
        }
        if (maleRateInput) maleRateInput.value = localStorage.getItem("male_rate") || 0;
        if (malePitchInput) malePitchInput.value = localStorage.getItem("male_pitch") || 0;
        if (femaleRateInput) femaleRateInput.value = localStorage.getItem("female_rate") || 0;
        if (femalePitchInput) femalePitchInput.value = localStorage.getItem("female_pitch") || 0;
    }

    btnOpenSettings.addEventListener("click", () => {
        loadSavedSettings();
        settingsModal.classList.remove("hidden");
    });

    btnCloseSettingsModal.addEventListener("click", () => {
        settingsModal.classList.add("hidden");
    });

    btnCancelSettings.addEventListener("click", () => {
        settingsModal.classList.add("hidden");
    });

    if (btnTestKey) {
        btnTestKey.addEventListener("click", async () => {
            const key = geminiApiKeyInput.value.trim();
            if (!key) {
                showToast("សូមបញ្ចូល Gemini API Key នៅក្នុងប្រអប់ជាមុនសិន!");
                geminiApiKeyInput.focus();
                return;
            }

            disableButton(btnTestKey);
            testKeyStatus.className = "text-[11px] mt-1.5 text-amber-300 block";
            testKeyStatus.textContent = "⏳ កំពុងតេស្តសោ API Key ជាមួយ Google Gemini...";

            try {
                const response = await fetch("/api/test-key", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        api_key: key,
                        model: geminiModelSelect ? geminiModelSelect.value : "gemini-3.8-flash"
                    })
                });

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.detail || "សោ API Key មិនដំណើរការ");
                }

                testKeyStatus.className = "text-[11px] mt-1.5 text-emerald-400 block font-medium";
                testKeyStatus.textContent = `✅ ${data.message}`;
            } catch (err) {
                testKeyStatus.className = "text-[11px] mt-1.5 text-red-400 block";
                testKeyStatus.textContent = `❌ ${err.message}`;
            } finally {
                enableButton(btnTestKey);
            }
        });
    }

    btnSaveKey.addEventListener("click", () => {
        const key = geminiApiKeyInput.value.trim();
        if (!key) {
            showToast("សូមបញ្ចូល Gemini API Key ត្រឹមត្រូវមួយ!");
            return;
        }
        localStorage.setItem("gemini_api_key", key);
        if (geminiModelSelect) {
            localStorage.setItem("gemini_model", geminiModelSelect.value);
        }
        if (translationToneSelect) {
            localStorage.setItem("translation_tone", translationToneSelect.value);
        }
        if (customGlossaryInput) {
            localStorage.setItem("custom_glossary", customGlossaryInput.value.trim());
        }
        if (maleRateInput) localStorage.setItem("male_rate", maleRateInput.value);
        if (malePitchInput) localStorage.setItem("male_pitch", malePitchInput.value);
        if (femaleRateInput) localStorage.setItem("female_rate", femaleRateInput.value);
        if (femalePitchInput) localStorage.setItem("female_pitch", femalePitchInput.value);

        showToast("បានរក្សាទុកការកំណត់ និងសោ API Key ដោយជោគជ័យ!");
        settingsModal.classList.add("hidden");
        const modelName = geminiModelSelect ? geminiModelSelect.value : "gemini-3.8-flash";
        setStatus("ការកំណត់", `សោ API Key, ម៉ូដែល (${modelName}), និងការកំណត់សំឡេងត្រូវបានរក្សាទុក។`);
    });

    // --- Video Upload Handling ---

    btnLoadVideo.addEventListener("click", () => {
        videoFileInput.click();
    });

    videoFileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        state.currentVideoFile = file;
        lblCurrentFilename.textContent = file.name;
        setStatus("កំពុងផ្ទុកវីដេអូ", "សូមរង់ចាំបន្តិច កំពុងបញ្ជូនឯកសារទៅម៉ាស៊ីនបម្រើ...");

        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await fetch("/api/upload", {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "ការផ្ទុកវីដេអូបរាជ័យ");
            }

            const data = await response.json();
            if (state.currentVideoFilename !== data.filename) {
                state.copyrightReview = defaultRightsReview();
                state.segments = [];
                state.speakerProfiles = defaultSpeakerProfiles();
                resetHistory();
                renderSegmentsTable();
                renderTimelineTracks();
            }
            state.currentVideoFilename = data.filename;
            state.backgroundAudioUrl = null;
            state.backgroundAudioVideoFilename = "";
            updateDialogueSeparationButton();
            state.currentVideoDuration = data.duration || 0;
            if (lblAudioStatus) lblAudioStatus.textContent = "សំឡេងដើម";
            const removeVoiceLabel = btnRemoveVoice.querySelector("span");
            if (removeVoiceLabel) removeVoiceLabel.textContent = "លុបសំឡេងដើម";
            syncRightsReviewControls();
            updateProjectDirtyStatus();
            scheduleAutosave();

            // Update Video Player
            videoElement.src = data.video_url;
            videoElement.controls = true;
            videoEmptyPlaceholder.classList.add("hidden");
            videoDurationBadge.textContent = `00:00 / ${formatTime(data.duration)}`;
            videoElement.onloadedmetadata = () => {
                if (videoElement.duration && videoElement.duration > 0) {
                    state.currentVideoDuration = videoElement.duration;
                    videoDurationBadge.textContent = `00:00 / ${formatTime(videoElement.duration)}`;
                    updateProjectDirtyStatus();
                    scheduleAutosave();
                }
            };

            // Enable next action buttons
            enableButton(btnTranscribe);
            enableButton(btnRemoveVoice);
            setStatus("ជោគជ័យ", "បានផ្ទុកវីដេអូរួចរាល់! លោកអ្នកអាចចុច 'បម្លែងអត្ថបទ' ដើម្បីចាប់ផ្តើម។");
        } catch (error) {
            console.error(error);
            showToast(`កំហុសក្នុងការផ្ទុកវីដេអូ: ${error.message}`);
            setStatus("បរាជ័យ", error.message, true);
        }
    });

    const chkLiveVoiceSync = document.getElementById("chkLiveVoiceSync");
    const chkOriginalSound = document.getElementById("chkOriginalSound");
    const originalSoundToggleStatus = document.getElementById("originalSoundToggleStatus");
    try {
        if (chkOriginalSound) chkOriginalSound.checked = localStorage.getItem("ai_dubber_original_sound") !== "off";
    } catch (error) { /* Keep the default on if local storage is unavailable. */ }
    let currentPlayingAudioSegId = null;

    function updateOriginalSoundPlayback() {
        if (!videoElement || !chkOriginalSound) return;
        const enabled = chkOriginalSound.checked;
        const duckingForDub = enabled && chkLiveVoiceSync?.checked && !videoElement.paused && currentPlayingAudioSegId !== null;
        videoElement.muted = !enabled;
        videoElement.volume = duckingForDub ? 0.15 : 1.0;
        if (originalSoundToggleStatus) originalSoundToggleStatus.textContent = enabled ? "បើក" : "បិទ";
    }

    if (chkOriginalSound) chkOriginalSound.addEventListener("change", () => {
        try { localStorage.setItem("ai_dubber_original_sound", chkOriginalSound.checked ? "on" : "off"); } catch (error) { /* Toggle still works for this session. */ }
        updateOriginalSoundPlayback();
    });

    if (chkLiveVoiceSync) chkLiveVoiceSync.addEventListener("change", () => {
        if (!chkLiveVoiceSync.checked) {
            currentPlayingAudioSegId = null;
            previewAudioElement.pause();
        }
        updateOriginalSoundPlayback();
    });

    function updateSubtitleOverlay() {
        if (!liveSubtitleOverlay || !videoElement) return;
        const current = videoElement.currentTime || 0;
        const activeSeg = state.segments.find(seg => current >= Number(seg.start) && current <= Number(seg.end));
        const subtitleText = activeSeg?.translated_text || activeSeg?.original_text || "";
        if (state.showLiveSubtitles && subtitleText) {
            liveSubtitleOverlay.querySelector("span").textContent = subtitleText;
            liveSubtitleOverlay.classList.remove("hidden");
        } else {
            liveSubtitleOverlay.classList.add("hidden");
        }
    }

    if (btnToggleLiveSubtitles) {
        btnToggleLiveSubtitles.addEventListener("click", () => {
            state.showLiveSubtitles = !state.showLiveSubtitles;
            btnToggleLiveSubtitles.setAttribute("aria-pressed", String(state.showLiveSubtitles));
            btnToggleLiveSubtitles.title = state.showLiveSubtitles
                ? "បិទ Subtitle ក្នុងផ្ទាំងមើល"
                : "បើក Subtitle ក្នុងផ្ទាំងមើល";
            const label = btnToggleLiveSubtitles.querySelector("span");
            if (label) label.textContent = state.showLiveSubtitles ? "បើក" : "បិទ";
            updateSubtitleOverlay();
        });
    }

    videoElement.addEventListener("timeupdate", () => {
        const current = videoElement.currentTime;
        const total = videoElement.duration || state.currentVideoDuration || 1;
        videoDurationBadge.textContent = `${formatTime(current)} / ${formatTime(total)}`;

        // Move Timeline Playhead
        const percent = Math.min(100, Math.max(0, (current / total) * 100));
        timelinePlayhead.style.left = `${percent}%`;
        if (timelineCurrentTime) {
            timelineCurrentTime.textContent = formatTimeDetailed(current);
        }

        // Auto-scroll timeline to follow playhead when playing
        if (!videoElement.paused && timelineContainer && timelineContentWrapper) {
            const playheadPx = (percent / 100) * timelineContentWrapper.offsetWidth;
            const scrollLeft = timelineContainer.scrollLeft;
            const viewWidth = timelineContainer.clientWidth;
            if (playheadPx < scrollLeft || playheadPx > scrollLeft + viewWidth - 80) {
                timelineContainer.scrollLeft = Math.max(0, playheadPx - viewWidth / 4);
            }
        }

        // Match Live Subtitle & Synchronized Dubbing Preview
        const activeSeg = state.segments.find(s => current >= s.start && current <= s.end);
        if (currentPlayingAudioSegId !== null && (!activeSeg || activeSeg.id !== currentPlayingAudioSegId)) {
            currentPlayingAudioSegId = null;
            previewAudioElement.pause();
        }
        if (activeSeg && (activeSeg.translated_text || activeSeg.original_text)) {
            const textToShow = activeSeg.translated_text || activeSeg.original_text;
            liveSubtitleOverlay.querySelector("span").textContent = textToShow;
            liveSubtitleOverlay.classList.toggle("hidden", !state.showLiveSubtitles);
            state.activeSegmentId = activeSeg.id;

            // Live Dubbing Audio Sync
            if (chkLiveVoiceSync && chkLiveVoiceSync.checked && activeSeg.audio_url) {
                if (currentPlayingAudioSegId !== activeSeg.id && !videoElement.paused) {
                    currentPlayingAudioSegId = activeSeg.id;
                    previewAudioElement.src = activeSeg.audio_url;
                    previewAudioElement.currentTime = Math.max(0, current - activeSeg.start);
                    previewAudioElement.play().catch(() => {});
                }
            }
        } else {
            liveSubtitleOverlay.classList.add("hidden");
            state.activeSegmentId = null;
        }
        updateOriginalSoundPlayback();
    });

    videoElement.addEventListener("pause", () => {
        currentPlayingAudioSegId = null;
        previewAudioElement.pause();
        updateOriginalSoundPlayback();
    });

    videoElement.addEventListener("seeking", () => {
        currentPlayingAudioSegId = null;
        previewAudioElement.pause();
        updateOriginalSoundPlayback();
    });

    // Timeline Seeking & Playhead Scrubbing
    let isScrubbing = false;

    function seekTimelineByEvent(e) {
        if (!state.currentVideoFilename || !videoElement.duration) return;
        const targetWrapper = timelineContentWrapper || timelineContainer;
        const rect = targetWrapper.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, clickX / rect.width));
        videoElement.currentTime = ratio * videoElement.duration;
    }

    if (timelineContainer) {
        timelineContainer.addEventListener("pointerdown", (e) => {
            if (e.target.closest("[data-seg-id]") || e.target.classList.contains("resize-handle-left") || e.target.classList.contains("resize-handle-right")) {
                return;
            }
            isScrubbing = true;
            seekTimelineByEvent(e);
        });

        window.addEventListener("pointermove", (e) => {
            if (isScrubbing) {
                seekTimelineByEvent(e);
            }
        });

        window.addEventListener("pointerup", () => {
            isScrubbing = false;
        });
    }

    // --- Transcription (/api/transcribe-stream with Real-Time Progress) ---

    btnTranscribe.addEventListener("click", async () => {
        if (!state.currentVideoFilename) {
            showToast("សូមផ្ទុកវីដេអូជាមុនសិន!");
            return;
        }

        disableButton(btnTranscribe);
        setStatus("កំពុងបម្លែងអត្ថបទ", "ម៉ាស៊ីន AI (faster-whisper) កំពុងស្តាប់ និងស្រង់អត្ថបទដើម... សូមរង់ចាំ។");

        // Show live progress UI
        liveProgressContainer.classList.remove("hidden");
        liveProgressContainer.style.display = "block";
        liveProgressBar.classList.add("is-indeterminate");
        liveProgressBar.style.removeProperty("width");
        liveProgressBar.classList.remove("animate-pulse");
        liveProgressPercent.textContent = "…";
        const progressTrack = liveProgressBar.parentElement;
        progressTrack?.setAttribute("role", "progressbar");
        progressTrack?.setAttribute("aria-label", "Transcription progress");
        progressTrack?.setAttribute("aria-valuemin", "0");
        progressTrack?.setAttribute("aria-valuemax", "100");
        progressTrack?.removeAttribute("aria-valuenow");
        progressTrack?.setAttribute("aria-valuetext", "Waiting for the first recognized caption");
        liveProgressLatestText.textContent = "កំពុងផ្ទុកម៉ូដែល AI...";
        const vidDuration = videoElement.duration || state.currentVideoDuration || 0;
        liveProgressTime.textContent = `00:00 / ${formatTime(vidDuration)}`;

        // Keep the latest streamed captions so a restarted local server or page can resume.
        const resumeOffset = state.segments.reduce((latest, segment) => Math.max(latest, Number(segment.end) || 0), 0);
        if (resumeOffset <= 0) {
            resetHistory();
            state.segments = [];
            renderSegmentsTable();
            renderTimelineTracks();
        } else {
            liveProgressLatestText.textContent = `Resuming from ${formatTime(resumeOffset)} (${state.segments.length} saved captions)`;
        }

        const formData = new FormData();
        formData.append("filename", state.currentVideoFilename);
        formData.append("duration", vidDuration);
        formData.append("start_offset", resumeOffset);
        formData.append("segment_id_start", state.segments.length + 1);

        let transcriptionCompleted = false;
        try {
            const response = await fetch("/api/transcribe-stream", {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "ការបម្លែងអត្ថបទបរាជ័យ");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split("\n\n");
                buffer = parts.pop(); // keep remainder

                for (const part of parts) {
                    const lines = part.split("\n");
                    for (const rawLine of lines) {
                        const trimmed = rawLine.trim();
                        if (!trimmed.startsWith("data:")) continue;
                        const jsonStr = trimmed.slice(5).trim();
                        let event;
                        try {
                            event = JSON.parse(jsonStr);
                        } catch (parseErr) {
                            console.error("SSE parse error", parseErr, jsonStr);
                            continue;
                        }

                        if (event.type === "status") {
                            liveProgressLatestText.textContent = event.message;
                            if (liveProgressBar.classList.contains("is-indeterminate")) {
                                progressTrack?.setAttribute("aria-valuetext", event.message);
                            }
                        } else if (event.type === "init") {
                            liveProgressTime.textContent = `00:00 / ${formatTime(event.total_duration)}`;
                        } else if (event.type === "progress" && event.segment) {
                            liveProgressBar.classList.remove("animate-pulse", "is-indeterminate");
                            const pct = event.percent;
                            liveProgressBar.style.width = `${Math.max(3, pct)}%`;
                            liveProgressPercent.textContent = `${pct}%`;
                            progressTrack?.setAttribute("aria-valuenow", String(Math.min(100, Math.max(0, pct))));
                            progressTrack?.setAttribute("aria-valuetext", `${pct}% complete`);
                            liveProgressTime.textContent = `${formatTime(event.current_time)} / ${formatTime(event.total_duration)}`;
                            liveProgressLatestText.textContent = event.segment.original_text;

                            // Stream new segment into table and timeline in real-time.
                            state.segments.push(event.segment);
                            if (state.segments.length % 5 === 0) scheduleAutosave();
                            // Keep small transcripts visible while longer videos avoid per-segment full redraws.
                            if (state.segments.length < 250 || state.segments.length % 250 === 0) renderSegmentsTable();
                        } else if (event.type === "complete") {
                            transcriptionCompleted = true;
                            state.segments = event.segments || state.segments;
                            scheduleAutosave();
                            liveProgressBar.classList.remove("animate-pulse", "is-indeterminate");
                            liveProgressBar.style.width = "100%";
                            liveProgressPercent.textContent = "100%";
                            progressTrack?.setAttribute("aria-valuenow", "100");
                            progressTrack?.setAttribute("aria-valuetext", "100% complete");
                            liveProgressLatestText.textContent = `ការបម្លែងបានបញ្ចប់ ១០០%! (សរុប ${event.total_count} segments)`;

                            setTimeout(() => {
                                liveProgressContainer.classList.add("hidden");
                                liveProgressContainer.style.display = "none";
                            }, 3000);

                            renderSegmentsTable();
                            renderTimelineTracks();
                            enableButton(btnTranscribe);
                            enableButton(btnTranslate);
                            if (btnExportSrt) enableButton(btnExportSrt);
                            if (btnExportVtt) enableButton(btnExportVtt);
                            setStatus("ជោគជ័យ", "ការបម្លែងអត្ថបទដើមបានសម្រេច! លោកអ្នកអាចចុច 'បកប្រែ' ទៅជាភាសាខ្មែរ។");
                            showToast("ការបម្លែងសំឡេងទៅជាអត្ថបទបានជោគជ័យ!");
                        } else if (event.type === "error") {
                            throw new Error(event.message || "Transcription failed.");
                        }
                    }
                }
            }

            if (!transcriptionCompleted) {
                throw new Error("The transcription stream ended before completion. Received captions were saved; click Transcribe to resume.");
            }
        } catch (error) {
            console.error(error);
            scheduleAutosave();
            renderSegmentsTable();
            renderTimelineTracks();
            enableButton(btnTranscribe);
            liveProgressBar.classList.remove("is-indeterminate", "animate-pulse");
            liveProgressContainer.classList.add("hidden");
            liveProgressContainer.style.display = "none";
            showToast(`កំហុសក្នុងការបម្លែងអត្ថបទ: ${error.message}`);
            setStatus("បរាជ័យ", error.message, true);
        }
    });

    // --- Translation (/api/translate via Stateless Gemini API) ---

    function untranslatedSegments() {
        return state.segments.filter(seg =>
            !String(seg.translated_text || "").trim() || String(seg.status || "").startsWith("បរាជ័យបកប្រែ:")
        );
    }

    function setTranslateButtonLabel(text) {
        const label = btnTranslate.querySelector("span");
        if (label) label.textContent = text;
    }

    btnTranslate.addEventListener("click", async () => {
        if (state.segments.length === 0) {
            showToast("មិនទាន់មាន Segment អត្ថបទសម្រាប់បកប្រែទេ!");
            return;
        }

        const apiKey = localStorage.getItem("gemini_api_key");
        if (!apiKey) {
            showToast("សូមបញ្ចូល Gemini API Key នៅក្នុងការកំណត់ជាមុនសិន!");
            settingsModal.classList.remove("hidden");
            return;
        }

        const pendingSegments = untranslatedSegments();
        if (!pendingSegments.length) {
            setStatus("រួចរាល់", "Segments ទាំងអស់មានអត្ថបទបកប្រែរួចហើយ។");
            showToast("មិនមាន Segment ដែលនៅសល់ត្រូវបកប្រែទេ។", "success");
            return;
        }

        disableButton(btnTranslate);
        setTranslateButtonLabel("កំពុងបកប្រែ...");
        setStatus("កំពុងបកប្រែ", `កំពុងបកប្រែ ${pendingSegments.length} segments ដែលនៅសល់...`);
        liveProgressContainer.style.display = "";
        liveProgressContainer.classList.remove("hidden");
        liveProgressTitle.innerHTML = `<span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-white animate-pulse"></span><span>កំពុងបកប្រែជាភាសាខ្មែរ (Gemini AI)...</span></span>`;
        liveProgressBar.style.width = "0%";
        liveProgressPercent.textContent = "0%";
        liveProgressLatestText.textContent = `នៅសល់ ${pendingSegments.length} segments...`;
        liveProgressTime.textContent = "";

        const model = localStorage.getItem("gemini_model") || (geminiModelSelect ? geminiModelSelect.value : "gemini-3.8-flash");
        const tone = localStorage.getItem("translation_tone") || (translationToneSelect ? translationToneSelect.value : "conversational");
        const glossary = localStorage.getItem("custom_glossary") || (customGlossaryInput ? customGlossaryInput.value : "");
        const BATCH_SIZE = 20;
        let completed = 0;
        let activeBatch = [];

        try {
            for (let offset = 0; offset < pendingSegments.length; offset += BATCH_SIZE) {
                activeBatch = pendingSegments.slice(offset, offset + BATCH_SIZE);
                const response = await fetch("/api/translate", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Gemini-Api-Key": apiKey,
                        "X-Gemini-Model": model
                    },
                    body: JSON.stringify({ segments: activeBatch, tone, glossary })
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    const requestError = new Error(err.detail || `ការបកប្រែបរាជ័យ (${response.status})`);
                    requestError.status = response.status;
                    throw requestError;
                }

                const data = await response.json();
                if (!Array.isArray(data.segments) || !data.segments.length) {
                    throw new Error("ម៉ាស៊ីនបម្រើមិនបានផ្ញើលទ្ធផលបកប្រែមកវិញទេ។");
                }

                const translatedById = new Map(data.segments.map(seg => [Number(seg.id), seg]));
                recordUndo();
                state.segments = state.segments.map(seg => translatedById.get(Number(seg.id)) || seg);
                activeBatch.forEach(seg => {
                    const translated = translatedById.get(Number(seg.id));
                    if (translated) translated.translated_text = String(translated.translated_text || "").trim();
                });
                completed += activeBatch.length;
                renderSegmentsTable();
                renderTimelineTracks();
                saveAutosaveSnapshot();
                activeBatch = [];

                const done = state.segments.length - untranslatedSegments().length;
                const percent = Math.round((done / state.segments.length) * 100);
                liveProgressBar.style.width = `${percent}%`;
                liveProgressPercent.textContent = `${percent}%`;
                liveProgressLatestText.textContent = `បានរក្សាទុកលទ្ធផល ${done}/${state.segments.length} segments`;
            }

            const remaining = untranslatedSegments().length;
            if (state.segments.some(seg => String(seg.translated_text || "").trim())) enableButton(btnGenerateVoice);
            if (btnExportSrt && state.segments.some(seg => String(seg.translated_text || "").trim())) enableButton(btnExportSrt);
            if (btnExportVtt && state.segments.some(seg => String(seg.translated_text || "").trim())) enableButton(btnExportVtt);

            if (remaining) {
                const done = state.segments.length - remaining;
                enableButton(btnTranslate);
                setTranslateButtonLabel(`បន្តបកប្រែ (${remaining})`);
                liveProgressContainer.classList.add("hidden");
                setStatus("នៅមានការបកប្រែ", `បានរក្សាទុកលទ្ធផលរួច ${done} segments; នៅសល់ ${remaining}។ ចុច «បកប្រែ» ម្ដងទៀតដើម្បីបន្ត។`, true);
                showToast(`បានរក្សាទុកលទ្ធផលរួច ${done} segments។ អាចចុចបកប្រែម្ដងទៀតដើម្បីបន្ត។`, "error");
                return;
            }

            liveProgressBar.style.width = "100%";
            liveProgressPercent.textContent = "100%";
            liveProgressLatestText.textContent = "ការបកប្រែបានបញ្ចប់!";
            saveAutosaveSnapshot();
            setTimeout(() => liveProgressContainer.classList.add("hidden"), 1500);
            enableButton(btnTranslate);
            setTranslateButtonLabel("បកប្រែ");
            setStatus("ជោគជ័យ", `បានបកប្រែ និងរក្សាទុក ${completed} segments ដែលនៅសល់។`);
            if (completed > 0 && await showAppConfirm("ការបកប្រែជាភាសាខ្មែរបានជោគជ័យ!\n\nតើអ្នកចង់បង្កើតសំឡេង AI និយាយខ្មែរឥឡូវនេះដែរឬទេ?", { title: "បង្កើតសំឡេង", confirmText: "បង្កើតសំឡេង" })) {
                btnGenerateVoice.click();
            }
        } catch (error) {
            console.error(error);
            if (error.status !== 401 && activeBatch.length) {
                const reason = String(error.message || "កំហុសបណ្តាញ").slice(0, 45);
                activeBatch.forEach(batchSeg => {
                    const current = state.segments.find(seg => Number(seg.id) === Number(batchSeg.id));
                    if (current && !String(current.translated_text || "").trim()) current.status = `បរាជ័យបកប្រែ: ${reason}`;
                });
                renderSegmentsTable();
                saveAutosaveSnapshot();
            }
            enableButton(btnTranslate);
            liveProgressContainer.classList.add("hidden");
            if (error.status === 401) {
                setTranslateButtonLabel("បកប្រែ");
                showToast(error.message || "Gemini API Key មិនត្រឹមត្រូវទេ! សូមពិនិត្យការកំណត់ឡើងវិញ។");
                settingsModal.classList.remove("hidden");
                setStatus("បញ្ហាសោ API", "សូមពិនិត្យមើល Gemini API Key របស់អ្នក។", true);
            } else {
                const remaining = untranslatedSegments().length;
                setTranslateButtonLabel(remaining ? `បន្តបកប្រែ (${remaining})` : "បកប្រែ");
                const savedCount = state.segments.length - remaining;
                const message = `${error.message} លទ្ធផល ${savedCount} segments ដែលបានបកប្រែរួចត្រូវបានរក្សាទុក។ ចុច «បន្តបកប្រែ» ដើម្បីបន្ត។`;
                showToast(message, "error");
                setStatus("ការភ្ជាប់ត្រូវបានរំខាន", message, true);
            }
        }
    });

    // --- Text-To-Speech Voice Generation (/api/generate-voice) ---

    async function runVoiceGeneration(targetSegments, askToExport = false) {
        if (!targetSegments.length) {
            showToast("មិនមាន Segment ដែលត្រូវបង្កើតសំឡេងទេ!");
            return;
        }

        const generateWasDisabled = btnGenerateVoice.disabled;
        disableButton(btnGenerateVoice);
        if (btnRetryFailedVoice) btnRetryFailedVoice.disabled = true;
        setStatus("កំពុងបង្កើតសំឡេង", `កំពុងបង្កើតសំឡេង AI សម្រាប់ ${targetSegments.length} segments...`);
        liveProgressContainer.classList.remove("hidden");
        liveProgressTitle.innerHTML = `<span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-white animate-pulse"></span><span>កំពុងបង្កើតសំឡេងនិយាយ (TTS)...</span></span>`;
        liveProgressBar.style.width = "60%";
        liveProgressPercent.textContent = "កំពុងដំណើរការ...";
        liveProgressLatestText.textContent = `កំពុងសំយោគសំឡេងខ្មែរ ${targetSegments.length} segments...`;
        liveProgressTime.textContent = "";

        const maleRate = parseInt(localStorage.getItem("male_rate") || (maleRateInput ? maleRateInput.value : 0)) || 0;
        const malePitch = parseInt(localStorage.getItem("male_pitch") || (malePitchInput ? malePitchInput.value : 0)) || 0;
        const femaleRate = parseInt(localStorage.getItem("female_rate") || (femaleRateInput ? femaleRateInput.value : 0)) || 0;
        const femalePitch = parseInt(localStorage.getItem("female_pitch") || (femalePitchInput ? femalePitchInput.value : 0)) || 0;

        try {
            const response = await fetch("/api/generate-voice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    segments: targetSegments,
                    male_rate: maleRate,
                    male_pitch: malePitch,
                    female_rate: femaleRate,
                    female_pitch: femalePitch,
                    auto_fit: true
                })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "ការបង្កើតសំឡេងបរាជ័យ");
            }

            const data = await response.json();
            const updatedById = new Map((data.segments || []).map(seg => [Number(seg.id), seg]));
            recordUndo();
            state.segments = state.segments.map(seg => updatedById.get(Number(seg.id)) || seg);
            audioFitIssueById.clear();
            renderSegmentsTable();
            renderTimelineTracks();
            scheduleAutosave();

            const resultSegments = targetSegments.map(seg => updatedById.get(Number(seg.id))).filter(Boolean);
            const failedCount = resultSegments.filter(seg => !seg.audio_url || String(seg.status || "").startsWith("បរាជ័យ:")).length;
            const successCount = resultSegments.length - failedCount;
            liveProgressBar.style.width = "100%";
            liveProgressPercent.textContent = "100%";
            liveProgressLatestText.textContent = `បានបង្កើត ${successCount} · បរាជ័យ ${failedCount}`;
            setTimeout(() => liveProgressContainer.classList.add("hidden"), 2500);

            if (state.segments.some(seg => seg.audio_url)) enableButton(btnExportVideo);
            const summary = failedCount
                ? `បានបង្កើត ${successCount} segments; នៅសល់បរាជ័យ ${failedCount} segments។ អាចចុចប៊ូតុងសាកម្ដងទៀត។`
                : `បានបង្កើតសំឡេងរួចរាល់ ${successCount} segments។`;
            setStatus(failedCount ? "បង្កើតសំឡេងបានខ្លះ" : "ជោគជ័យ", summary, failedCount > 0);
            if (failedCount) showToast(summary, "error");

            if (askToExport && failedCount === 0 && successCount > 0 && await showAppConfirm("ការបង្កើតសំឡេងនិយាយខ្មែរបានជោគជ័យ!\n\nតើអ្នកចង់នាំចេញវីដេអូដែលមានសំឡេង AI ឥឡូវនេះដែរឬទេ?", { title: "បង្កើតសំឡេង", confirmText: "នាំចេញ" })) {
                btnExportVideo.click();
            }
        } catch (error) {
            console.error(error);
            recordUndo();
            const reason = String(error.message || "កំហុសមិនស្គាល់").slice(0, 55);
            targetSegments.forEach(seg => {
                const current = state.segments.find(item => Number(item.id) === Number(seg.id));
                if (current) current.status = `បរាជ័យ: ${reason}`;
            });
            renderSegmentsTable();
            scheduleAutosave();
            showToast(`កំហុសក្នុងការបង្កើតសំឡេង: ${error.message}`);
            setStatus("បរាជ័យ", error.message, true);
        } finally {
            if (!generateWasDisabled) enableButton(btnGenerateVoice);
            isRetryingFailedVoice = false;
            updateRetryFailedVoiceButton();
            liveProgressContainer.classList.add("hidden");
        }
    }

    btnGenerateVoice.addEventListener("click", async () => {
        await runVoiceGeneration([...state.segments], true);
    });

    if (btnRetryFailedVoice) btnRetryFailedVoice.addEventListener("click", async () => {
        const retrySegments = failedVoiceSegments();
        if (!retrySegments.length || isRetryingFailedVoice) return;
        isRetryingFailedVoice = true;
        updateRetryFailedVoiceButton();
        await runVoiceGeneration(retrySegments, false);
    });

    // --- Remove Voice Track (/api/remove-voice) ---

    btnRemoveVoice.addEventListener("click", async () => {
        if (!state.currentVideoFilename) {
            showToast("សូមផ្ទុកវីដេអូជាមុនសិន!");
            return;
        }

        disableButton(btnRemoveVoice);
        setStatus("កំពុងលុបសំឡេងដើម", "ប្រព័ន្ធកំពុងបំបែក និងលុបសំឡេងចេញពីវីដេអូ...");

        try {
            const response = await fetch("/api/remove-voice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    video_filename: state.currentVideoFilename
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "ការលុបសំឡេងបរាជ័យ");
            }

            const data = await response.json();
            if (!data.video_url || !data.filename) throw new Error("ម៉ាស៊ីនមេមិនបានផ្ញើឯកសារវីដេអូលទ្ធផលមកទេ។");

            const resumeAt = Number(videoElement.currentTime) || 0;
            state.currentVideoFilename = data.filename;
            state.backgroundAudioUrl = null;
            state.backgroundAudioVideoFilename = "";
            updateDialogueSeparationButton();
            state.currentVideoFile = null;
            lblCurrentFilename.textContent = data.filename;
            videoElement.src = data.video_url;
            videoElement.controls = true;
            videoElement.load();
            scheduleAutosave();
            videoElement.onloadedmetadata = () => {
                if (Number.isFinite(videoElement.duration) && videoElement.duration > 0) {
                    state.currentVideoDuration = videoElement.duration;
                    videoDurationBadge.textContent = `00:00 / ${formatTime(videoElement.duration)}`;
                    videoElement.currentTime = Math.min(resumeAt, Math.max(0, videoElement.duration - 0.05));
                    scheduleAutosave();
                }
            };
            if (lblAudioStatus) {
                lblAudioStatus.textContent = "សំឡេងដើមត្រូវបានលុប";
                lblAudioStatus.className = "px-2 py-0.5 rounded bg-base-800 border border-base-750 text-[11px] text-base-400";
            }
            const removeVoiceLabel = btnRemoveVoice.querySelector("span");
            if (removeVoiceLabel) removeVoiceLabel.textContent = "បានលុបសំឡេងដើម";

            enableButton(btnRemoveVoice);
            updateProjectDirtyStatus();
            setStatus("ជោគជ័យ", "បានបង្កើតវីដេអូគ្មានសំឡេងដើម និងបើកលទ្ធផលក្នុង player រួចរាល់!");
            showToast("បានលុបសំឡេងដើម ហើយប្ដូរ player ទៅវីដេអូលទ្ធផលរួចរាល់!");
        } catch (error) {
            console.error(error);
            enableButton(btnRemoveVoice);
            showToast(`កំហុសក្នុងការលុបសំឡេង: ${error.message}`);
            setStatus("បរាជ័យ", error.message, true);
        }
    });

    // --- Automatic vertical clip editing (/api/auto-edit) ---
    function closeAutoReelModal() {
        if (autoReelModal) autoReelModal.classList.add("hidden");
    }

    if (btnAutoReel && autoReelModal) {
        btnAutoReel.addEventListener("click", () => {
            if (!state.currentVideoFilename) {
                showToast("Load a video before making Reels.");
                return;
            }
            autoReelModal.classList.remove("hidden");
            autoReelProgress.classList.add("hidden");
            autoReelResults.classList.add("hidden");
            autoReelResultList.replaceChildren();
            btnCreateAutoReels.disabled = false;
        });
    }
    if (btnCloseAutoReel) btnCloseAutoReel.addEventListener("click", closeAutoReelModal);
    if (btnCancelAutoReel) btnCancelAutoReel.addEventListener("click", closeAutoReelModal);
    if (autoReelModal) autoReelModal.addEventListener("click", event => {
        if (event.target === autoReelModal) closeAutoReelModal();
    });

    if (btnCreateAutoReels) {
        btnCreateAutoReels.addEventListener("click", async () => {
            if (!state.currentVideoFilename) {
                showToast("Load a video before making Reels.", "error");
                return;
            }
            if (!state.segments.length) {
                showToast("Transcribe the video first so the editor can find dialogue-rich moments.", "error");
                return;
            }

            btnCreateAutoReels.disabled = true;
            autoReelProgress.textContent = "Rendering vertical clips with FFmpeg. This can take a few minutes for long videos…";
            autoReelProgress.classList.remove("hidden");
            autoReelResults.classList.add("hidden");
            autoReelResultList.replaceChildren();

            try {
                let backgroundAudioUrl = state.backgroundAudioVideoFilename === state.currentVideoFilename
                    ? state.backgroundAudioUrl
                    : null;
                if (autoReelRemoveDialogue.checked && !backgroundAudioUrl) {
                    autoReelProgress.textContent = "Separating dialogue from accompaniment with Demucs…";
                    const separationResponse = await fetch("/api/separate-dialogue", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ video_filename: state.currentVideoFilename })
                    });
                    const separationData = await separationResponse.json();
                    if (!separationResponse.ok) throw new Error(separationData.detail || "Dialogue separation failed.");
                    backgroundAudioUrl = separationData.background_audio_url;
                    state.backgroundAudioUrl = backgroundAudioUrl;
                    state.backgroundAudioVideoFilename = state.currentVideoFilename;
                    updateDialogueSeparationButton();
                    scheduleAutosave();
                }
                autoReelProgress.textContent = "Rendering vertical clips with FFmpeg. This can take a few minutes for long videos…";

                const response = await fetch("/api/auto-edit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        video_filename: state.currentVideoFilename,
                        segments: state.segments,
                        clip_count: Number(autoReelCount.value) || 3,
                        target_seconds: Number(autoReelLength.value) || 30,
                        burn_captions: Boolean(autoReelCaptions.checked),
                        blur_bottom_captions: Boolean(autoReelBlurCaptions.checked),
                        background_audio_url: autoReelRemoveDialogue.checked ? backgroundAudioUrl : null
                    })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.detail || "Auto edit failed.");

                const formatTime = seconds => {
                    const total = Math.max(0, Math.floor(Number(seconds) || 0));
                    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
                };
                for (const [index, clip] of (data.clips || []).entries()) {
                    const item = document.createElement("li");
                    item.className = "flex items-center justify-between gap-3 rounded-lg border border-base-800 bg-base-900 px-3 py-2";
                    const details = document.createElement("span");
                    details.className = "min-w-0 text-[11px] text-base-300";
                    details.textContent = `Clip ${index + 1} · ${formatTime(clip.start_seconds)} · ${Math.round(clip.duration_seconds)} sec`;
                    const link = document.createElement("a");
                    link.href = clip.download_url;
                    link.download = clip.filename || `auto_reel_${index + 1}.mp4`;
                    link.className = "shrink-0 rounded bg-base-100 px-2.5 py-1 text-[10px] font-semibold text-base-950 hover:bg-base-200";
                    link.textContent = "Download MP4";
                    item.append(details, link);
                    autoReelResultList.append(item);
                }
                autoReelProgress.classList.add("hidden");
                autoReelResults.classList.remove("hidden");
                showToast(`Created ${(data.clips || []).length} vertical clip(s).`);
                window.lucide?.createIcons();
            } catch (error) {
                console.error(error);
                autoReelProgress.textContent = error.message || "Auto edit failed.";
                showToast(error.message || "Auto edit failed.", "error");
            } finally {
                btnCreateAutoReels.disabled = false;
            }
        });
    }

    // --- Video Export Flow (/api/export-video) ---

    btnExportVideo.addEventListener("click", () => {
        exportModal.classList.remove("hidden");
        syncRightsReviewControls();
        renderExportPreflight();
        exportProgressContainer.classList.add("hidden");
        exportSuccessContainer.classList.add("hidden");
        btnConfirmExport.disabled = false;
    });

    btnCloseExportModal.addEventListener("click", () => {
        exportModal.classList.add("hidden");
    });

    btnCancelExport.addEventListener("click", () => {
        exportModal.classList.add("hidden");
    });
    if (btnRefreshExportCheck) btnRefreshExportCheck.addEventListener("click", renderExportPreflight);
    rightsReviewCheckboxes.forEach(input => input.addEventListener("change", () => {
        state.copyrightReview[input.dataset.rightsKey] = input.checked;
        updateRightsReviewProgress();
        scheduleAutosave();
    }));
    if (rightsReviewNotes) rightsReviewNotes.addEventListener("input", () => {
        state.copyrightReview.notes = rightsReviewNotes.value;
        scheduleAutosave();
    });

        const subStylerPanel = document.getElementById("subStylerPanel");
    if (chkBurnSubtitles && subStylerPanel) {
        chkBurnSubtitles.addEventListener("change", () => {
            subStylerPanel.classList.toggle("hidden", !chkBurnSubtitles.checked);
        });
    }

    btnConfirmExport.addEventListener("click", async () => {
        const preflight = renderExportPreflight();
        if (preflight.blocking) {
            showToast("សូមផ្ទុកវីដេអូ និងបន្ថែម segments មុននាំចេញ។", "error");
            return;
        }
        if (preflight.warnings.length) {
            const warningText = preflight.warnings.map(row => `• ${row.label}`).join("\n");
            const proceed = await showAppConfirm(`មុននាំចេញ សូមពិនិត្យចំណុចខាងក្រោម:\n\n${warningText}\n\nតើអ្នកចង់បន្តនាំចេញទេ?`, { title: "ពិនិត្យមុននាំចេញ", confirmText: "បន្តនាំចេញ" });
            if (!proceed) return;
        }
        const audioOption = document.querySelector('input[name="exportAudioOption"]:checked')?.value || "sidechain";
        const muteOriginal = (audioOption === "mute");
        const burnSubtitles = chkBurnSubtitles ? chkBurnSubtitles.checked : false;

        btnConfirmExport.disabled = true;
        exportProgressContainer.classList.remove("hidden");
        exportSuccessContainer.classList.add("hidden");
        setStatus("កំពុងនាំចេញវីដេអូ", "FFmpeg កំពុងផ្គុំរូបភាព សំឡេង និង Subtitle... សូមរង់ចាំ។");

        try {
            const response = await fetch("/api/export-video", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    video_filename: state.currentVideoFilename,
                    segments: state.segments,
                    audio_mode: audioOption,
                    mute_original_audio: muteOriginal,
                    background_volume: muteOriginal ? 0.0 : 0.15,
                    background_audio_url: state.backgroundAudioVideoFilename === state.currentVideoFilename ? state.backgroundAudioUrl : null,
                    burn_subtitles: burnSubtitles,
                    sub_font_size: Number(exportSubFontSize?.value || 20),
                    sub_color: exportSubColor?.value || "white",
                    sub_style: exportSubStyle?.value || "box",
                    sub_position: exportSubPosition?.value || "bottom"
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "ការនាំចេញវីដេអូបរាជ័យ");
            }

            const data = await response.json();
            exportProgressContainer.classList.add("hidden");
            exportSuccessContainer.classList.remove("hidden");
            exportDownloadLink.href = data.download_url;

            setStatus("ជោគជ័យ", "ការនាំចេញវីដេអូបានសម្រេចដោយជោគជ័យ!");
            showToast("ការនាំចេញវីដេអូបានសម្រេចដោយជោគជ័យ!");
        } catch (error) {
            console.error(error);
            exportProgressContainer.classList.add("hidden");
            btnConfirmExport.disabled = false;
            showToast(`កំហុសក្នុងការនាំចេញវីដេអូ: ${error.message}`);
            setStatus("បរាជ័យ", error.message, true);
        }
    });

    if (btnSeparateDialogue) {
        btnSeparateDialogue.addEventListener("click", async () => {
            if (!state.currentVideoFilename) {
                showToast("Load a video before separating dialogue.");
                return;
            }
            if (state.backgroundAudioUrl && state.backgroundAudioVideoFilename === state.currentVideoFilename) {
                state.backgroundAudioUrl = null;
                state.backgroundAudioVideoFilename = "";
                updateDialogueSeparationButton();
                const label = btnSeparateDialogue.querySelector("span");
                if (label) label.textContent = "Separate Dialogue";
                scheduleAutosave();
                showToast("Original video audio will be used again during export.");
                return;
            }
            btnSeparateDialogue.disabled = true;
            setStatus("Separating dialogue", "Demucs is separating the dialogue and accompaniment. This may take a while.");
            try {
                const response = await fetch("/api/separate-dialogue", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ video_filename: state.currentVideoFilename })
                });
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || "Could not separate the dialogue.");
                }
                const data = await response.json();
                state.backgroundAudioUrl = data.background_audio_url;
                state.backgroundAudioVideoFilename = state.currentVideoFilename;
                const label = btnSeparateDialogue.querySelector("span");
                if (label) label.textContent = "Use Original Audio";
                scheduleAutosave();
                setStatus("Dialogue separated", "The accompaniment track will be mixed with the new dubbed dialogue on export.");
                showToast("Dialogue separated. The background track is ready for export.");
            } catch (error) {
                showToast(`Dialogue separation failed: ${error.message}`);
                setStatus("Separation failed", error.message, true);
            } finally {
                btnSeparateDialogue.disabled = false;
            }
        });
    }

    // --- Multi-Speaker Voice Controls (Idea 1) ---

    if (btnAutoDetectSpeakers) {
        btnAutoDetectSpeakers.addEventListener("click", async () => {
            if (!state.currentVideoFilename) {
                showToast("សូមផ្ទុកវីដេអូជាមុនសិន!");
                return;
            }
            if (state.segments.length === 0) {
                showToast("មិនទាន់មាន Segment នៅក្នុងតារាងទេ!");
                return;
            }

            disableButton(btnAutoDetectSpeakers);
            setStatus("កំពុងវិភាគសំឡេង", "ប្រព័ន្ធកំពុងវិភាគកម្ពស់រលកសំឡេង (Pitch Analysis) ដើម្បីណែនាំសំឡេងប្រុស និងស្រី...");

            try {
                const response = await fetch("/api/detect-speakers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        video_filename: state.currentVideoFilename,
                        segments: state.segments
                    })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.detail || "ការវិភាគសំឡេងបរាជ័យ");
                }

                const data = await response.json();
                if (data.segments && Array.isArray(data.segments)) {
                    recordUndo();
                    state.segments = data.segments;
                    const knownSpeakerIds = new Set(state.speakerProfiles.map(profile => profile.id));
                    const detectedIds = [...new Set(data.segments.map(segment => segment.speaker_id).filter(Boolean))];
                    detectedIds.forEach(id => {
                        if (knownSpeakerIds.has(id)) return;
                        const firstSegment = data.segments.find(segment => segment.speaker_id === id);
                        state.speakerProfiles.push({
                            id,
                            name: `Speaker ${state.speakerProfiles.length + 1}`,
                            voice_profile: firstSegment?.voice_profile || "km-KH-PisethNeural"
                        });
                        knownSpeakerIds.add(id);
                    });
                    state.speakerProfiles = normalizeSpeakerProfiles(state.speakerProfiles);
                    renderSegmentsTable();
                    renderTimelineTracks();
                    scheduleAutosave();
                }
                enableButton(btnAutoDetectSpeakers);
                const modeMessage = data.mode === "diarization"
                    ? `Speaker identity diarization assigned ${data.speaker_count || 0} speakers.`
                    : "Pitch analysis suggested male/female voice presets; it does not identify recurring people.";
                setStatus("Speaker analysis complete", data.warning || modeMessage);
                showToast(data.warning || modeMessage);
            } catch (error) {
                console.error(error);
                enableButton(btnAutoDetectSpeakers);
                showToast(`កំហុសក្នុងការវិភាគសំឡេង: ${error.message}`);
                setStatus("បរាជ័យ", error.message, true);
            }
        });
    }

    if (btnAlternateVoices) {
        btnAlternateVoices.addEventListener("click", () => {
            if (state.segments.length === 0) {
                showToast("មិនទាន់មាន Segment នៅក្នុងតារាងទេ!");
                return;
            }
            recordUndo();
            state.segments.forEach((seg, idx) => {
                seg.voice_profile = (idx % 2 === 0) ? "km-KH-PisethNeural" : "km-KH-SreymomNeural";
            });
            renderSegmentsTable();
            renderTimelineTracks();
            setStatus("ប្តូរតួអង្គ", "បានកំណត់ឆ្លាស់តួអង្គប្រុស (Piseth) និងស្រី (Sreymom) តាមបន្ទាត់នីមួយៗ!");
        });
    }

    if (btnAllMale) {
        btnAllMale.addEventListener("click", () => {
            if (state.segments.length === 0) {
                showToast("មិនទាន់មាន Segment នៅក្នុងតារាងទេ!");
                return;
            }
            recordUndo();
            state.segments.forEach(seg => {
                seg.voice_profile = "km-KH-PisethNeural";
            });
            renderSegmentsTable();
            renderTimelineTracks();
            setStatus("ប្តូរតួអង្គ", "បានកំណត់គ្រប់ Segment ទាំងអស់ជាសំឡេងតួប្រុស (Piseth)!");
        });
    }

    if (btnAllFemale) {
        btnAllFemale.addEventListener("click", () => {
            if (state.segments.length === 0) {
                showToast("មិនទាន់មាន Segment នៅក្នុងតារាងទេ!");
                return;
            }
            recordUndo();
            state.segments.forEach(seg => {
                seg.voice_profile = "km-KH-SreymomNeural";
            });
            renderSegmentsTable();
            renderTimelineTracks();
            setStatus("ប្តូរតួអង្គ", "បានកំណត់គ្រប់ Segment ទាំងអស់ជាសំឡេងតួស្រី (Sreymom)!");
        });
    }

    function renderSpeakerProfilesDraft() {
        if (!speakerProfilesList) return;
        speakerProfilesList.replaceChildren();
        speakerProfilesDraft.forEach(profile => {
            const row = document.createElement("div");
            row.className = "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-base-800 bg-base-850 p-2";

            const nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.maxLength = 60;
            nameInput.value = profile.name;
            nameInput.placeholder = "ឈ្មោះតួអង្គ";
            nameInput.dataset.speakerProfileName = profile.id;
            nameInput.className = "min-w-0 rounded border border-base-700 bg-base-900 px-2 py-1.5 text-xs text-base-100 outline-none focus:border-base-400";

            const voiceSelect = document.createElement("select");
            voiceSelect.dataset.speakerProfileVoice = profile.id;
            voiceSelect.className = "min-w-0 rounded border border-base-700 bg-base-900 px-2 py-1.5 text-xs text-base-200 outline-none focus:border-base-400";
            Object.entries(CHARACTER_VOICE_NAMES).forEach(([voiceId, voiceName]) => {
                const option = document.createElement("option");
                option.value = voiceId;
                option.textContent = voiceName;
                option.selected = voiceId === profile.voice_profile;
                voiceSelect.appendChild(option);
            });

            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.dataset.removeSpeakerProfile = profile.id;
            removeButton.disabled = speakerProfilesDraft.length <= 1;
            removeButton.title = "Remove speaker";
            removeButton.className = "rounded border border-base-700 px-2 py-1.5 text-xs text-red-300 transition hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40";
            removeButton.textContent = "លុប";

            row.append(nameInput, voiceSelect, removeButton);
            speakerProfilesList.appendChild(row);
        });
    }

    function populateSpeakerSelect(select, selectedId = "") {
        if (!select) return;
        select.replaceChildren();
        const unassigned = document.createElement("option");
        unassigned.value = "";
        unassigned.textContent = "មិនបានកំណត់";
        select.appendChild(unassigned);
        state.speakerProfiles.forEach(profile => {
            const option = document.createElement("option");
            option.value = profile.id;
            option.textContent = profile.name;
            select.appendChild(option);
        });
        select.value = selectedId || "";
    }

    function captureSpeakerProfilesDraft() {
        speakerProfilesDraft = speakerProfilesDraft.map(profile => {
            const nameInput = speakerProfilesList?.querySelector(`[data-speaker-profile-name="${profile.id}"]`);
            const voiceSelect = speakerProfilesList?.querySelector(`[data-speaker-profile-voice="${profile.id}"]`);
            return {
                ...profile,
                name: String(nameInput?.value || profile.name).trim().slice(0, 60) || profile.name,
                voice_profile: voiceSelect?.value || profile.voice_profile
            };
        });
    }

    function closeSpeakerProfilesEditor() {
        speakerProfilesModal?.classList.add("hidden");
        speakerProfilesModal?.classList.remove("flex");
    }

    if (btnManageSpeakers) btnManageSpeakers.addEventListener("click", () => {
        speakerProfilesDraft = state.speakerProfiles.map(profile => ({ ...profile }));
        renderSpeakerProfilesDraft();
        speakerProfilesModal?.classList.remove("hidden");
        speakerProfilesModal?.classList.add("flex");
    });
    [btnCloseSpeakerProfiles, btnCancelSpeakerProfiles].filter(Boolean).forEach(button => button.addEventListener("click", closeSpeakerProfilesEditor));
    if (speakerProfilesModal) speakerProfilesModal.addEventListener("click", event => {
        if (event.target === speakerProfilesModal) closeSpeakerProfilesEditor();
    });
    if (speakerProfilesList) {
        speakerProfilesList.addEventListener("input", event => {
            const id = event.target.dataset.speakerProfileName;
            if (!id) return;
            const profile = speakerProfilesDraft.find(item => item.id === id);
            if (profile) profile.name = String(event.target.value).trim().slice(0, 60) || profile.name;
        });
        speakerProfilesList.addEventListener("change", event => {
            const id = event.target.dataset.speakerProfileVoice;
            if (!id) return;
            const profile = speakerProfilesDraft.find(item => item.id === id);
            if (profile) profile.voice_profile = event.target.value;
        });
        speakerProfilesList.addEventListener("click", event => {
            const button = event.target.closest("[data-remove-speaker-profile]");
            if (!button || speakerProfilesDraft.length <= 1) return;
            captureSpeakerProfilesDraft();
            speakerProfilesDraft = speakerProfilesDraft.filter(profile => profile.id !== button.dataset.removeSpeakerProfile);
            renderSpeakerProfilesDraft();
        });
    }
    if (btnAddSpeaker) btnAddSpeaker.addEventListener("click", () => {
        captureSpeakerProfilesDraft();
        const speakerIdsInUse = [...speakerProfilesDraft.map(profile => profile.id), ...state.segments.map(segment => segment.speaker_id).filter(Boolean)];
        const nextNumber = speakerIdsInUse.reduce((max, id) => {
            const match = String(id).match(/^speaker_(\d+)$/);
            return match ? Math.max(max, Number(match[1])) : max;
        }, 0) + 1;
        speakerProfilesDraft.push({
            id: `speaker_${nextNumber}`,
            name: `Speaker ${nextNumber}`,
            voice_profile: "km-KH-PisethNeural"
        });
        renderSpeakerProfilesDraft();
    });
    if (btnSaveSpeakerProfiles) btnSaveSpeakerProfiles.addEventListener("click", () => {
        captureSpeakerProfilesDraft();
        if (!speakerProfilesDraft.length) {
            showToast("ត្រូវរក្សាទុកតួអង្គយ៉ាងហោចណាស់មួយ។");
            return;
        }
        const nextProfiles = normalizeSpeakerProfiles(speakerProfilesDraft);
        const byId = new Map(nextProfiles.map(profile => [profile.id, profile]));
        const segmentChanges = state.segments.some(segment => {
            const profile = byId.get(segment.speaker_id);
            return (segment.speaker_id && !profile) || (profile && segment.voice_profile !== profile.voice_profile);
        });
        if (segmentChanges) recordUndo();
        state.speakerProfiles = nextProfiles;
        state.segments.forEach(segment => {
            const profile = byId.get(segment.speaker_id);
            if (!profile && segment.speaker_id) segment.speaker_id = null;
            if (profile) setSegmentVoiceProfile(segment, profile.voice_profile);
        });
        closeSpeakerProfilesEditor();
        renderSegmentsTable();
        renderTimelineTracks();
        updateSubtitleOverlay();
        scheduleAutosave();
        showToast("បានរក្សាទុកតួអង្គ និងសំឡេង។");
    });

    // --- Subtitle Export (.SRT / .VTT) ---

    function formatSrtTimestamp(seconds) {
        const numericSeconds = Number(seconds);
        const totalMs = Math.round((Number.isFinite(numericSeconds) ? Math.max(0, numericSeconds) : 0) * 1000);
        const hrs = Math.floor(totalMs / 3600000);
        const mins = Math.floor((totalMs % 3600000) / 60000);
        const secs = Math.floor((totalMs % 60000) / 1000);
        const ms = totalMs % 1000;
        return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
    }

    function downloadSubtitleFile(format) {
        const isVtt = format === "vtt";
        const entries = state.segments
            .map(segment => ({
                start: Math.max(0, Number(segment.start)),
                end: Math.max(0, Number(segment.end)),
                text: (segment.translated_text || segment.original_text || "").trim(),
            }))
            .filter(segment => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start && segment.text)
            .sort((left, right) => left.start - right.start);

        if (entries.length === 0) {
            showToast("មិនទាន់មាន Segment ត្រឹមត្រូវសម្រាប់នាំចេញ Subtitle ទេ!");
            return;
        }

        const cues = entries.map((segment, index) => {
            const start = formatSrtTimestamp(segment.start).replace(",", ".");
            const end = formatSrtTimestamp(segment.end).replace(",", ".");
            const timestamp = `${start} --> ${end}`;
            return isVtt ? `${timestamp}\r\n${segment.text}` : `${index + 1}\r\n${timestamp.replace(/\./g, ",")}\r\n${segment.text}`;
        });
        const content = `${isVtt ? "WEBVTT\r\n\r\n" : ""}${cues.join("\r\n\r\n")}\r\n`;
        const blob = new Blob([content], {
            type: isVtt ? "text/vtt;charset=utf-8" : "application/x-subrip;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const rawBaseName = String(state.currentVideoFilename || "subtitles").replace(/\\/g, "/").split("/").pop() || "subtitles";
        const baseName = rawBaseName.replace(/\.[^/.]+$/, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "subtitles";
        const extension = isVtt ? "vtt" : "srt";
        a.download = `${baseName}_khmer.${extension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);

        const formatLabel = extension.toUpperCase();
        setStatus("នាំចេញ Subtitle", `បានទាញយកឯកសារ Subtitle (.${formatLabel}) ភាសាខ្មែរដោយជោគជ័យ!`);
        showToast(`បានទាញយកឯកសារ Subtitle (.${formatLabel}) ជាភាសាខ្មែរដោយជោគជ័យ!`);
    }

    if (btnExportSrt) btnExportSrt.addEventListener("click", () => downloadSubtitleFile("srt"));
    if (btnExportVtt) btnExportVtt.addEventListener("click", () => downloadSubtitleFile("vtt"));

    // --- Project Save, Load, and Portable Package (.dubproj / .dubpack) ---

    function buildProjectData() {
        return {
            app: "AI_DUBBER",
            version: "1.1",
            saved_at: new Date().toISOString(),
            video_filename: state.currentVideoFilename,
            video_duration: state.currentVideoDuration,
            background_audio_url: state.backgroundAudioUrl,
            background_audio_video_filename: state.backgroundAudioVideoFilename,
            copyright_review: state.copyrightReview,
            speaker_profiles: state.speakerProfiles,
            segments: state.segments
        };
    }

    function applyProjectData(data) {
        if (!data || !Array.isArray(data.segments)) throw new Error("Project file has an invalid structure.");
        resetHistory();
        state.segments = data.segments;
        state.copyrightReview = { ...defaultRightsReview(), ...(data.copyright_review || {}) };
        state.speakerProfiles = normalizeSpeakerProfiles(data.speaker_profiles);
        state.backgroundAudioUrl = data.background_audio_url || null;
        state.backgroundAudioVideoFilename = data.background_audio_video_filename || "";
        if (data.video_filename) {
            state.currentVideoFilename = data.video_filename;
            state.currentVideoFile = null;
            lblCurrentFilename.textContent = data.video_filename;
            videoElement.src = `/uploads/${encodeURIComponent(data.video_filename)}`;
            videoElement.controls = true;
            videoElement.load();
            enableButton(btnTranscribe);
            enableButton(btnRemoveVoice);
        }
        updateDialogueSeparationButton();
        if (data.video_duration) {
            state.currentVideoDuration = Number(data.video_duration) || 0;
            videoDurationBadge.textContent = `00:00 / ${formatTime(state.currentVideoDuration)}`;
        }
        syncRightsReviewControls();
        markProjectClean();
        renderSegmentsTable();
        renderTimelineTracks();
        enableButton(btnTranslate);
        enableButton(btnGenerateVoice);
        if (btnExportSrt) enableButton(btnExportSrt);
        if (btnExportVtt) enableButton(btnExportVtt);
        if (state.segments.some(segment => segment.audio_url)) enableButton(btnExportVideo);
        scheduleAutosave();
    }

    if (btnSaveProject) {
        btnSaveProject.addEventListener("click", () => {
            if (state.segments.length === 0 && !state.currentVideoFilename) {
                showToast("There is no project data to save yet.");
                return;
            }
            const blob = new Blob([JSON.stringify(buildProjectData(), null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            const baseName = state.currentVideoFilename ? state.currentVideoFilename.replace(/\.[^/.]+$/, "") : "dubbing_project";
            anchor.download = `${baseName}.dubproj`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            markProjectClean();
            showToast("Project saved as .dubproj.");
        });
    }

    if (btnExportPackage) {
        btnExportPackage.addEventListener("click", async () => {
            if (!state.currentVideoFilename && !state.segments.length) {
                showToast("There is no project data to package yet.");
                return;
            }
            btnExportPackage.disabled = true;
            try {
                const response = await fetch("/api/export-project-package", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ project: buildProjectData(), include_video: true, include_audio: true })
                });
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || "Could not create the project package.");
                }
                const packageResult = await response.json();
                const anchor = document.createElement("a");
                anchor.href = packageResult.download_url;
                anchor.download = `${state.currentVideoFilename ? state.currentVideoFilename.replace(/\.[^/.]+$/, "") : "dubbing_project"}.dubpack`;
                document.body.appendChild(anchor);
                anchor.click();
                document.body.removeChild(anchor);
                markProjectClean();
                showToast("Portable .dubpack project exported with its media.");
            } catch (error) {
                showToast(`Package export failed: ${error.message}`);
            } finally {
                btnExportPackage.disabled = false;
            }
        });
    }

    if (btnOpenProject) btnOpenProject.addEventListener("click", () => projectFileInput.click());

    if (projectFileInput) {
        projectFileInput.addEventListener("change", async event => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
                let data;
                if (file.name.toLowerCase().endsWith(".dubpack")) {
                    const form = new FormData();
                    form.append("file", file);
                    const response = await fetch("/api/import-project-package", { method: "POST", body: form });
                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.detail || "Could not import the project package.");
                    }
                    data = (await response.json()).project;
                } else {
                    data = JSON.parse(await file.text());
                }
                applyProjectData(data);
                showToast(`Project opened with ${state.segments.length} captions.`);
            } catch (error) {
                console.error(error);
                showToast(`Could not open project: ${error.message}`);
            } finally {
                projectFileInput.value = "";
            }
        });
    }

    // --- YouTube Shorts and Facebook Page Reels publishing ---

    function publisherText(khmer, english) {
        return window.AIDubberI18n?.t(khmer, english) || khmer;
    }

    async function publisherJson(response) {
        let data = {};
        try { data = await response.json(); } catch (_) { /* Keep the HTTP message below. */ }
        if (!response.ok) throw new Error(data.detail || data.message || `Request failed (${response.status}).`);
        return data;
    }

    async function refreshPublisherStatus() {
        const response = await fetch("/api/publisher/status");
        const data = await publisherJson(response);
        const youtube = data.youtube || {};
        const facebook = data.facebook || {};

        if (youtubeConnectionStatus) {
            const pending = youtube.connection?.state === "pending";
            const failed = youtube.connection?.state === "error";
            youtubeConnectionStatus.textContent = youtube.connected
                ? publisherText("បានភ្ជាប់ YouTube", "YouTube connected")
                : pending
                    ? publisherText("កំពុងរង់ចាំ Google login", "Waiting for Google sign-in")
                    : failed
                        ? youtube.connection.message
                        : youtube.client_configured
                            ? publisherText("បានរក្សាទុក OAuth JSON", "OAuth JSON saved")
                            : publisherText("មិនទាន់ភ្ជាប់", "Not connected");
            youtubeConnectionStatus.className = `text-[10px] ${youtube.connected ? "text-emerald-300" : failed ? "text-red-300" : "text-amber-300"}`;
        }
        if (btnDisconnectYoutube) btnDisconnectYoutube.classList.toggle("hidden", !youtube.connected);

        const pages = Array.isArray(facebook.pages) ? facebook.pages : [];
        if (facebookConnectionStatus) {
            const selectedPage = pages.find(page => page.selected);
            facebookConnectionStatus.textContent = selectedPage
                ? `${publisherText("បានភ្ជាប់", "Connected")}: ${selectedPage.name}`
                : facebook.configured
                    ? publisherText("រក្សាទុក App រួច តែមិនទាន់ភ្ជាប់ Page", "App saved; connect a Page")
                    : publisherText("មិនទាន់ភ្ជាប់", "Not connected");
            facebookConnectionStatus.className = `text-[10px] ${selectedPage ? "text-emerald-300" : "text-amber-300"}`;
        }
        if (btnDisconnectFacebook) btnDisconnectFacebook.classList.toggle("hidden", pages.length === 0);
        if (metaAppIdInput && facebook.app_id && !metaAppIdInput.value) metaAppIdInput.value = facebook.app_id;
        if (metaCallbackUri) metaCallbackUri.textContent = facebook.callback_uri || "http://127.0.0.1:8000/api/publisher/meta/callback";
        if (facebookPageSelect) {
            facebookPageSelect.replaceChildren();
            pages.forEach(page => {
                const option = document.createElement("option");
                option.value = page.id;
                option.textContent = page.name;
                option.selected = Boolean(page.selected);
                facebookPageSelect.appendChild(option);
            });
            facebookPageSelect.classList.toggle("hidden", pages.length === 0);
        }
        return data;
    }

    async function refreshPublisherVideos() {
        if (!publisherVideoSelect) return;
        const previous = publisherVideoSelect.value;
        publisherVideoSelect.replaceChildren();
        const loading = document.createElement("option");
        loading.value = "";
        loading.textContent = publisherText("កំពុងរកវីដេអូ...", "Loading exported videos...");
        publisherVideoSelect.appendChild(loading);
        try {
            const data = await publisherJson(await fetch("/api/publisher/videos"));
            publisherVideoSelect.replaceChildren();
            const videos = data.videos || [];
            if (!videos.length) {
                const empty = document.createElement("option");
                empty.value = "";
                empty.textContent = publisherText("មិនទាន់មានវីដេអូនាំចេញទេ — សូមនាំចេញវីដេអូជាមុន", "No exported videos yet — export a video first");
                publisherVideoSelect.appendChild(empty);
                return;
            }
            videos.forEach(video => {
                const option = document.createElement("option");
                option.value = video.filename;
                const mb = (Number(video.size || 0) / (1024 * 1024)).toFixed(1);
                option.textContent = `${video.filename} (${mb} MB)`;
                publisherVideoSelect.appendChild(option);
            });
            if (videos.some(video => video.filename === previous)) publisherVideoSelect.value = previous;
            if (!publisherTitleInput?.value.trim()) setPublisherDefaultTitle();
        } catch (error) {
            publisherVideoSelect.replaceChildren();
            const failed = document.createElement("option");
            failed.value = "";
            failed.textContent = error.message;
            publisherVideoSelect.appendChild(failed);
        }
    }

    function setPublisherDefaultTitle() {
        if (!publisherVideoSelect?.value || !publisherTitleInput) return;
        const filename = publisherVideoSelect.value.replace(/\\/g, "/").split("/").pop() || "";
        const title = filename.replace(/\.[^.]+$/, "").replace(/^dubbed_[a-f0-9]+_/i, "").replace(/[_-]+/g, " ").trim();
        publisherTitleInput.value = title.slice(0, 100);
    }

    async function pollPublisherStatus(platform, popup = null) {
        for (let attempt = 0; attempt < 90; attempt += 1) {
            await new Promise(resolve => setTimeout(resolve, 1800));
            try {
                const data = await refreshPublisherStatus();
                if (platform === "youtube" && data.youtube?.connected) return;
                if (platform === "youtube" && data.youtube?.connection?.state === "error") {
                    showToast(data.youtube.connection.message || "YouTube authorization failed.", "error");
                    return;
                }
                if (platform === "facebook" && data.facebook?.pages?.length) return;
                if (popup?.closed && platform === "facebook" && !data.facebook?.pages?.length) return;
            } catch (error) {
                console.warn("Could not refresh publisher connection status.", error);
            }
        }
    }

    function updatePublisherScheduleControls() {
        if (btnSubmitPublisher) {
            const label = btnSubmitPublisher.querySelector("span");
            if (label) label.textContent = publisherScheduleInput?.value
                ? publisherText("កំណត់ពេលផុស", "Schedule post")
                : publisherText("ផុសឥឡូវ", "Publish now");
        }
        if (youtubePrivacyWrap) youtubePrivacyWrap.classList.toggle("hidden", Boolean(publisherScheduleInput?.value) || !publisherTargetYoutube?.checked);
    }

    if (btnOpenPublisher && publisherModal) {
        btnOpenPublisher.addEventListener("click", () => {
            publisherModal.classList.remove("hidden");
            publisherModal.classList.add("flex");
            if (publisherResult) { publisherResult.classList.add("hidden"); publisherResult.replaceChildren(); }
            if (publisherProgress) publisherProgress.classList.add("hidden");
            if (publisherRightsConfirm) publisherRightsConfirm.checked = false;
            refreshPublisherStatus().catch(error => showToast(error.message, "error"));
            refreshPublisherVideos();
            updatePublisherScheduleControls();
        });
    }
    const closePublisher = () => {
        publisherModal?.classList.add("hidden");
        publisherModal?.classList.remove("flex");
    };
    btnClosePublisher?.addEventListener("click", closePublisher);
    btnClosePublisherFooter?.addEventListener("click", closePublisher);
    btnChooseGoogleClient?.addEventListener("click", () => googleOAuthClientInput?.click());
    btnRefreshPublisherVideos?.addEventListener("click", refreshPublisherVideos);
    publisherVideoSelect?.addEventListener("change", setPublisherDefaultTitle);
    publisherScheduleInput?.addEventListener("input", updatePublisherScheduleControls);
    publisherTargetYoutube?.addEventListener("change", updatePublisherScheduleControls);

    googleOAuthClientInput?.addEventListener("change", async () => {
        const file = googleOAuthClientInput.files?.[0];
        if (!file) return;
        try {
            const form = new FormData();
            form.append("file", file);
            await publisherJson(await fetch("/api/publisher/youtube/credentials", { method: "POST", body: form }));
            showToast(publisherText("បានរក្សាទុក Google OAuth JSON។ ឥឡូវភ្ជាប់គណនី YouTube។", "Google OAuth JSON saved. Connect YouTube next."));
            await refreshPublisherStatus();
        } catch (error) {
            showToast(error.message, "error");
        } finally {
            googleOAuthClientInput.value = "";
        }
    });

    btnConnectYoutube?.addEventListener("click", async () => {
        btnConnectYoutube.disabled = true;
        try {
            const data = await publisherJson(await fetch("/api/publisher/youtube/connect", { method: "POST" }));
            showToast(data.message || publisherText("សូមបញ្ចប់ Google login ក្នុង browser។", "Finish Google sign-in in the browser."));
            pollPublisherStatus("youtube");
        } catch (error) {
            showToast(error.message, "error");
        } finally {
            setTimeout(() => { if (btnConnectYoutube) btnConnectYoutube.disabled = false; }, 2500);
        }
    });

    btnDisconnectYoutube?.addEventListener("click", async () => {
        try { await publisherJson(await fetch("/api/publisher/youtube/disconnect", { method: "POST" })); await refreshPublisherStatus(); }
        catch (error) { showToast(error.message, "error"); }
    });

    btnSaveMetaConfig?.addEventListener("click", async () => {
        const appId = metaAppIdInput?.value.trim() || "";
        const appSecret = metaAppSecretInput?.value.trim() || "";
        if (!appId || !appSecret) { showToast("Enter both the Meta App ID and App Secret.", "error"); return; }
        btnSaveMetaConfig.disabled = true;
        try {
            await publisherJson(await fetch("/api/publisher/facebook/config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ app_id: appId, app_secret: appSecret })
            }));
            if (metaAppSecretInput) metaAppSecretInput.value = "";
            showToast(publisherText("បានរក្សាទុក Meta App។", "Meta app credentials saved on this computer."));
            await refreshPublisherStatus();
        } catch (error) {
            showToast(error.message, "error");
        } finally {
            btnSaveMetaConfig.disabled = false;
        }
    });

    btnConnectFacebook?.addEventListener("click", async () => {
        const popup = window.open("about:blank", "aiDubberFacebookAuth", "width=600,height=720");
        if (!popup) { showToast("Allow pop-ups for this local app, then connect Facebook again.", "error"); return; }
        try {
            const data = await publisherJson(await fetch("/api/publisher/facebook/connect", { method: "POST" }));
            popup.location.href = data.url;
            showToast(publisherText("សូមអនុញ្ញាតសិទ្ធិ Facebook ហើយជ្រើស Page របស់អ្នក។", "Authorize Facebook and choose your Page."));
            pollPublisherStatus("facebook", popup);
        } catch (error) {
            popup.close();
            showToast(error.message, "error");
        }
    });

    facebookPageSelect?.addEventListener("change", async () => {
        try {
            await publisherJson(await fetch("/api/publisher/facebook/page", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ page_id: facebookPageSelect.value })
            }));
            await refreshPublisherStatus();
        } catch (error) { showToast(error.message, "error"); }
    });

    btnDisconnectFacebook?.addEventListener("click", async () => {
        try { await publisherJson(await fetch("/api/publisher/facebook/disconnect", { method: "POST" })); await refreshPublisherStatus(); }
        catch (error) { showToast(error.message, "error"); }
    });

    btnSubmitPublisher?.addEventListener("click", async () => {
        if (!publisherVideoSelect?.value) { showToast("Select a finished video first.", "error"); return; }
        if (!publisherTitleInput?.value.trim()) { showToast("Enter a title for the post.", "error"); publisherTitleInput?.focus(); return; }
        if (!publisherRightsConfirm?.checked) { showToast("Confirm that you have the rights to publish this video.", "error"); return; }
        const platforms = [];
        if (publisherTargetYoutube?.checked) platforms.push("youtube");
        if (publisherTargetFacebook?.checked) platforms.push("facebook");
        if (!platforms.length) { showToast("Choose YouTube, Facebook, or both.", "error"); return; }

        let scheduledAt = null;
        if (publisherScheduleInput?.value) {
            const date = new Date(publisherScheduleInput.value);
            if (Number.isNaN(date.getTime())) { showToast("Choose a valid schedule time.", "error"); return; }
            scheduledAt = date.toISOString();
        }

        const requestBody = {
            video_filename: publisherVideoSelect.value,
            platforms,
            title: publisherTitleInput.value.trim(),
            description: publisherDescriptionInput?.value.trim() || "",
            tags: publisherTagsInput?.value.trim() || "",
            scheduled_at: scheduledAt,
            youtube_privacy: youtubePrivacySelect?.value || "public",
            ai_disclosure: Boolean(publisherAiDisclosure?.checked),
            rights_confirmed: true
        };
        btnSubmitPublisher.disabled = true;
        publisherProgress?.classList.remove("hidden");
        publisherResult?.classList.add("hidden");
        try {
            const data = await publisherJson(await fetch("/api/publisher/publish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody)
            }));
            const rows = Object.entries(data.results || {}).map(([platform, result]) => {
                const label = platform === "youtube" ? "YouTube" : "Facebook Page";
                if (result.ok) {
                    const when = result.status === "scheduled" ? "Scheduled" : "Uploaded";
                    const link = result.url ? ` <a class="underline text-emerald-200" href="${escapeHtml(result.url)}" target="_blank" rel="noopener">Open video</a>` : "";
                    return `<p class="text-emerald-300"><strong>${label}:</strong> ${when}.${link}</p>`;
                }
                return `<p class="text-red-300"><strong>${label}:</strong> ${escapeHtml(result.error || "Publishing failed.")}</p>`;
            });
            if (publisherResult) {
                publisherResult.innerHTML = rows.join("") || "No publishing result was returned.";
                publisherResult.classList.remove("hidden");
            }
            const succeeded = Object.values(data.results || {}).filter(result => result.ok).length;
            if (succeeded) showToast(scheduledAt ? "Your post was scheduled." : "Your video was sent for publishing.");
            if (succeeded < platforms.length) showToast("One or more platforms could not publish. See the result details.", "error");
        } catch (error) {
            if (publisherResult) { publisherResult.textContent = error.message; publisherResult.classList.remove("hidden"); }
            showToast(error.message, "error");
        } finally {
            btnSubmitPublisher.disabled = false;
            publisherProgress?.classList.add("hidden");
            updatePublisherScheduleControls();
        }
    });

    // --- Video URL Download Modal Logic (yt-dlp) ---

    function formatDownloadSize(bytes) {
        if (!Number.isFinite(bytes) || bytes < 0) return "--";
        const units = ["B", "KB", "MB", "GB", "TB"];
        let value = bytes;
        let unit = 0;
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit += 1;
        }
        return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
    }

    function formatDownloadSpeed(bytesPerSecond) {
        if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "Speed: calculating…";
        return `Speed: ${formatDownloadSize(bytesPerSecond)}/s`;
    }

    function formatDownloadEta(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return "Time left: calculating…";
        const rounded = Math.ceil(seconds);
        if (rounded < 60) return `Time left: about ${rounded}s`;
        const minutes = Math.floor(rounded / 60);
        const remainder = rounded % 60;
        if (minutes < 60) return `Time left: about ${minutes}m ${remainder}s`;
        const hours = Math.floor(minutes / 60);
        return `Time left: about ${hours}h ${minutes % 60}m`;
    }

    async function readVideoDownloadEvents(response, onEvent) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error("This browser could not read the download progress stream.");
        const decoder = new TextDecoder();
        let buffer = "";
        let completedData = null;

        const dispatch = (block) => {
            const dataLine = block.split(/\r?\n/).find(line => line.startsWith("data:"));
            if (!dataLine) return;
            const event = JSON.parse(dataLine.slice(5).trim());
            onEvent(event);
            if (event.type === "error") throw new Error(event.message || "Video download failed.");
            if (event.type === "complete") completedData = event.data;
        };

        while (!completedData) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split(/\r?\n\r?\n/);
            buffer = blocks.pop() || "";
            for (const block of blocks) {
                dispatch(block);
                if (completedData) break;
            }
        }

        buffer += decoder.decode();
        if (!completedData && buffer.trim()) dispatch(buffer);
        if (!completedData) throw new Error("The video download ended before completion was reported.");
        return completedData;
    }

    if (btnOpenLinkModal) {
        btnOpenLinkModal.addEventListener("click", () => {
            urlDownloadModal.classList.remove("hidden");
            urlDownloadProgress.classList.add("hidden");
            videoUrlInput.value = "";
            btnConfirmDownloadUrl.disabled = false;
            if (urlDownloadPercent) urlDownloadPercent.textContent = "--";
            if (urlDownloadProgressText) urlDownloadProgressText.textContent = "Preparing video download…";
            if (urlDownloadMetrics) urlDownloadMetrics.textContent = "Speed: -- · Time left: --";
            if (urlDownloadProgressBar) {
                urlDownloadProgressBar.style.width = "0%";
                urlDownloadProgressBar.classList.remove("animate-pulse");
            }
            if (urlDownloadProgressTrack) {
                urlDownloadProgressTrack.setAttribute("aria-valuenow", "0");
                urlDownloadProgressTrack.removeAttribute("aria-valuetext");
            }
        });
    }

    if (btnCloseUrlModal) {
        btnCloseUrlModal.addEventListener("click", () => {
            urlDownloadModal.classList.add("hidden");
        });
    }

    if (btnCancelUrlDownload) {
        btnCancelUrlDownload.addEventListener("click", () => {
            urlDownloadModal.classList.add("hidden");
        });
    }

    if (btnConfirmDownloadUrl) {
        btnConfirmDownloadUrl.addEventListener("click", async () => {
            const url = videoUrlInput.value.trim();
            if (!url) {
                showToast("សូមបញ្ចូល Link វីដេអូត្រឹមត្រូវមួយ!");
                return;
            }

            btnConfirmDownloadUrl.disabled = true;
            urlDownloadProgress.classList.remove("hidden");
            if (urlDownloadPercent) urlDownloadPercent.textContent = "--";
            if (urlDownloadProgressText) urlDownloadProgressText.textContent = "Preparing video download…";
            if (urlDownloadMetrics) urlDownloadMetrics.textContent = "Speed: calculating… · Time left: calculating…";
            if (urlDownloadProgressBar) {
                urlDownloadProgressBar.style.width = "30%";
                urlDownloadProgressBar.classList.add("animate-pulse");
            }
            setStatus("កំពុងទាញយកវីដេអូ", "ប្រព័ន្ធកំពុងទាញយកវីដេអូពី Link... សូមរង់ចាំ។");

            try {
                let sampledBytes = 0;
                let sampledAt = performance.now();
                let measuredSpeed = 0;
                const response = await fetch("/api/download-url-progress", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: url })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.detail || "ការទាញយកវីដេអូបរាជ័យ");
                }

                const data = await readVideoDownloadEvents(response, (event) => {
                    if (event.type === "progress") {
                        const now = performance.now();
                        const downloaded = Number(event.downloaded_bytes) || 0;
                        const total = Number(event.total_bytes) || 0;
                        const elapsedSeconds = (now - sampledAt) / 1000;
                        const byteDelta = downloaded - sampledBytes;
                        if (byteDelta > 0 && elapsedSeconds > 0) {
                            const instantSpeed = byteDelta / elapsedSeconds;
                            measuredSpeed = measuredSpeed > 0 ? measuredSpeed * 0.65 + instantSpeed * 0.35 : instantSpeed;
                        }
                        sampledBytes = downloaded;
                        sampledAt = now;

                        const percent = event.percent !== null && event.percent !== undefined && Number.isFinite(Number(event.percent))
                            ? Math.min(99, Math.max(0, Number(event.percent)))
                            : null;
                        if (percent !== null) {
                            if (urlDownloadPercent) urlDownloadPercent.textContent = `${percent}%`;
                            if (urlDownloadProgressTrack) {
                                urlDownloadProgressTrack.setAttribute("aria-valuenow", String(percent));
                                urlDownloadProgressTrack.setAttribute("aria-valuetext", `${percent}% downloaded`);
                            }
                            if (urlDownloadProgressBar) {
                                urlDownloadProgressBar.classList.remove("animate-pulse");
                                urlDownloadProgressBar.style.width = `${percent}%`;
                            }
                        } else {
                            if (urlDownloadProgressTrack) {
                                urlDownloadProgressTrack.removeAttribute("aria-valuenow");
                                urlDownloadProgressTrack.setAttribute("aria-valuetext", "Download progress is not available yet");
                            }
                            if (urlDownloadProgressBar) {
                                urlDownloadProgressBar.style.width = "30%";
                                urlDownloadProgressBar.classList.add("animate-pulse");
                            }
                        }

                        const reportedSpeed = Number(event.speed);
                        const speed = Number.isFinite(reportedSpeed) && reportedSpeed > 0 ? reportedSpeed : measuredSpeed;
                        const reportedEta = Number(event.eta);
                        const eta = event.eta !== null && event.eta !== undefined && Number.isFinite(reportedEta)
                            ? reportedEta
                            : (total > downloaded && speed > 0 ? (total - downloaded) / speed : null);
                        if (urlDownloadProgressText) {
                            urlDownloadProgressText.textContent = event.status === "finished"
                                ? "Merging downloaded audio and video…"
                                : "Downloading video…";
                        }
                        const sizeSummary = total > 0
                            ? `${formatDownloadSize(downloaded)} / ${formatDownloadSize(total)}`
                            : `${formatDownloadSize(downloaded)} downloaded`;
                        if (urlDownloadMetrics) {
                            urlDownloadMetrics.textContent = `${formatDownloadSpeed(speed)} · ${event.status === "finished" ? "Finishing…" : formatDownloadEta(eta)} · ${sizeSummary}`;
                        }
                    } else if (event.type === "complete") {
                        if (urlDownloadProgressText) urlDownloadProgressText.textContent = "Download complete; loading video…";
                        if (urlDownloadPercent) urlDownloadPercent.textContent = "100%";
                        if (urlDownloadProgressTrack) {
                            urlDownloadProgressTrack.setAttribute("aria-valuenow", "100");
                            urlDownloadProgressTrack.setAttribute("aria-valuetext", "100% downloaded");
                        }
                        if (urlDownloadProgressBar) {
                            urlDownloadProgressBar.classList.remove("animate-pulse");
                            urlDownloadProgressBar.style.width = "100%";
                        }
                    }
                });
                if (state.currentVideoFilename !== data.filename) {
                    state.copyrightReview = defaultRightsReview();
                    state.segments = [];
                    state.speakerProfiles = defaultSpeakerProfiles();
                    resetHistory();
                    renderSegmentsTable();
                    renderTimelineTracks();
                }
                state.currentVideoFilename = data.filename;
                state.backgroundAudioUrl = null;
                state.backgroundAudioVideoFilename = "";
                updateDialogueSeparationButton();
                state.currentVideoDuration = data.duration || 0;
                if (lblAudioStatus) lblAudioStatus.textContent = "សំឡេងដើម";
                const removeVoiceLabel = btnRemoveVoice.querySelector("span");
                if (removeVoiceLabel) removeVoiceLabel.textContent = "លុបសំឡេងដើម";
                syncRightsReviewControls();
                lblCurrentFilename.textContent = data.title || data.filename;

                videoElement.src = data.video_url;
                videoElement.controls = true;
                videoEmptyPlaceholder.classList.add("hidden");
                videoDurationBadge.textContent = `00:00 / ${formatTime(data.duration)}`;

                videoElement.onloadedmetadata = () => {
                    if (videoElement.duration && videoElement.duration > 0) {
                        state.currentVideoDuration = videoElement.duration;
                        videoDurationBadge.textContent = `00:00 / ${formatTime(videoElement.duration)}`;
                    }
                };

                enableButton(btnTranscribe);
                enableButton(btnRemoveVoice);
                urlDownloadModal.classList.add("hidden");

                setStatus("ជោគជ័យ", "បានទាញយកវីដេអូតាម Link រួចរាល់! លោកអ្នកអាចចុច 'បម្លែងអត្ថបទ'។");
                showToast("បានទាញយកវីដេអូតាម Link ដោយជោគជ័យ!");
            } catch (error) {
                console.error(error);
                urlDownloadProgress.classList.add("hidden");
                btnConfirmDownloadUrl.disabled = false;
                showToast(`កំហុសក្នុងការទាញយកវីដេអូ: ${error.message}`);
                setStatus("បរាជ័យ", error.message, true);
            }
        });
    }

    // --- Manual Add Segment ---

    btnAddSegment.addEventListener("click", () => {
        const nextId = state.segments.length > 0 ? Math.max(...state.segments.map(s => s.id)) + 1 : 1;
        const lastEnd = state.segments.length > 0 ? state.segments[state.segments.length - 1].end : 0;
        
        recordUndo();
        state.segments.push({
            id: nextId,
            start: lastEnd,
            end: lastEnd + 3.0,
            original_text: "អត្ថបទថ្មី",
            translated_text: "",
            speaker_id: null,
            voice_profile: "km-KH-PisethNeural",
            emotion: "ធម្មតា",
            status: "រង់ចាំ",
            audio_url: null
        });

        renderSegmentsTable();
        renderTimelineTracks();
    });

    // --- Table Rendering & In-place Editing ---

    if (btnSegmentsPrev) btnSegmentsPrev.addEventListener("click", () => {
        state.segmentTablePage = Math.max(0, state.segmentTablePage - 1);
        renderSegmentsTable();
    });
    if (btnSegmentsNext) btnSegmentsNext.addEventListener("click", () => {
        state.segmentTablePage += 1;
        renderSegmentsTable();
    });
    if (segmentReviewFilter) segmentReviewFilter.addEventListener("change", () => {
        state.segmentTablePage = 0;
        renderSegmentsTable();
    });

    function segmentMatchesReviewFilter(segment, filter) {
        const missingTranslation = !String(segment.translated_text || "").trim();
        const missingAudio = Boolean(String(segment.translated_text || "").trim()) && !segment.audio_url;
        const hasTimingIssue = timingIssueById.has(segment.id) || audioFitIssueById.has(segment.id);
        const failedVoice = String(segment.status || "").startsWith("បរាជ័យ:");
        if (filter === "missing_translation") return missingTranslation;
        if (filter === "missing_audio") return missingAudio || failedVoice;
        if (filter === "timing_issue") return hasTimingIssue;
        if (filter === "needs_review") return missingTranslation || missingAudio || failedVoice || hasTimingIssue;
        return true;
    }

    function renderSegmentsTable() {
        updateRetryFailedVoiceButton();
        updateAudioFitButton();
        timingIssueById = computeTimingIssues();
        updateTimingIssueSummary();
        scheduleAutosave();
        if (state.segments.length === 0) {
            state.segmentTablePage = 0;
            segmentsTableBody.innerHTML = "";
            segmentsTableBody.appendChild(tableEmptyRow);
            segmentsCountBadge.textContent = "0 Segment";
            segmentsPagination?.classList.add("hidden");
            return;
        }

        const filter = segmentReviewFilter?.value || "all";
        const filteredSegments = state.segments.filter(segment => segmentMatchesReviewFilter(segment, filter));
        if (filteredSegments.length === 0) {
            state.segmentTablePage = 0;
            segmentsTableBody.innerHTML = "";
            const emptyRow = tableEmptyRow.cloneNode(true);
            emptyRow.removeAttribute("id");
            const emptyText = emptyRow.querySelectorAll("p");
            if (emptyText[0]) emptyText[0].textContent = "គ្មាន Segment ដែលត្រូវនឹងតម្រងនេះទេ";
            if (emptyText[1]) emptyText[1].textContent = "សូមជ្រើសរើសតម្រងផ្សេង ឬបន្តកែសម្រួល Segment។";
            segmentsTableBody.appendChild(emptyRow);
            segmentsCountBadge.textContent = `0 / ${state.segments.length}`;
            segmentsPagination?.classList.add("hidden");
            return;
        }

        const pageCount = Math.max(1, Math.ceil(filteredSegments.length / SEGMENT_PAGE_SIZE));
        state.segmentTablePage = Math.min(Math.max(0, state.segmentTablePage), pageCount - 1);
        const pageStart = state.segmentTablePage * SEGMENT_PAGE_SIZE;
        const pageSegments = filteredSegments.slice(pageStart, pageStart + SEGMENT_PAGE_SIZE);
        segmentsCountBadge.textContent = filter === "all" ? `${state.segments.length} Segment` : `${filteredSegments.length} / ${state.segments.length}`;
        if (segmentsPagination) segmentsPagination.classList.toggle("hidden", pageCount <= 1);
        if (segmentsPagination) segmentsPagination.classList.toggle("flex", pageCount > 1);
        if (segmentsPageLabel) segmentsPageLabel.textContent = `ទំព័រ ${state.segmentTablePage + 1} / ${pageCount} · ${pageStart + 1}-${Math.min(pageStart + SEGMENT_PAGE_SIZE, filteredSegments.length)} / ${filteredSegments.length}`;
        if (btnSegmentsPrev) btnSegmentsPrev.disabled = state.segmentTablePage === 0;
        if (btnSegmentsNext) btnSegmentsNext.disabled = state.segmentTablePage >= pageCount - 1;
        segmentsTableBody.innerHTML = "";

        pageSegments.forEach((seg) => {
            const isSelected = (state.selectedSegmentIds || [state.selectedSegmentId]).includes(seg.id);
            const tr = document.createElement("tr");
            tr.setAttribute("data-row-id", seg.id);
            const rowIssues = [...(timingIssueById.get(seg.id) || []), ...(audioFitIssueById.get(seg.id) || [])];
            const hasOverlap = rowIssues.some(issue => issue.type === "overlap" || issue.type === "invalid");
            const issueClass = rowIssues.length ? (hasOverlap ? "border-l-2 border-l-red-500" : "border-l-2 border-l-amber-400") : "";
            tr.title = rowIssues.map(issue => issue.text).join("; ");
            tr.className = `hover:bg-base-850/60 transition border-b border-base-800 group cursor-pointer ${isSelected ? "bg-base-800/80" : ""} ${issueClass}`;
            tr.innerHTML = `
                <td class="py-2.5 px-3 text-center text-base-400 font-mono">${seg.id}</td>
                <td class="py-2.5 px-3">
                    <input type="text" inputmode="decimal" value="${formatSegmentTime(seg.start)}" title="ទម្រង់ នាទី:វិនាទី (ឧ. 02:18.42)" class="w-24 px-2 py-1 rounded bg-base-850 border border-base-750 text-base-100 text-xs font-mono focus:outline-none focus:border-base-500" data-field="start" data-id="${seg.id}">
                </td>
                <td class="py-2.5 px-3">
                    <input type="text" inputmode="decimal" value="${formatSegmentTime(seg.end)}" title="ទម្រង់ នាទី:វិនាទី (ឧ. 02:18.42)" class="w-24 px-2 py-1 rounded bg-base-850 border border-base-750 text-base-100 text-xs font-mono focus:outline-none focus:border-base-500" data-field="end" data-id="${seg.id}">
                </td>
                <td class="py-2.5 px-3 text-base-300">
                    <textarea rows="2" class="w-full px-2 py-1 rounded bg-base-850 border border-base-750 text-base-200 text-xs focus:outline-none focus:border-base-500 resize-none" data-field="original_text" data-id="${seg.id}">${seg.original_text || ""}</textarea>
                </td>
                <td class="py-2.5 px-3">
                    <textarea rows="2" placeholder="បញ្ចូលអត្ថបទបកប្រែ..." class="w-full px-2 py-1 rounded bg-base-900 border border-base-750 text-base-100 text-xs focus:outline-none focus:border-base-400 resize-none" data-field="translated_text" data-id="${seg.id}">${seg.translated_text || ""}</textarea>
                </td>
                <td class="py-2.5 px-3">
                    <select class="w-full min-w-24 px-2 py-1.5 rounded bg-base-850 border border-base-750 text-xs text-base-200 focus:outline-none focus:border-base-500" data-field="speaker_id" data-id="${seg.id}" aria-label="Assign speaker for segment ${seg.id}">
                        <option value="" ${!seg.speaker_id ? "selected" : ""}>មិនបានកំណត់</option>
                        ${state.speakerProfiles.map(profile => `<option value="${escapeHtml(profile.id)}" ${seg.speaker_id === profile.id ? "selected" : ""}>${escapeHtml(profile.name)}</option>`).join("")}
                    </select>
                </td>
                <td class="py-2.5 px-3">
                    <div class="flex items-center gap-1.5">
                        <span id="voiceIcon-${seg.id}" class="text-sm shrink-0 select-none" title="${getVoiceShortName(seg.voice_profile)}">
                            ${getVoiceIcon(seg.voice_profile)}
                        </span>
                        <select class="w-full px-2 py-1.5 rounded bg-base-850 border border-base-750 text-xs text-base-200 focus:outline-none focus:border-base-500" data-field="voice_profile" data-id="${seg.id}">
                            <option value="km-KH-PisethNeural" ${seg.voice_profile === "km-KH-PisethNeural" ? "selected" : ""}>👨 Piseth (ប្រុស)</option>
                            <option value="km-KH-SreymomNeural" ${seg.voice_profile === "km-KH-SreymomNeural" ? "selected" : ""}>👩 Sreymom (ស្រី)</option>
                            <option value="km-character-old-man" ${seg.voice_profile === "km-character-old-man" ? "selected" : ""}>👴 លោកតា (ចាស់)</option>
                            <option value="km-character-old-woman" ${seg.voice_profile === "km-character-old-woman" ? "selected" : ""}>👵 លោកយាយ (ចាស់)</option>
                            <option value="km-character-young-boy" ${seg.voice_profile === "km-character-young-boy" ? "selected" : ""}>👦 ក្មេងប្រុស</option>
                            <option value="km-character-young-girl" ${seg.voice_profile === "km-character-young-girl" ? "selected" : ""}>👧 ក្មេងស្រី</option>
                            <option value="km-character-villain" ${seg.voice_profile === "km-character-villain" ? "selected" : ""}>🧙‍♂️ តួអាក្រក់</option>
                            <option value="km-character-narrator" ${seg.voice_profile === "km-character-narrator" ? "selected" : ""}>📢 អ្នកនិទាន</option>
                        </select>
                    </div>
                </td>
                <td class="py-2.5 px-3 text-center">
                    <span class="inline-block px-2 py-0.5 rounded text-[10px] font-medium ${getStatusBadgeClass(seg.status)}">
                        ${seg.status || "រង់ចាំ"}
                    </span>
                    ${rowIssues.length ? `<div class="text-[9px] mt-1 ${hasOverlap ? "text-red-300" : "text-amber-300"}">⚠ ${rowIssues[0].text}</div>` : ""}
                </td>
                <td class="py-2.5 px-3 text-center">
                    ${seg.audio_url ? `
                        <button class="p-1 rounded bg-base-800 hover:bg-base-750 text-base-200 border border-base-750 transition btnPlayAudio" data-url="${seg.audio_url}">
                            <i data-lucide="play" class="w-3.5 h-3.5"></i>
                        </button>
                    ` : `<span class="text-base-600">-</span>`}
                </td>
            `;

            tr.addEventListener("click", () => {
                selectSegment(seg.id, true);
            });

            segmentsTableBody.appendChild(tr);
        });

        // Attach change listeners to inputs
        segmentsTableBody.querySelectorAll("input, textarea, select").forEach(input => {
            input.addEventListener("focus", (e) => {
                const id = parseInt(e.target.getAttribute("data-id"));
                if (id) selectSegment(id, false);
            });

            input.addEventListener("change", (e) => {
                const id = parseInt(e.target.getAttribute("data-id"));
                const field = e.target.getAttribute("data-field");
                const targetSeg = state.segments.find(s => s.id === id);
                if (targetSeg) {
                    audioFitIssueById.delete(id);
                    if (field === "speaker_id") {
                        const speakerId = e.target.value || null;
                        if (speakerId !== (targetSeg.speaker_id || null)) {
                            recordUndo();
                            targetSeg.speaker_id = speakerId;
                            const profile = state.speakerProfiles.find(item => item.id === speakerId);
                            if (profile) setSegmentVoiceProfile(targetSeg, profile.voice_profile);
                            renderSegmentsTable();
                            renderTimelineTracks();
                            selectSegment(id, false);
                            updateSubtitleOverlay();
                            scheduleAutosave();
                        }
                        return;
                    }
                    if (field === "voice_profile") {
                        const voiceProfile = e.target.value;
                        const profile = state.speakerProfiles.find(item => item.id === targetSeg.speaker_id);
                        const linkedSegments = profile
                            ? state.segments.filter(segment => segment.speaker_id === profile.id)
                            : [targetSeg];
                        const changed = (profile && profile.voice_profile !== voiceProfile) || linkedSegments.some(segment => segment.voice_profile !== voiceProfile);
                        if (changed) recordUndo();
                        if (profile) profile.voice_profile = voiceProfile;
                        linkedSegments.forEach(segment => setSegmentVoiceProfile(segment, voiceProfile));
                        renderSegmentsTable();
                        renderTimelineTracks();
                        selectSegment(id, false);
                        updateSubtitleOverlay();
                        scheduleAutosave();
                        return;
                    }
                    if (field === "start" || field === "end") {
                        const secondsValue = parseSegmentTime(e.target.value);
                        if (!Number.isFinite(secondsValue)) {
                            e.target.value = formatSegmentTime(targetSeg[field]);
                            return;
                        }
                        if (secondsValue !== targetSeg[field]) recordUndo();
                        targetSeg[field] = secondsValue;
                        e.target.value = formatSegmentTime(secondsValue);
                        if (videoElement.duration) videoElement.currentTime = targetSeg[field];
                    } else {
                        if (e.target.value !== (targetSeg[field] ?? "")) {
                            recordUndo();
                            if (field === "translated_text") {
                                targetSeg.audio_url = null;
                                targetSeg.status = "បានកែប្រែ - ត្រូវបង្កើតសំឡេងឡើងវិញ";
                            }
                        }
                        targetSeg[field] = e.target.value;
                    }
                    if (field === "voice_profile") {
                        const iconEl = document.getElementById(`voiceIcon-${id}`);
                        if (iconEl) {
                            iconEl.textContent = getVoiceIcon(e.target.value);
                            iconEl.title = getVoiceShortName(e.target.value);
                        }
                    }
                    renderTimelineTracks();
                    selectSegment(id, false);
                    scheduleAutosave();
                }
            });
        });

        // Audio preview buttons
        segmentsTableBody.querySelectorAll(".btnPlayAudio").forEach(btn => {
            btn.addEventListener("click", () => {
                const url = btn.getAttribute("data-url");
                if (url) {
                    previewAudioElement.src = url;
                    previewAudioElement.play();
                }
            });
        });

        // Reinitialize icons in new table content
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    function getStatusBadgeClass(status) {
        if (!status) return "bg-base-850 text-base-400 border border-base-800";
        return "bg-base-850 text-base-300 border border-base-750";
    }

    // --- Timeline Rendering, Interactive Dragging & Adjustments ---

    let activeDrag = null;

    function selectSegment(segId, seek = true) {
        state.selectedSegmentId = segId;
        state.selectedSegmentIds = segId == null ? [] : [segId];
        state.selectionAnchorSegmentId = segId;
        const seg = state.segments.find(s => s.id === segId);
        if (!seg) {
            if (lblSelectedSegment) lblSelectedSegment.textContent = "គ្មានជម្រើស";
            return;
        }

        updateSelectionLabel();

        // Highlight matching table row
        highlightTableRow(segId);

        // Highlight timeline blocks for this segment
        document.querySelectorAll("[data-seg-id]").forEach(el => {
            const id = parseInt(el.getAttribute("data-seg-id"));
            if (state.selectedSegmentIds.includes(id)) {
                el.classList.add("ring-2", "ring-amber-400", "ring-offset-1", "ring-offset-base-950", "z-20");
            } else {
                el.classList.remove("ring-2", "ring-amber-400", "ring-offset-1", "ring-offset-base-950", "z-20");
            }
        });

        // Seek video to start if requested
        if (seek && videoElement.duration) {
            videoElement.currentTime = seg.start;
        }
    }

    function updateSelectionLabel() {
        if (!lblSelectedSegment) return;
        const ids = state.selectedSegmentIds || [];
        if (ids.length > 1) {
            lblSelectedSegment.textContent = `${ids.length} segments selected`;
            lblSelectedSegment.title = "Shift-click timeline blocks to select a range; drag any selected block to move them together.";
            return;
        }
        const seg = state.segments.find(s => s.id === state.selectedSegmentId);
        lblSelectedSegment.textContent = seg
            ? `#${seg.id} [${formatTimeDetailed(seg.start)} - ${formatTimeDetailed(seg.end)}]`
            : "គ្មានជម្រើស";
        lblSelectedSegment.title = seg ? `Segment #${seg.id}: ${seg.translated_text || seg.original_text || ""}` : "";
    }

    function selectSegmentRange(segId) {
        const anchorId = state.selectionAnchorSegmentId ?? state.selectedSegmentId ?? segId;
        const anchorIndex = state.segments.findIndex(s => s.id === anchorId);
        const targetIndex = state.segments.findIndex(s => s.id === segId);
        if (anchorIndex < 0 || targetIndex < 0) {
            state.selectedSegmentIds = [segId];
        } else {
            const from = Math.min(anchorIndex, targetIndex);
            const to = Math.max(anchorIndex, targetIndex);
            state.selectedSegmentIds = state.segments.slice(from, to + 1).map(s => s.id);
        }
        state.selectedSegmentId = segId;
        updateSelectionLabel();
        highlightTableRow(segId);
        renderTimelineTracks();
    }

    function highlightTableRow(segId) {
        segmentsTableBody.querySelectorAll("tr[data-row-id]").forEach(r => {
            const id = parseInt(r.getAttribute("data-row-id"));
            if (id === segId) {
                r.classList.add("bg-base-800/80");
            } else {
                r.classList.remove("bg-base-800/80");
            }
        });
        const input = segmentsTableBody.querySelector(`[data-id="${segId}"]`);
        const row = input ? input.closest("tr") : null;
        if (row) {
            row.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }

    let editingSegmentId = null;

    function updateSegmentModalDuration() {
        if (!segModalDuration || !segModalStart || !segModalEnd) return;
        const start = Number(segModalStart.value);
        const end = Number(segModalEnd.value);
        segModalDuration.textContent = `រយៈពេល: ${Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start).toFixed(2) : "0.00"}s`;
    }

    function closeSegmentEditor() {
        segmentEditModal?.classList.add("hidden");
        editingSegmentId = null;
    }

    function openSegmentEditor(segId = state.selectedSegmentId) {
        const seg = state.segments.find(item => item.id === segId);
        if (!seg || !segmentEditModal) {
            showToast("សូមជ្រើសរើស Segment មួយជាមុនសិន។");
            return;
        }
        editingSegmentId = seg.id;
        if (segmentModalTitle) segmentModalTitle.textContent = `កែសម្រួលបន្ទាត់ Segment #${seg.id}`;
        segModalStart.value = Number(seg.start).toFixed(2);
        segModalEnd.value = Number(seg.end).toFixed(2);
        segModalOriginal.value = seg.original_text || "";
        segModalTranslated.value = seg.translated_text || "";
        populateSpeakerSelect(segModalSpeaker, seg.speaker_id || "");
        if (segModalVoice) segModalVoice.value = seg.voice_profile || "km-KH-PisethNeural";
        updateSegmentModalDuration();
        segmentEditModal.classList.remove("hidden");
        segModalOriginal.focus();
    }

    if (segModalSpeaker) segModalSpeaker.addEventListener("change", () => {
        const profile = state.speakerProfiles.find(item => item.id === segModalSpeaker.value);
        if (profile && segModalVoice) segModalVoice.value = profile.voice_profile;
    });

    function removeSegments(ids) {
        const idSet = new Set(ids);
        const before = state.segments.length;
        state.segments = state.segments.filter(seg => !idSet.has(seg.id));
        if (state.segments.length === before) return false;
        state.selectedSegmentIds = [];
        state.selectedSegmentId = null;
        state.selectionAnchorSegmentId = null;
        renderSegmentsTable();
        renderTimelineTracks();
        updateSubtitleOverlay();
        updateSelectionLabel();
        scheduleAutosave();
        return true;
    }

    function findDuplicateSegmentGroups() {
        const normalize = value => String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
        const buckets = new Map();
        state.segments.forEach((seg, index) => {
            const keys = new Set();
            const original = normalize(seg.original_text);
            const translated = normalize(seg.translated_text);
            if (original.length >= 2) keys.add(`o:${original}`);
            if (translated.length >= 2) keys.add(`t:${translated}`);
            keys.forEach(key => {
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key).push({ seg, index });
            });
        });
        const parent = state.segments.map((_, index) => index);
        const root = index => parent[index] === index ? index : (parent[index] = root(parent[index]));
        const union = (a, b) => { const ra = root(a), rb = root(b); if (ra !== rb) parent[rb] = ra; };

        buckets.forEach(entries => {
            if (entries.length < 2) return;
            entries.sort((a, b) => Number(a.seg.start) - Number(b.seg.start));
            for (let i = 0; i < entries.length; i++) {
                const a = entries[i];
                const aStart = Number(a.seg.start), aEnd = Number(a.seg.end);
                for (let j = i + 1; j < entries.length; j++) {
                    const b = entries[j];
                    const bStart = Number(b.seg.start), bEnd = Number(b.seg.end);
                    if (bStart >= aEnd) break;
                    const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
                    const shorter = Math.max(0.01, Math.min(aEnd - aStart, bEnd - bStart));
                    if (overlap / shorter >= 0.8) union(a.index, b.index);
                }
            }
        });

        const components = new Map();
        state.segments.forEach((seg, index) => {
            const group = root(index);
            if (!components.has(group)) components.set(group, []);
            components.get(group).push(seg);
        });
        return [...components.values()].filter(group => group.length > 1);
    }

    function splitSegmentAt(seg, splitTime) {
        const start = Number(seg.start), end = Number(seg.end), at = Number(splitTime);
        if (!Number.isFinite(at) || at <= start + 0.1 || at >= end - 0.1) {
            showToast("ទីតាំងកាត់ត្រូវស្ថិតនៅកណ្ដាល Segment មិនជិតគែមពេកទេ។");
            return false;
        }
        const ratio = (at - start) / (end - start);
        const splitText = text => {
            const value = String(text || "");
            if (!value.trim()) return [value, value];
            const boundary = Math.max(1, Math.min(value.length - 1, Math.round(value.length * ratio)));
            const candidates = [value.lastIndexOf(" ", boundary), value.indexOf(" ", boundary)];
            const valid = candidates.filter(index => index > 0 && index < value.length - 1);
            const point = valid.length ? valid.sort((a, b) => Math.abs(a - boundary) - Math.abs(b - boundary))[0] : boundary;
            return [value.slice(0, point).trim(), value.slice(point).trim()];
        };
        const [originalLeft, originalRight] = splitText(seg.original_text);
        const [translatedLeft, translatedRight] = splitText(seg.translated_text);
        const nextId = state.segments.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
        recordUndo();
        const oldEnd = end;
        seg.end = Math.round(at * 100) / 100;
        seg.original_text = originalLeft;
        seg.translated_text = translatedLeft;
        seg.audio_url = null;
        seg.status = "រង់ចាំ";
        const next = {
            ...seg,
            id: nextId,
            start: Math.round(at * 100) / 100,
            end: oldEnd,
            original_text: originalRight,
            translated_text: translatedRight,
            audio_url: null,
            status: "រង់ចាំ"
        };
        state.segments.splice(state.segments.indexOf(seg) + 1, 0, next);
        state.selectedSegmentId = next.id;
        state.selectedSegmentIds = [next.id];
        state.selectionAnchorSegmentId = next.id;
        renderSegmentsTable();
        renderTimelineTracks();
        selectSegment(next.id, false);
        updateSubtitleOverlay();
        scheduleAutosave();
        showToast("បានពុះ Segment ជាពីររួចរាល់។");
        return true;
    }

    if (btnEditSelected) btnEditSelected.addEventListener("click", () => openSegmentEditor());
    if (btnDeleteSelected) btnDeleteSelected.addEventListener("click", async () => {
        const ids = (state.selectedSegmentIds || []).length ? state.selectedSegmentIds : [state.selectedSegmentId].filter(id => id != null);
        if (!ids.length) return showToast("សូមជ្រើសរើស Segment មួយជាមុនសិន។");
        const confirmed = await showAppConfirm(`លុប ${ids.length} Segment ដែលបានជ្រើសរើសមែនទេ?`, { title: "លុប Segment", confirmText: "លុប" });
        if (confirmed) { recordUndo(); removeSegments(ids); }
    });
    if (btnSplitAtPlayhead) btnSplitAtPlayhead.addEventListener("click", () => {
        const seg = state.segments.find(item => item.id === state.selectedSegmentId);
        if (!seg) return showToast("សូមជ្រើសរើស Segment ដែលចង់ពុះជាមុនសិន។");
        splitSegmentAt(seg, videoElement.currentTime);
    });
    [btnCloseSegmentModal, btnCancelSegmentModal].filter(Boolean).forEach(button => button.addEventListener("click", closeSegmentEditor));
    if (segmentEditModal) segmentEditModal.addEventListener("click", event => { if (event.target === segmentEditModal) closeSegmentEditor(); });
    [segModalStart, segModalEnd].filter(Boolean).forEach(input => input.addEventListener("input", updateSegmentModalDuration));
    if (btnModalSetStartToVideo) btnModalSetStartToVideo.addEventListener("click", () => { segModalStart.value = videoElement.currentTime.toFixed(2); updateSegmentModalDuration(); });
    if (btnModalSetEndToVideo) btnModalSetEndToVideo.addEventListener("click", () => { segModalEnd.value = videoElement.currentTime.toFixed(2); updateSegmentModalDuration(); });
    if (btnModalPlaySegment) btnModalPlaySegment.addEventListener("click", async () => {
        const start = Number(segModalStart.value), end = Number(segModalEnd.value);
        if (!videoElement.src || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return showToast("ម៉ោងចាប់ផ្តើម ឬបញ្ចប់មិនត្រឹមត្រូវទេ។");
        videoElement.currentTime = start;
        try { await videoElement.play(); } catch (error) { showToast("មិនអាចចាក់វីដេអូបានទេ។"); return; }
        const stopAtEnd = () => { if (videoElement.currentTime >= end) { videoElement.pause(); videoElement.removeEventListener("timeupdate", stopAtEnd); } };
        videoElement.addEventListener("timeupdate", stopAtEnd);
    });
    if (btnSaveSegmentModal) btnSaveSegmentModal.addEventListener("click", () => {
        const seg = state.segments.find(item => item.id === editingSegmentId);
        if (!seg) return closeSegmentEditor();
        const start = Number(segModalStart.value), end = Number(segModalEnd.value);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return showToast("សូមបញ្ចូលម៉ោងចាប់ផ្តើម និងបញ្ចប់ឱ្យត្រឹមត្រូវ។");
        const speakerId = segModalSpeaker?.value || null;
        const voiceProfile = segModalVoice.value;
        const speakerProfile = state.speakerProfiles.find(profile => profile.id === speakerId);
        const linkedVoiceChanged = speakerProfile && state.segments.some(item => item.speaker_id === speakerId && item.voice_profile !== voiceProfile);
        const changed = seg.start !== start || seg.end !== end || seg.original_text !== segModalOriginal.value || seg.translated_text !== segModalTranslated.value || seg.voice_profile !== voiceProfile || (seg.speaker_id || null) !== speakerId || Boolean(speakerProfile && speakerProfile.voice_profile !== voiceProfile) || Boolean(linkedVoiceChanged);
        if (changed) recordUndo();
        seg.start = Math.round(start * 100) / 100;
        seg.end = Math.round(end * 100) / 100;
        seg.original_text = segModalOriginal.value;
        seg.translated_text = segModalTranslated.value;
        seg.speaker_id = speakerId;
        if (speakerProfile) {
            speakerProfile.voice_profile = voiceProfile;
            state.segments.filter(item => item.speaker_id === speakerId).forEach(item => setSegmentVoiceProfile(item, voiceProfile));
        } else {
            setSegmentVoiceProfile(seg, voiceProfile);
        }
        renderSegmentsTable();
        renderTimelineTracks();
        selectSegment(seg.id, false);
        updateSubtitleOverlay();
        scheduleAutosave();
        closeSegmentEditor();
    });
    if (btnModalSplit) btnModalSplit.addEventListener("click", () => {
        const seg = state.segments.find(item => item.id === editingSegmentId);
        if (seg && splitSegmentAt(seg, videoElement.currentTime)) closeSegmentEditor();
    });
    if (btnModalDelete) btnModalDelete.addEventListener("click", async () => {
        const segId = editingSegmentId;
        if (segId == null) return closeSegmentEditor();
        const confirmed = await showAppConfirm("លុប Segment នេះមែនទេ?", { title: "លុប Segment", confirmText: "លុប" });
        if (confirmed) { recordUndo(); removeSegments([segId]); closeSegmentEditor(); }
    });
    if (btnFixDuplicateSegments) btnFixDuplicateSegments.addEventListener("click", async () => {
        const groups = findDuplicateSegmentGroups();
        if (!groups.length) {
            if (duplicateSegmentStatus) duplicateSegmentStatus.textContent = "រកមិនឃើញ Segment ស្ទួនទេ";
            showToast("រកមិនឃើញ Segment ស្ទួនដែលមានពេលត្រួតគ្នាទេ។");
            return;
        }
        const duplicateCount = groups.reduce((sum, group) => sum + group.length - 1, 0);
        const preview = groups.slice(0, 5).map(group => `#${group.map(seg => seg.id).join(" / #")} · ${formatTimeDetailed(Math.min(...group.map(seg => Number(seg.start))))}`).join("\n");
        const more = groups.length > 5 ? `\n...និង ${groups.length - 5} ក្រុមទៀត` : "";
        const confirmed = await showAppConfirm(`រកឃើញ ${groups.length} ក្រុម (${duplicateCount} បន្ទាត់ស្ទួន) ដែលមានអត្ថបទដូចគ្នា និងម៉ោងត្រួតគ្នា។\n\n${preview}${more}\n\nតើចង់លុបតែច្បាប់ចម្លង ហើយរក្សាទុកមួយក្នុងមួយក្រុមទេ?`, { title: "ពិនិត្យ Segment ស្ទួន", confirmText: "លុបច្បាប់ចម្លង" });
        if (!confirmed) return;
        const removeIds = [];
        groups.forEach(group => {
            group.sort((a, b) => Number(Boolean(b.audio_url)) - Number(Boolean(a.audio_url)) || Number(Boolean(b.translated_text)) - Number(Boolean(a.translated_text)) || Number(a.start) - Number(b.start));
            removeIds.push(...group.slice(1).map(seg => seg.id));
        });
        recordUndo();
        removeSegments(removeIds);
        if (duplicateSegmentStatus) duplicateSegmentStatus.textContent = `បានលុប ${removeIds.length} ច្បាប់ចម្លង`;
        showToast(`បានលុប Segment ស្ទួន ${removeIds.length} ហើយរក្សាទុក Segment ដើមក្នុងក្រុមនីមួយៗ។`);
    });

    function startBlockDrag(e, type, seg) {
        e.stopPropagation();
        e.preventDefault();

        if (type === "move" && e.shiftKey) {
            selectSegmentRange(seg.id);
            return;
        }
        if (type === "move" && e.ctrlKey) {
            const selected = new Set(state.selectedSegmentIds || []);
            if (selected.has(seg.id)) selected.delete(seg.id);
            else selected.add(seg.id);
            state.selectedSegmentIds = Array.from(selected);
            state.selectedSegmentId = seg.id;
            state.selectionAnchorSegmentId = seg.id;
            updateSelectionLabel();
            highlightTableRow(seg.id);
            renderTimelineTracks();
            return;
        }

        if (type === "move" && !(state.selectedSegmentIds || []).includes(seg.id)) {
            state.selectionAnchorSegmentId = seg.id;
            selectSegment(seg.id, false);
        } else if (type !== "move") {
            selectSegment(seg.id, false);
        }

        const dragSegments = type === "move"
            ? state.segments.filter(item => (state.selectedSegmentIds || []).includes(item.id))
            : [seg];

        const totalDuration = videoElement.duration || state.currentVideoDuration || (state.segments.length > 0 ? state.segments.reduce((latest, seg) => Math.max(latest, Number(seg.end) || 0), 0) : 60);
        const wrapper = timelineContentWrapper || timelineContainer;
        const wrapperRect = wrapper.getBoundingClientRect();

        activeDrag = {
            type, // "resize-start", "resize-end", "move"
            seg,
            startX: e.clientX,
            origStart: seg.start,
            origEnd: seg.end,
            origDuration: seg.end - seg.start,
            group: dragSegments.map(item => ({ seg: item, start: Number(item.start), end: Number(item.end) })),
            totalDuration,
            wrapperWidth: wrapperRect.width || 1,
            moved: false
        };

    }

    window.addEventListener("pointermove", (e) => {
        if (!activeDrag) return;

        const deltaX = e.clientX - activeDrag.startX;
        if (!activeDrag.moved && Math.abs(deltaX) > 2) {
            recordUndo();
            activeDrag.moved = true;
        }

        const deltaTime = (deltaX / activeDrag.wrapperWidth) * activeDrag.totalDuration;
        const seg = activeDrag.seg;

        if (activeDrag.type === "resize-start") {
            let newStart = activeDrag.origStart + deltaTime;
            newStart = Math.max(0, Math.min(activeDrag.origEnd - 0.1, newStart));
            newStart = Math.round(newStart * 100) / 100;
            seg.start = newStart;

            // Live video frame matching
            if (videoElement.duration) {
                videoElement.currentTime = newStart;
            }
            const startInput = document.querySelector(`input[data-field="start"][data-id="${seg.id}"]`);
            if (startInput) startInput.value = formatSegmentTime(newStart);

            updateDragBlockVisuals(seg, activeDrag.totalDuration);
        } else if (activeDrag.type === "resize-end") {
            let newEnd = activeDrag.origEnd + deltaTime;
            newEnd = Math.min(activeDrag.totalDuration, Math.max(activeDrag.origStart + 0.1, newEnd));
            newEnd = Math.round(newEnd * 100) / 100;
            seg.end = newEnd;

            // Live video frame matching
            if (videoElement.duration) {
                videoElement.currentTime = newEnd;
            }
            const endInput = document.querySelector(`input[data-field="end"][data-id="${seg.id}"]`);
            if (endInput) endInput.value = formatSegmentTime(newEnd);

            updateDragBlockVisuals(seg, activeDrag.totalDuration);
        } else if (activeDrag.type === "move" && activeDrag.moved) {
            const group = activeDrag.group;
            const minStart = Math.min(...group.map(item => item.start));
            const maxEnd = Math.max(...group.map(item => item.end));
            const clampedDelta = Math.max(-minStart, Math.min(activeDrag.totalDuration - maxEnd, deltaTime));

            group.forEach(item => {
                item.seg.start = Math.round((item.start + clampedDelta) * 100) / 100;
                item.seg.end = Math.round((item.end + clampedDelta) * 100) / 100;
                const startInput = document.querySelector(`input[data-field="start"][data-id="${item.seg.id}"]`);
                if (startInput) startInput.value = formatSegmentTime(item.seg.start);
                const endInput = document.querySelector(`input[data-field="end"][data-id="${item.seg.id}"]`);
                if (endInput) endInput.value = formatSegmentTime(item.seg.end);
                updateDragBlockVisuals(item.seg, activeDrag.totalDuration);
            });

            // Live video frame matching
            if (videoElement.duration) {
                videoElement.currentTime = newStart;
            }
            const startInput = document.querySelector(`input[data-field="start"][data-id="${seg.id}"]`);
            if (startInput) startInput.value = formatSegmentTime(newStart);
            const endInput = document.querySelector(`input[data-field="end"][data-id="${seg.id}"]`);
            if (endInput) endInput.value = formatSegmentTime(newEnd);

            updateDragBlockVisuals(seg, activeDrag.totalDuration);
        }

        if (lblSelectedSegment) {
            lblSelectedSegment.textContent = `#${seg.id} [${formatTimeDetailed(seg.start)} - ${formatTimeDetailed(seg.end)}]`;
        }
    });

    window.addEventListener("pointerup", () => {
        if (!activeDrag) return;
        const hadMoved = activeDrag.moved;
        activeDrag = null;

        if (hadMoved) {
            renderTimelineTracks();
            renderSegmentsTable();
            updateSubtitleOverlay();
        }
    });

    function updateDragBlockVisuals(seg, totalDuration) {
        const leftPercent = (seg.start / totalDuration) * 100;
        const widthPercent = Math.max(0.4, ((seg.end - seg.start) / totalDuration) * 100);

        document.querySelectorAll(`[data-seg-id="${seg.id}"]`).forEach(el => {
            el.style.left = `${leftPercent}%`;
            el.style.width = `${widthPercent}%`;
        });
    }

    function renderTimeRuler(totalDuration) {
        if (!timelineTimeRuler) return;
        timelineTimeRuler.innerHTML = "";
        const step = totalDuration > 1800 ? 120 : (totalDuration > 600 ? 60 : (totalDuration > 120 ? 15 : 5));
        for (let t = 0; t <= totalDuration; t += step) {
            const pct = (t / totalDuration) * 100;
            const tick = document.createElement("div");
            tick.className = "absolute top-0 bottom-0 flex flex-col items-center pointer-events-none select-none";
            tick.style.left = `${pct}%`;
            tick.innerHTML = `
                <span class="text-[8px] font-mono text-base-500 leading-none -translate-x-1/2">${formatTime(t)}</span>
                <div class="w-px h-1.5 bg-base-800 mt-0.5"></div>
            `;
            timelineTimeRuler.appendChild(tick);
        }
    }

    function applyTimelineVerticalZoom() {
        const scale = Math.max(1, Math.min(3, Number(state.timelineVerticalZoom) || 1));
        const laneHeight = 28 * scale;
        const scaledHeight = Math.ceil(48 + laneHeight * 3);
        const contentHeight = Math.max(timelineBody?.clientHeight || 0, scaledHeight);
        if (timelineTrackLabels) timelineTrackLabels.style.height = `${contentHeight}px`;
        if (timelineContainer) timelineContainer.style.height = `${contentHeight}px`;
        if (timelineContentWrapper) {
            timelineContentWrapper.style.height = `${contentHeight}px`;
            timelineContentWrapper.style.minHeight = `${contentHeight}px`;
        }
        document.querySelectorAll(".timeline-lane-label").forEach(label => {
            label.style.height = `${laneHeight}px`;
            label.style.fontSize = `${Math.min(18, 10 * scale)}px`;
        });
        [trackText, trackVoice, trackBg].filter(Boolean).forEach(track => {
            track.style.height = `${laneHeight}px`;
            track.style.minHeight = `${laneHeight}px`;
        });
        if (trackBg?.firstElementChild) trackBg.firstElementChild.style.height = `${Math.max(6, 8 * scale)}px`;
        if (lblTimelineVerticalZoom) lblTimelineVerticalZoom.textContent = `${scale.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}x`;
    }

    function setTimelineVerticalZoom(scale) {
        state.timelineVerticalZoom = Math.max(1, Math.min(3, Math.round(scale * 4) / 4));
        try { localStorage.setItem("ai_dubber_timeline_vertical_zoom", String(state.timelineVerticalZoom)); } catch (error) { /* Zoom remains active for this session. */ }
        applyTimelineVerticalZoom();
        renderTimelineTracks();
    }

    try {
        const savedVerticalZoom = Number(localStorage.getItem("ai_dubber_timeline_vertical_zoom"));
        if (Number.isFinite(savedVerticalZoom) && savedVerticalZoom >= 1 && savedVerticalZoom <= 3) state.timelineVerticalZoom = savedVerticalZoom;
    } catch (error) { /* Use the default scale if storage is unavailable. */ }

    function renderTimelineTracks() {
        const totalDuration = videoElement.duration || state.currentVideoDuration || (state.segments.length > 0 ? state.segments.reduce((latest, seg) => Math.max(latest, Number(seg.end) || 0), 0) : 60);

        applyTimelineVerticalZoom();
        if (timelineContentWrapper) {
            timelineContentWrapper.style.width = `${state.timelineZoom * 100}%`;
        }

        renderTimeRuler(totalDuration);

        trackText.innerHTML = "";
        trackVoice.innerHTML = "";

        let visibleStart = 0;
        let visibleEnd = totalDuration;
        if (timelineContainer && timelineContentWrapper && timelineContentWrapper.clientWidth > 0) {
            const contentWidth = timelineContentWrapper.clientWidth;
            const viewport = timelineContainer.clientWidth;
            visibleStart = Math.max(0, ((timelineContainer.scrollLeft - viewport) / contentWidth) * totalDuration);
            visibleEnd = Math.min(totalDuration, ((timelineContainer.scrollLeft + viewport * 2) / contentWidth) * totalDuration);
        }
        const visibleSegments = state.segments.filter(seg => Number(seg.end) >= visibleStart && Number(seg.start) <= visibleEnd);

        visibleSegments.forEach(seg => {
            const leftPercent = (seg.start / totalDuration) * 100;
            const widthPercent = Math.max(0.4, ((seg.end - seg.start) / totalDuration) * 100);
            const isSelected = (state.selectedSegmentIds || [state.selectedSegmentId]).includes(seg.id);

            // --- Text Block ---
            const textBlock = document.createElement("div");
            const hasTrans = !!(seg.translated_text && seg.translated_text.trim());
            textBlock.setAttribute("data-seg-id", seg.id);
            textBlock.className = `absolute top-0.5 bottom-0.5 rounded ${hasTrans ? "bg-emerald-950/85 border-emerald-700/60 text-emerald-200" : "bg-base-900 border-base-750 text-base-300"} ${isSelected ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-base-950 z-20 font-semibold" : "z-10"} border px-2 flex items-center text-[10px] overflow-hidden whitespace-nowrap text-ellipsis hover:brightness-125 transition cursor-grab select-none group`;
            textBlock.style.left = `${leftPercent}%`;
            textBlock.style.width = `${widthPercent}%`;
            textBlock.style.fontSize = `${Math.min(18, 10 * state.timelineVerticalZoom)}px`;
            textBlock.textContent = seg.translated_text || seg.original_text || `#${seg.id}`;
            textBlock.title = `Segment #${seg.id} [${formatTimeDetailed(seg.start)} - ${formatTimeDetailed(seg.end)}]
ចុចអូសដើម្បីផ្លាស់ទី ឬទាញគែមឆ្វេង/ស្តាំដើម្បីកាត់តម្រឹម`;

            // Left Resize Handle
            const leftHandle = document.createElement("div");
            leftHandle.className = "resize-handle-left absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/50 active:bg-white/80 rounded-l transition z-30 flex items-center justify-center opacity-0 group-hover:opacity-100";
            leftHandle.innerHTML = `<div class="w-0.5 h-3 bg-white/70 rounded"></div>`;
            leftHandle.title = "ទាញកែប្រែពេលចាប់ផ្តើម (Trim Start)";
            leftHandle.addEventListener("pointerdown", (e) => startBlockDrag(e, "resize-start", seg));
            textBlock.appendChild(leftHandle);

            // Right Resize Handle
            const rightHandle = document.createElement("div");
            rightHandle.className = "resize-handle-right absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/50 active:bg-white/80 rounded-r transition z-30 flex items-center justify-center opacity-0 group-hover:opacity-100";
            rightHandle.innerHTML = `<div class="w-0.5 h-3 bg-white/70 rounded"></div>`;
            rightHandle.title = "ទាញកែប្រែពេលបញ្ចប់ (Trim End)";
            rightHandle.addEventListener("pointerdown", (e) => startBlockDrag(e, "resize-end", seg));
            textBlock.appendChild(rightHandle);

            // Move on body
            textBlock.addEventListener("pointerdown", (e) => {
                if (e.target === leftHandle || e.target === rightHandle) return;
                startBlockDrag(e, "move", seg);
            });
            textBlock.addEventListener("dblclick", () => openSegmentEditor(seg.id));

            trackText.appendChild(textBlock);

            // --- Voice Block ---
            if (seg.audio_url || (seg.status && seg.status.includes("សំឡេង"))) {
                const voiceBlock = document.createElement("div");
                const isFemale = seg.voice_profile === "km-KH-SreymomNeural";
                voiceBlock.setAttribute("data-seg-id", seg.id);
                voiceBlock.className = `absolute top-0.5 bottom-0.5 rounded ${isFemale ? "bg-pink-950/85 border-pink-700/60 text-pink-200" : "bg-blue-950/85 border-blue-700/60 text-blue-200"} ${isSelected ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-base-950 z-20 font-semibold" : "z-10"} border px-2 flex items-center text-[10px] overflow-hidden whitespace-nowrap text-ellipsis hover:brightness-125 transition cursor-grab select-none group`;
                voiceBlock.style.left = `${leftPercent}%`;
                voiceBlock.style.width = `${widthPercent}%`;
                voiceBlock.style.fontSize = `${Math.min(18, 10 * state.timelineVerticalZoom)}px`;
                const assignedSpeaker = state.speakerProfiles.find(profile => profile.id === seg.speaker_id);
                voiceBlock.textContent = assignedSpeaker ? assignedSpeaker.name : (isFemale ? "👩 Sreymom" : "👨 Piseth");
                voiceBlock.title = `Segment #${seg.id}${assignedSpeaker ? ` · ${assignedSpeaker.name}` : ""} (${seg.voice_profile})
[${formatTimeDetailed(seg.start)} - ${formatTimeDetailed(seg.end)}]
ចុចអូសដើម្បីផ្លាស់ទី ឬទាញគែមឆ្វេង/ស្តាំដើម្បីកាត់តម្រឹម`;

                const vLeftHandle = document.createElement("div");
                vLeftHandle.className = "resize-handle-left absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/50 active:bg-white/80 rounded-l transition z-30 flex items-center justify-center opacity-0 group-hover:opacity-100";
                vLeftHandle.innerHTML = `<div class="w-0.5 h-3 bg-white/70 rounded"></div>`;
                vLeftHandle.title = "ទាញកែប្រែពេលចាប់ផ្តើម (Trim Start)";
                vLeftHandle.addEventListener("pointerdown", (e) => startBlockDrag(e, "resize-start", seg));
                voiceBlock.appendChild(vLeftHandle);

                const vRightHandle = document.createElement("div");
                vRightHandle.className = "resize-handle-right absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/50 active:bg-white/80 rounded-r transition z-30 flex items-center justify-center opacity-0 group-hover:opacity-100";
                vRightHandle.innerHTML = `<div class="w-0.5 h-3 bg-white/70 rounded"></div>`;
                vRightHandle.title = "ទាញកែប្រែពេលបញ្ចប់ (Trim End)";
                vRightHandle.addEventListener("pointerdown", (e) => startBlockDrag(e, "resize-end", seg));
                voiceBlock.appendChild(vRightHandle);

                voiceBlock.addEventListener("pointerdown", (e) => {
                    if (e.target === vLeftHandle || e.target === vRightHandle) return;
                    startBlockDrag(e, "move", seg);
                });

                trackVoice.appendChild(voiceBlock);
            }
        });
    }

    if (timelineContainer) {
        let timelineScrollFrame = 0;
        timelineContainer.addEventListener("scroll", () => {
            if (timelineScrollFrame) return;
            timelineScrollFrame = requestAnimationFrame(() => {
                timelineScrollFrame = 0;
                renderTimelineTracks();
            });
        }, { passive: true });
    }

    // --- Quick Segment Alignment Toolbar Actions ---

    function shiftSelectedSegments(offset) {
        const ids = (state.selectedSegmentIds || []).length ? state.selectedSegmentIds : [state.selectedSegmentId].filter(id => id != null);
        const selected = state.segments.filter(seg => ids.includes(seg.id));
        if (!selected.length) return false;
        const minStart = Math.min(...selected.map(seg => Number(seg.start) || 0));
        const maxEnd = Math.max(...selected.map(seg => Number(seg.end) || 0));
        const duration = Number(videoElement.duration || state.currentVideoDuration) || Infinity;
        const delta = Math.max(-minStart, Math.min(duration - maxEnd, offset));
        if (!delta) return false;
        recordUndo();
        selected.forEach(seg => {
            seg.start = Math.round((Number(seg.start) + delta) * 100) / 100;
            seg.end = Math.round((Number(seg.end) + delta) * 100) / 100;
        });
        renderSegmentsTable();
        renderTimelineTracks();
        updateSubtitleOverlay();
        scheduleAutosave();
        return true;
    }

    if (btnSetStartToCurrent) {
        btnSetStartToCurrent.addEventListener("click", () => {
            if (!state.segments.length) return;
            const current = Math.round(videoElement.currentTime * 100) / 100;
            let target = state.segments.find(s => s.id === state.selectedSegmentId);
            if (!target) {
                target = state.segments.reduce((prev, curr) => Math.abs(curr.start - current) < Math.abs(prev.start - current) ? curr : prev, state.segments[0]);
            }
            if (!target) return;
            if (!state.selectedSegmentIds?.includes(target.id)) selectSegment(target.id, false);
            const offset = current - target.start;
            if (!shiftSelectedSegments(offset)) showToast("មិនអាចកែពេលវេលា Segment ដែលបានជ្រើសរើសបានទេ។");
        });
    }

    if (btnSetEndToCurrent) {
        btnSetEndToCurrent.addEventListener("click", () => {
            if (!state.segments.length) return;
            const current = Math.round(videoElement.currentTime * 100) / 100;
            let target = state.segments.find(s => s.id === state.selectedSegmentId);
            if (!target) {
                target = state.segments.reduce((prev, curr) => Math.abs(curr.end - current) < Math.abs(prev.end - current) ? curr : prev, state.segments[0]);
            }
            if (!target) return;
            if (!state.selectedSegmentIds?.includes(target.id)) selectSegment(target.id, false);
            const offset = current - target.end;
            if (!shiftSelectedSegments(offset)) showToast("មិនអាចកែពេលវេលា Segment ដែលបានជ្រើសរើសបានទេ។");
        });
    }

    function nudgeSelectedSegment(delta) {
        if (!state.segments.length) return;
        if (!shiftSelectedSegments(delta)) showToast("សូមជ្រើសរើស Segment ដើម្បីរំកិលជាមុនសិន។");
    }

    if (btnNudgeLeft) {
        btnNudgeLeft.addEventListener("click", () => nudgeSelectedSegment(-0.1));
    }

    if (btnNudgeRight) {
        btnNudgeRight.addEventListener("click", () => nudgeSelectedSegment(0.1));
    }

    if (btnShiftAll) {
        btnShiftAll.addEventListener("click", async () => {
            if (!state.segments.length) {
                showToast("មិនទាន់មាន Segment សម្រាប់រំកិលទេ!");
                return;
            }
            const val = await showAppPrompt("បញ្ចូលចំនួនវិនាទីដែលត្រូវរំកិល Segment ទាំងអស់ស្មើគ្នា (ឧទាហរណ៍ +0.5 ដើម្បីពន្យារ ឬ -0.3 ដើម្បីរំកិលមុន):", "+0.0", { title: "រំកិល Segments", confirmText: "អនុវត្ត" });
            if (val === null) return;
            const offset = parseFloat(val);
            if (isNaN(offset) || offset === 0) return;

            const minStart = Math.min(...state.segments.map(seg => Number(seg.start) || 0));
            const maxEnd = Math.max(...state.segments.map(seg => Number(seg.end) || 0));
            const duration = Number(videoElement.duration || state.currentVideoDuration) || Infinity;
            const appliedOffset = Math.max(-minStart, Math.min(duration - maxEnd, offset));
            if (!appliedOffset) return;
            recordUndo();
            state.segments.forEach(seg => {
                seg.start = Math.round((seg.start + appliedOffset) * 100) / 100;
                seg.end = Math.round((seg.end + appliedOffset) * 100) / 100;
            });

            renderSegmentsTable();
            renderTimelineTracks();
            updateSelectionLabel();
            updateSubtitleOverlay();
            scheduleAutosave();
            showToast(`បានរំកិល Segment ទាំងអស់ ${appliedOffset > 0 ? "+" + appliedOffset : appliedOffset} វិនាទីដោយជោគជ័យ!`);
        });
    }

    // Keyboard Shortcuts for Precision Alignment
    window.addEventListener("keydown", (e) => {
        const activeEl = document.activeElement;
        const isInput = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT");
        if ((e.ctrlKey || e.metaKey) && !isInput && e.key.toLowerCase() === "z") {
            e.preventDefault();
            if (e.shiftKey) redo(); else undo();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && !isInput && e.key.toLowerCase() === "y") {
            e.preventDefault();
            redo();
            return;
        }
        if (e.key === "Escape" && segmentEditModal && !segmentEditModal.classList.contains("hidden")) {
            closeSegmentEditor();
            return;
        }
        if (isInput) return; // Keep native text-field shortcuts while typing
        if (e.key === "Enter" && state.selectedSegmentId != null) {
            e.preventDefault();
            openSegmentEditor();
            return;
        }
        if (e.key === "Delete" && state.selectedSegmentId != null) {
            e.preventDefault();
            btnDeleteSelected?.click();
            return;
        }
        if ((e.key === "c" || e.key === "C" || e.key === "s" || e.key === "S") && state.selectedSegmentId != null) {
            e.preventDefault();
            btnSplitAtPlayhead?.click();
            return;
        }

        if (e.key === "[" || e.key === "i" || e.key === "I") {
            if (btnSetStartToCurrent) btnSetStartToCurrent.click();
        } else if (e.key === "]" || e.key === "o" || e.key === "O") {
            if (btnSetEndToCurrent) btnSetEndToCurrent.click();
        } else if (e.key === "ArrowLeft" && e.altKey) {
            e.preventDefault();
            nudgeSelectedSegment(-0.1);
        } else if (e.key === "ArrowRight" && e.altKey) {
            e.preventDefault();
            nudgeSelectedSegment(0.1);
        } else if (e.key === " " && !e.target.matches("button")) {
            e.preventDefault();
            if (videoElement.paused) {
                videoElement.play();
            } else {
                videoElement.pause();
            }
        }
    });

    function updateTimelineZoom() {
        if (timelineContentWrapper) {
            timelineContentWrapper.style.width = `${state.timelineZoom * 100}%`;
        }
        if (lblZoomLevel) {
            lblZoomLevel.textContent = `${state.timelineZoom}x`;
        }
        renderTimelineTracks();
    }

    if (btnZoomIn) {
        btnZoomIn.addEventListener("click", () => {
            state.timelineZoom = Math.min(10, state.timelineZoom + 0.5);
            updateTimelineZoom();
        });
    }

    if (btnZoomOut) {
        btnZoomOut.addEventListener("click", () => {
            state.timelineZoom = Math.max(1, state.timelineZoom - 0.5);
            updateTimelineZoom();
        });
    }

    if (btnZoomFit) {
        btnZoomFit.addEventListener("click", () => {
            state.timelineZoom = 1;
            updateTimelineZoom();
            if (timelineContainer) timelineContainer.scrollLeft = 0;
        });
    }

    if (btnTimelineVerticalZoomOut) btnTimelineVerticalZoomOut.addEventListener("click", () => setTimelineVerticalZoom(state.timelineVerticalZoom - 0.25));
    if (btnTimelineVerticalZoomIn) btnTimelineVerticalZoomIn.addEventListener("click", () => setTimelineVerticalZoom(state.timelineVerticalZoom + 0.25));
    if (btnTimelineVerticalZoomFit) btnTimelineVerticalZoomFit.addEventListener("click", () => setTimelineVerticalZoom(1));
    applyTimelineVerticalZoom();

    // Timeline layer visibility controls. Hidden layers keep their segment data.
    const timelineLayerLabels = {
        text: document.getElementById("timelineTextLabel"),
        voice: document.getElementById("timelineVoiceLabel"),
        background: document.getElementById("timelineBackgroundLabel")
    };
    let savedTimelineLayers = {};
    try {
        savedTimelineLayers = JSON.parse(localStorage.getItem("timeline_layer_visibility") || "{}");
    } catch (error) {
        savedTimelineLayers = {};
    }
    document.querySelectorAll("[data-timeline-layer]").forEach(button => {
        const layer = button.dataset.timelineLayer;
        const visible = savedTimelineLayers[layer] !== false;
        const row = document.querySelector(`[data-timeline-layer-row="${layer}"]`);
        const label = timelineLayerLabels[layer];
        const setVisibility = isVisible => {
            if (row) row.classList.toggle("hidden", !isVisible);
            if (label) label.classList.toggle("hidden", !isVisible);
            button.setAttribute("aria-pressed", String(isVisible));
            button.classList.toggle("opacity-50", !isVisible);
            savedTimelineLayers[layer] = isVisible;
            localStorage.setItem("timeline_layer_visibility", JSON.stringify(savedTimelineLayers));
        };
        setVisibility(visible);
        button.addEventListener("click", () => setVisibility(button.getAttribute("aria-pressed") !== "true"));
    });

    // Auto-load saved settings and offer recovery of the latest autosaved project.
    loadSavedSettings();
    restoreAutosaveIfAvailable();

    if (window.lucide) {
        lucide.createIcons();
    }
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeDubbingApp, { once: true });
} else {
    initializeDubbingApp();
}
