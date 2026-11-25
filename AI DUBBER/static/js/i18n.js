/* Lightweight UI localization. User-authored transcript text is left untouched. */
(() => {
    const LANGUAGE_KEY = "ai_dubber_language";
    const en = {
        "AI DUBBER - ប្រព័ន្ធបកប្រែ និងបញ្ចូលសំឡេងវីដេអូ AI": "AI DUBBER — AI Video Translation & Dubbing",
        "ប្រព័ន្ធបកប្រែ និងបញ្ចូលសំឡេងវីដេអូ AI": "AI video translation and dubbing",
        "Interface language": "Interface language",
        "ភាសាចំណុចប្រទាក់": "Interface language",
        "Use English": "Use English",
        "ប្រើភាសាខ្មែរ": "Use Khmer",
        "ផ្ទុកវីដេអូ": "Load video",
        "ទាញយកវីដេអូតាម Link (YouTube, TikTok, Facebook)": "Download video from a link (YouTube, TikTok, Facebook)",
        "Link វីដេអូ": "Video link",
        "បម្លែងអត្ថបទ": "Transcribe",
        "បកប្រែ": "Translate",
        "លុបសំឡេងដើម": "Remove original audio",
        "បើកគម្រោងដែលបានរក្សាទុក": "Open a saved project",
        "បើកគម្រោង": "Open project",
        "រក្សាទុកគម្រោងការងារ": "Save project",
        "រក្សាទុក": "Save",
        "គម្រោងថ្មី": "New project",
        "មិនធ្វើវិញ (Ctrl+Z)": "Undo (Ctrl+Z)",
        "មិនធ្វើវិញ": "Undo",
        "ធ្វើឡើងវិញ (Ctrl+Y)": "Redo (Ctrl+Y)",
        "ធ្វើឡើងវិញ": "Redo",
        "ប្តូរទៅ Light mode": "Switch to light mode",
        "ប្តូរទៅ Dark mode": "Switch to dark mode",
        "ការកំណត់": "Settings",
        "ផ្ទាំងមើលវីដេអូ (Video Player)": "Video preview",
        "បិទ Subtitle ក្នុងផ្ទាំងមើល": "Hide preview subtitles",
        "បើក Subtitle ក្នុងផ្ទាំងមើល": "Show preview subtitles",
        "បើក": "On",
        "បិទ": "Off",
        "អត្ថបទបកប្រែនឹងបង្ហាញនៅទីនេះ...": "Translated captions will appear here...",
        "មិនទាន់មានវីដេអូ": "No video loaded",
        "សូមចុច \"ផ្ទុកវីដេអូ\" ខាងលើដើម្បីចាប់ផ្តើម": "Choose Load video above to get started",
        "គ្មានឯកសារ": "No file",
        "សំឡេងដើម": "Original audio",
        "🔊 ស្តាប់សំឡេង AI លើវីដេអូផ្ទាល់ (Live Dub Sync)": "🔊 Preview dubbed audio with video",
        "បើក ឬបិទសំឡេងដើមក្នុង preview": "Toggle original audio in the preview",
        "បង្កើតសំឡេង": "Generate voice",
        "នាំចេញវីដេអូ": "Export video",
        "បង្កើតសំឡេងឡើងវិញតែ Segment ដែលបរាជ័យ": "Retry failed segments only",
        "សាកបង្កើតសំឡេងឡើងវិញ": "Retry failed audio",
        "ទាញយក Subtitle (.SRT)": "Download subtitles (.SRT)",
        "ស្ថានភាពប្រព័ន្ធ": "System status",
        "ប្រព័ន្ធរួចរាល់សម្រាប់ការងារ។": "Ready to work.",
        "តារាងកែសម្រួលអត្ថបទ និងសំឡេង (Segments)": "Transcript and voice editor",
        "🎭 តួអង្គ:": "🎭 Speakers:",
        "វិភាគរលកសំឡេងវីដេអូដើម្បីសម្គាល់តួប្រុស ឬតួស្រីដោយស្វ័យប្រវត្តិ": "Analyze the source audio to suggest male and female voices",
        "ស្គាល់ប្រុស/ស្រីស្វ័យប្រវត្តិ": "Auto-detect voices",
        "ឆ្លាស់តួអង្គប្រុស/ស្រីស្វ័យប្រវត្តិ": "Alternate male and female voices",
        "ឆ្លាស់ប្រុស/ស្រី": "Alternate voices",
        "កំណត់ទាំងអស់ជាតួប្រុស": "Set all to male voice",
        "ប្រុសទាំងអស់": "All male",
        "កំណត់ទាំងអស់ជាតួស្រី": "Set all to female voice",
        "ស្រីទាំងអស់": "All female",
        "បន្ថែមបន្ទាត់": "Add segment",
        "ស្វែងរក/ជំនួស:": "Find and replace:",
        "ពាក្យដែលត្រូវរក": "Find text",
        "ជំនួសដោយ": "Replace with",
        "អត្ថបទបកប្រែ": "Translated text",
        "អត្ថបទដើម": "Original text",
        "ទាំងពីរ": "Both",
        "ជំនួសទាំងអស់": "Replace all",
        "ពិនិត្យ timing": "Check timing",
        "មិនទាន់មាន segments": "No segments yet",
        "ស្វែងរក segments មានអត្ថបទដូចគ្នា និងពេលត្រួតគ្នា": "Find duplicate text with overlapping times",
        "ពិនិត្យ Segment ស្ទួន": "Find duplicates",
        "ពិនិត្យប្រវែងសំឡេង AI ធៀបនឹងរយៈពេល Segment": "Compare generated audio length with segment timing",
        "ពិនិត្យសំឡេង": "Check audio fit",
        "ការរក្សាទុកស្វ័យប្រវត្តិរួចរាល់": "Autosave is ready",
        "កំពុងបម្លែងអត្ថបទ (Converting...)": "Transcribing...",
        "កំពុងចាប់ផ្តើម...": "Starting...",
        "លេខរៀង": "#",
        "ម៉ោងចាប់ផ្តើម (នាទី:វិនាទី)": "Start time (min:sec)",
        "ម៉ោងបញ្ចប់ (នាទី:វិនាទី)": "End time (min:sec)",
        "ទម្រង់សំឡេង": "Voice",
        "ស្ថានភាព": "Status",
        "ស្តាប់": "Preview",
        "មិនទាន់មានទិន្នន័យ Segments ទេ": "No segments yet",
        "សូមផ្ទុកវីដេអូ រួចចុច \"បម្លែងអត្ថបទ\" ដើម្បីចាប់ផ្តើម": "Load a video, then select Transcribe to begin",
        "មុន": "Previous",
        "បន្ទាប់": "Next",
        "ទាញដើម្បីកែប្រែកម្ពស់ Timeline; ប្រើព្រួញឡើង/ចុះក៏បាន": "Drag to resize the timeline, or use the up and down arrow keys",
        "ទាញកែប្រែកម្ពស់ Timeline": "Resize timeline",
        "ផ្ទាំងកែសម្រួលពេលវេលា (Timeline)": "Timeline editor",
        "បង្រួម (Zoom Out)": "Zoom out",
        "ពង្រីក (Zoom In)": "Zoom in",
        "សមនឹងអេក្រង់ (Fit to Screen)": "Fit to screen",
        "Vertical timeline zoom": "Vertical timeline zoom",
        "បង្រួមកម្ពស់ track": "Decrease track height",
        "ពង្រីកកម្ពស់ track": "Increase track height",
        "កំណត់កម្ពស់ track ដើម": "Reset track height",
        "ទីតាំងម៉ោងវីដេអូបច្ចុប្បន្ន": "Current video time",
        "ចុចលើ Segment លើ Timeline ឬក្នុងតារាងដើម្បីជ្រើសរើស": "Select a segment on the timeline or in the table",
        "គ្មានជម្រើស": "No selection",
        "កំណត់ពេលចាប់ផ្តើមនៃ Segment តាមវីដេអូបច្ចុប្បន្ន (ចុចគ្រាប់ចុច [ ឬ I)": "Set segment start to the current video time ([ or I)",
        "កំណត់ពេលបញ្ចប់នៃ Segment តាមវីដេអូបច្ចុប្បន្ន (ចុចគ្រាប់ចុច ] ឬ O)": "Set segment end to the current video time (] or O)",
        "កែសម្រួលអត្ថបទ និងម៉ោង (ចុច ២ ដងលើ Segment ឬចុច Enter)": "Edit text and timing (double-click a segment or press Enter)",
        "✏️ កែប្រែ": "✏️ Edit",
        "ពុះ Segment ជាពីរត្រង់ Playhead (ចុច C ឬ S)": "Split the segment at the playhead (C or S)",
        "ពុះ": "Split",
        "លុប Segment នេះ (ចុច Delete)": "Delete this segment (Delete)",
        "រំកិលពេលវេលានៃ Segment ទាំងអស់ស្មើគ្នា (Shift All)": "Shift all segment times by the same amount",
        "រំកិលទាំងអស់": "Shift all",
        "Timeline layer visibility": "Timeline layer visibility",
        "Layers:": "Layers:",
        "រង្វាស់ម៉ោង": "Time ruler",
        "អត្ថបទ (Text)": "Text",
        "សំឡេង AI": "AI voice",
        "ផ្ទៃក្រោយ (BG)": "Background audio",
        "ការកំណត់ប្រព័ន្ធ (Settings)": "Settings",
        "Google Gemini API Key": "Google Gemini API key",
        "យក API Key ឥតគិតថ្លៃ (AI Studio)": "Get a free API key (AI Studio)",
        "បញ្ចូល AIzaSy...": "Enter AIzaSy...",
        "តេស្តសោ": "Test key",
        "ប្រើ Gemini API Key ពី Google AI Studio (មិនមែន OAuth access token)។ សោនេះត្រូវបានរក្សាទុកក្នុង browser នេះ។": "Use a Gemini API key from Google AI Studio (not an OAuth access token). The key is stored in this browser.",
        "ម៉ូដែល Gemini AI (Model Selection)": "Gemini model",
        "gemini-3.8-flash (លឿន និងណែនាំ)": "gemini-3.8-flash (fast, recommended)",
        "gemini-3.5-flash-lite (សន្សំសំចៃ)": "gemini-3.5-flash-lite (lower cost)",
        "ប្រសិនបើម៉ូដែលមួយមិនដំណើរការ ប្រព័ន្ធនឹងប្តូរទៅម៉ូដែលជំនួសដោយស្វ័យប្រវត្តិ។": "If a model is unavailable, the app will automatically try another model.",
        "ទឹកដមនៃការបកប្រែ (Translation Tone & Style)": "Translation tone and style",
        "ការសន្ទនាបែបធម្មជាតិ (Conversational / Standard - ណែនាំ)": "Natural conversation (recommended)",
        "និទានរឿង / សង្ខេបរឿងភាពយន្ត (Dramatic Storytelling / Narration)": "Dramatic storytelling / narration",
        "ផ្លូវការ / ព័ត៌មាន និងឯកសារ (Formal / Professional / Documentary)": "Formal / professional / documentary",
        "កំប្លែង / កម្សាន្តសម័យទំនើប (Humorous / Entertaining)": "Humorous / entertaining",
        "វចនានុក្រមពាក្យពិសេស (Custom Glossary / Terminology)": "Custom glossary",
        "ឧទាហរណ៍៖\nTony Stark = ថូនី ស្តាក\nAI = អាយអាយ": "Example:\nTony Stark = Tony Stark\nAI = artificial intelligence",
        "កំណត់ឈ្មោះ ឬពាក្យបច្ចេកទេសដែលចង់ឱ្យ Gemini បកប្រែតាមនេះជានិច្ច។": "Add names or terminology that Gemini should translate consistently.",
        "កែសម្រួលសំនៀងសំឡេងនិយាយ (Voice Fine-Tuning)": "Voice fine-tuning",
        "👨 Piseth (ប្រុស)": "👨 Piseth (male)",
        "👩 Sreymom (ស្រី)": "👩 Sreymom (female)",
        "ល្បឿន:": "Speed:",
        "បោះបង់": "Cancel",
        "រក្សាទុកសោ": "Save settings",
        "រំកិល Segment ថយក្រោយ 0.1s (ចុច Alt+ឆ្វេង)": "Move segment back by 0.1s (Alt + Left)",
        "រំកិល Segment ទៅមុខ 0.1s (ចុច Alt+ស្តាំ)": "Move segment forward by 0.1s (Alt + Right)",
        "ជម្រើសនាំចេញវីដេអូ (Export Video)": "Video export options",
        "ពិនិត្យគុណភាពមុននាំចេញ": "Pre-export quality check",
        "ពិនិត្យម្ដងទៀត": "Check again",
        "ពិនិត្យគុណភាព": "Quality checks",
        "កំពុងពិនិត្យ...": "Checking...",
        "ពិនិត្យសិទ្ធិមុនបង្ហោះ (Pre-post rights review)": "Rights review",
        "បញ្ជីរំលឹកដោយដៃប៉ុណ្ណោះ—មិនមែនការស្កេនរក copyright ដោយស្វ័យប្រវត្តិទេ។ ការនាំចេញនៅតែអាចធ្វើបាន។": "A manual checklist only. This does not scan for copyright, and export remains available.",
        "ខ្ញុំមានសិទ្ធិប្រើវីដេអូ និងឃ្លីបដែលបានបញ្ចូល": "I have the rights to use the video and clips provided",
        "តន្ត្រី និងសំឡេងដែលមានក្នុងលទ្ធផល ត្រូវបានអនុញ្ញាត ឬដកចេញ": "Music and audio in the result are licensed or removed",
        "បានពិនិត្យរូបភាព ឡូហ្គោ សំឡេង និងសម្ភារៈភាគីទីបី": "I reviewed visuals, logos, audio, and third-party material",
        "បានគោរពលក្ខខណ្ឌអាជ្ញាប័ណ្ណ និងការដាក់ប្រភព ប្រសិនបើត្រូវការ": "I followed license terms and attribution requirements",
        "កត់ត្រាប្រភព ឬព័ត៌មានអាជ្ញាប័ណ្ណ (ជាជម្រើស)": "Add source or license notes (optional)",
        "សំឡេងផ្ទៃខាងក្រោយ (Background Sound Mode)": "Background audio mode",
        "ណែនាំ": "Recommended",
        "បន្ថយសំឡេងភ្លេងដើមស្វ័យប្រវត្តិតែពេល AI និយាយ ហើយត្រឡប់មកពេញវិញពេលស្ងាត់": "Lower original audio while the AI speaks, then restore it during pauses",
        "បន្ថយសំឡេងដើមថេរ (Static Volume 15%)": "Keep original audio at a steady 15% volume",
        "រក្សាតន្ត្រីផ្ទៃខាងក្រោយដើមតិចៗ ១៥% ស្មើពេញមួយវីដេអូ": "Keep original background audio at 15% throughout",
        "បិទសំឡេងដើមទាំងស្រុង (Mute Original)": "Mute original audio",
        "ចាក់តែសំឡេងនិយាយបញ្ចូលថ្មី (AI Dubbing) តែប៉ុណ្ណោះ": "Use only the new AI voice track",
        "ដុតអក្សររត់លើវីដេអូ (Burn-in Styled Subtitles)": "Burn styled subtitles into the video",
        "បង្កប់ Subtitle ខ្មែរស្អាតៗលើវីដេអូ": "Add styled Khmer subtitles to the video",
        "🎨 កំណត់រចនាប័ទ្ម Subtitle (Style Customizer)": "🎨 Subtitle style",
        "ទំហំអក្សរ (Size):": "Font size:",
        "16px (តូច)": "16px (small)",
        "20px (មធ្យម - ណែនាំ)": "20px (medium, recommended)",
        "24px (ធំ ច្បាស់)": "24px (large)",
        "ពណ៌អក្សរ (Color):": "Text color:",
        "⚪ ពណ៌ស (White)": "⚪ White",
        "🟡 ពណ៌លឿង (Cinema Yellow)": "🟡 Cinema yellow",
        "🔵 ពណ៌ខៀវស្រាល (Cyan)": "🔵 Cyan",
        "ទម្រង់ផ្ទៃ (Box / Outline):": "Subtitle background:",
        "ប្រអប់ខ្មៅថ្លា (Netflix Box)": "Translucent black box",
        "អក្សរមានគែមខ្មៅ (Drop Stroke)": "Black text outline",
        "ទីតាំង (Position):": "Position:",
        "បាតក្រោម (Bottom)": "Bottom",
        "កណ្តាល (Center)": "Center",
        "ខាងលើ (Top - TikTok/Reels)": "Top (TikTok / Reels)",
        "កំពុងដំណើរការ FFmpeg...": "Rendering with FFmpeg...",
        "ការនាំចេញបានជោគជ័យ!": "Export complete!",
        "ទាញយកវីដេអូ": "Download video",
        "ចាប់ផ្តើមនាំចេញ": "Start export",
        "ទាញយកវីដេអូតាម Link (YouTube, TikTok, FB)": "Download from a link (YouTube, TikTok, Facebook)",
        "តំណភ្ជាប់វីដេអូ (Video URL)": "Video URL",
        "គាំទ្រ YouTube, TikTok, Facebook, Instagram, Twitter/X និងច្រើនទៀត។": "Supports YouTube, TikTok, Facebook, Instagram, X, and more.",
        "កំពុងទាញយកវីដេអូតាមរយៈ yt-dlp... សូមរង់ចាំ": "Downloading video with yt-dlp. Please wait...",
        "ទាញយក": "Download",
        "បញ្ជាក់សកម្មភាព": "Confirm action",
        "បន្ត": "Continue",
        "កែសម្រួលបន្ទាត់ Segment #1": "Edit segment #1",
        "ពេលវេលាក្នុងវីដេអូ (Timing / Lip-sync)": "Video timing and lip sync",
        "ម៉ោងចាប់ផ្តើម (Start - វិនាទី):": "Start time (seconds):",
        "យកម៉ោងវីដេអូបច្ចុប្បន្នដាក់ជា Start": "Use current video time as start",
        "ម៉ោងបញ្ចប់ (End - វិនាទី):": "End time (seconds):",
        "យកម៉ោងវីដេអូបច្ចុប្បន្នដាក់ជា End": "Use current video time as end",
        "រយៈពេល: 0.00s": "Duration: 0.00s",
        "ចាក់ឈុតនេះ": "Play this segment",
        "អត្ថបទដើម (Original Text):": "Original text:",
        "អត្ថបទបកប្រែជាភាសាខ្មែរ (Khmer Translated Text):": "Khmer translation:",
        "សម្រាប់បញ្ចូលសំឡេង AI": "Text for AI voice generation",
        "វាយអត្ថបទបកប្រែនៅទីនេះ...": "Enter the translated text...",
        "សំឡេងនិយាយ (Speaker):": "Voice:",
        "👨 Piseth (តួប្រុសទូទៅ)": "👨 Piseth (male)",
        "👩 Sreymom (តួស្រីទូទៅ)": "👩 Sreymom (female)",
        "👴 លោកតា (មនុស្សចាស់)": "👴 Grandfather (older man)",
        "👵 លោកយាយ (ស្រ្តីចំណាស់)": "👵 Grandmother (older woman)",
        "👦 ក្មេងប្រុស (កុមារ)": "👦 Young boy",
        "👧 ក្មេងស្រី (កុមារី)": "👧 Young girl",
        "🧙‍♂️ តួអាក្រក់ (Villain)": "🧙‍♂️ Villain",
        "📢 អ្នកអត្ថាធិប្បាយ (Narrator)": "📢 Narrator",
        "ពុះ Segment នេះជាពីរត្រង់ម៉ោងវីដេអូបច្ចុប្បន្ន": "Split this segment at the current video time",
        "ពុះបន្ទាត់": "Split segment",
        "លុបបន្ទាត់ Segment នេះចោល": "Delete this segment",
        "លុប": "Delete",
        "យល់ព្រម រក្សាទុក": "Save changes",
        "ប្រព័ន្ធកំពុងវិភាគសំឡេង": "Analyzing audio",
        "សំឡេង AI ត្រូវបានបង្កើត": "AI voice generated",
        "សំឡេង AI ត្រូវបានបកប្រែ": "Translated text",
        "សំឡេង AI": "AI voice",
        "រង់ចាំ": "Waiting",
        "បកប្រែរួចរាល់": "Translation complete",
        "បង្កើតសំឡេងរួចរាល់": "Voice generated",
        "រង់ចាំការបកប្រែ": "Waiting for translation",
        "អត្ថបទថ្មី": "New text",
        "ធម្មតា": "Normal",
        "Segment ស្ទួន": "Duplicate segment",
        "មិនទាន់មាន Segment សម្រាប់បង្កើតសំឡេងទេ!": "No segments available for voice generation.",
        "មិនទាន់មាន Segment សម្រាប់បកប្រែទេ!": "No segments available to translate.",
        "សូមបញ្ចូល Gemini API Key នៅក្នុងការកំណត់ជាមុនសិន!": "Enter your Gemini API key in Settings first.",
        "បានរក្សាទុកការកំណត់ និងសោ API Key ដោយជោគជ័យ!": "Settings and API key saved.",
        "សោ API Key មិនដំណើរការ": "The API key did not work",
        "សូមបញ្ចូល Gemini API Key ត្រឹមត្រូវមួយ!": "Enter a valid Gemini API key.",
        "✅": "✅",
        "កំពុងរក្សាទុក...": "Saving...",
        "បានរក្សាទុកស្វ័យប្រវត្តិ": "Autosaved",
        "រក្សាទុកស្វ័យប្រវត្តិមិនបាន (Storage ពេញ)": "Autosave failed (browser storage is full)",
        "បញ្ចូលពាក្យស្វែងរកជាមុនសិន។": "Enter text to find first.",
        "រកមិនឃើញពាក្យនេះទេ។": "No matches found.",
        "បានជំនួស": "Replaced",
        "មិនមាន Segment ដែលនៅសល់ត្រូវបកប្រែទេ។": "There are no untranslated segments.",
        "កំពុងបម្លែងអត្ថបទ": "Transcribing",
        "ការបម្លែងអត្ថបទបានបញ្ចប់": "Transcription complete",
        "ការបកប្រែបានបញ្ចប់!": "Translation complete!",
        "បង្កើតសំឡេងបានខ្លះ": "Some audio was generated",
        "ជោគជ័យ": "Success",
        "បរាជ័យ": "Failed",
        "រក្សាទុកគម្រោង": "Save project",
        "បើកគម្រោង": "Open project",
        "ឯកសារគម្រោងមិនត្រឹមត្រូវ!": "Invalid project file.",
        "សូមបញ្ចូល Link វីដេអូត្រឹមត្រូវមួយ!": "Enter a valid video URL.",
        "វីដេអូដើម": "Source video",
        "សំឡេង AI": "AI voice",
        "ចំណុចត្រូវពិនិត្យ": "Items to review",
        "ការត្រួតពិនិត្យរួចរាល់": "Review complete",
        "ពិនិត្យពេលវេលា": "Timing check",
        "ពិនិត្យប្រវែងសំឡេង": "Audio fit check",
        "សំឡេងវែងជាង Segment": "Audio is longer than the segment",
        "សំឡេងខ្លីជាង Segment": "Audio is shorter than the segment",
        "កំហុសក្នុងការពិនិត្យសំឡេង": "Audio check failed",
        "ស្តារគម្រោង": "Restore project",
        "ស្តារគម្រោងពីការរក្សាទុកស្វ័យប្រវត្តិ។": "Project restored from autosave.",
        "កំពុងបកប្រែជាភាសាខ្មែរ (Gemini AI)...": "Translating with Gemini AI...",
        "កំពុងបង្កើតសំឡេងនិយាយ (TTS)...": "Generating voice audio...",
        "ការបម្លែងសំឡេងទៅជាអត្ថបទបានជោគជ័យ!": "Transcription completed successfully.",
        "សូមផ្ទុកវីដេអូជាមុនសិន!": "Load a video first.",
        "ការបកប្រែអត្ថបទតាមរយៈ Gemini AI បានជោគជ័យ!": "Translation completed successfully with Gemini AI.",
        "បានបង្កើតសំឡេងនិយាយខ្មែររួចរាល់": "Khmer voice generation completed.",
        "ការនាំចេញវីដេអូបានសម្រេចដោយជោគជ័យ!": "Video exported successfully.",
        "ការទាញយកវីដេអូពី Link បានជោគជ័យ": "Video downloaded from the link.",
        "បើកគម្រោង": "Open project",
        "លក្ខខណ្ឌអាជ្ញាប័ណ្ណ": "License terms",
        "ប្រភព": "Source",
        "អាជ្ញាប័ណ្ណ": "License",
        "Piseth (ប្រុស)": "Piseth (male)",
        "Sreymom (ស្រី)": "Sreymom (female)",
        "លោកតា (ចាស់)": "Grandfather (older man)",
        "លោកយាយ (ចាស់)": "Grandmother (older woman)",
        "ក្មេងប្រុស": "Young boy",
        "ក្មេងស្រី": "Young girl",
        "តួអាក្រក់": "Villain",
        "អ្នកនិទាន": "Narrator",
        "នាំចេញ": "Export",
        "បានស្តារគម្រោងស្វ័យប្រវត្តិ": "Autosaved project restored",
        "ពេលវេលាមិនមានបញ្ហា": "No timing issues",
        "រួចរាល់": "Ready",
        "កំហុសបណ្តាញ": "Network error",
        "បញ្ហាសោ API": "API key issue",
        "សូមពិនិត្យមើល Gemini API Key របស់អ្នក។": "Check your Gemini API key.",
        "បានស្តារគម្រោងពីការរក្សាទុកស្វ័យប្រវត្តិ។ សូមផ្ទុកវីដេអូឡើងវិញ ប្រសិនបើចង់មើល preview ឬនាំចេញវីដេអូ។": "Project restored from autosave. Reload the video to preview or export it.",
        "ការបកប្រែជាភាសាខ្មែរបានជោគជ័យ!\n\nតើអ្នកចង់បង្កើតសំឡេង AI និយាយខ្មែរឥឡូវនេះដែរឬទេ?": "Translation completed.\n\nWould you like to generate Khmer voice audio now?",
        "ការបង្កើតសំឡេងនិយាយខ្មែរបានជោគជ័យ!\n\nតើអ្នកចង់នាំចេញវីដេអូដែលមានសំឡេង AI ឥឡូវនេះដែរឬទេ?": "Khmer voice generation completed.\n\nWould you like to export the dubbed video now?",
        "បានបង្កើតវីដេអូគ្មានសំឡេងដើម និងបើកលទ្ធផលក្នុង player រួចរាល់!": "Created a video without original audio and loaded it in the player.",
        "បានលុបសំឡេងដើម ហើយប្ដូរ player ទៅវីដេអូលទ្ធផលរួចរាល់!": "Removed the original audio and switched the player to the output video.",
        "បានវិភាគសំឡេង និងកំណត់តួអង្គប្រុស/ស្រីដោយជោគជ័យ!": "Audio analyzed and male/female voice suggestions assigned.",
        "បានវិភាគរលកសំឡេង និងកំណត់តួអង្គប្រុស (Piseth) / ស្រី (Sreymom) ដោយជោគជ័យ!": "Pitch analyzed and male (Piseth) / female (Sreymom) voices assigned.",
        "បានទាញយកឯកសារ Subtitle (.SRT) ភាសាខ្មែរដោយជោគជ័យ!": "Khmer subtitle file (.SRT) downloaded.",
        "បានទាញយកឯកសារ Subtitle (.SRT) ជាភាសាខ្មែរដោយជោគជ័យ!": "Khmer subtitle file (.SRT) downloaded.",
        "បានរក្សាទុកឯកសារគម្រោង (.dubproj) ដោយជោគជ័យ!": "Project file (.dubproj) saved.",
        "បានទាញយកវីដេអូតាម Link ដោយជោគជ័យ!": "Video downloaded from the link.",
        "ទាញកែប្រែពេលចាប់ផ្តើម (Trim Start)": "Drag to trim the start",
        "ទាញកែប្រែពេលបញ្ចប់ (Trim End)": "Drag to trim the end",
        "បញ្ចូលចំនួនវិនាទីដែលត្រូវរំកិល Segment ទាំងអស់ស្មើគ្នា (ឧទាហរណ៍ +0.5 ដើម្បីពន្យារ ឬ -0.3 ដើម្បីរំកិលមុន):": "Enter how many seconds to shift all segments (for example, +0.5 to delay or -0.3 to move earlier):",
        "បានរក្សាទុក": "Saved",
        "មានការកែប្រែមិនទាន់រក្សាទុក": "Unsaved changes",
        "ទំព័រ 1 / 1": "Page 1 / 1",
        "ទម្រង់ នាទី:វិនាទី (ឧ. 02:18.42)": "Time format: minutes:seconds (e.g. 02:18.42)",
        "បញ្ចូលអត្ថបទបកប្រែ...": "Enter translated text...",
        "ទាញ Segment ថយក្រោយ 0.1s (ចុច Alt+ឆ្វេង)": "Move segment back 0.1s (Alt + Left)",
        "ទាញ Segment ទៅមុខ 0.1s (ចុច Alt+ស្តាំ)": "Move segment forward 0.1s (Alt + Right)",
        "ទាញ Segment ថយក្រោយ 0.1s (ចុច Alt+ឆ្វេង)": "Move segment back 0.1s (Alt + Left)",
        "រង់ចាំការបកប្រែ": "Waiting for translation",
        "បកប្រែរួចរាល់": "Translation complete",
        "បរាជ័យបកប្រែ:": "Translation failed:",
        "បរាជ័យ:": "Failed:",
        "បានកែប្រែ - ត្រូវបង្កើតសំឡេងឡើងវិញ": "Edited — regenerate voice audio",
        "ពេលបញ្ចប់ត្រូវតែធំជាងពេលចាប់ផ្តើម": "End time must be after start time",
        "មិនទាន់មានវីដេអូដើម": "No source video loaded",
        "ខ្វះអត្ថបទបកប្រែ": "Missing translations",
        "អត្ថបទបកប្រែគ្រប់ segments": "All segments are translated",
        "ខ្វះសំឡេងបញ្ចូល": "Missing voice audio",
        "មានសំឡេងបញ្ចូលគ្រប់អត្ថបទបកប្រែ": "All translated segments have audio",
        "មិនឃើញ segment ត្រួតគ្នា": "No overlapping segments found",
        "ពេលចាប់ផ្តើម/បញ្ចប់ត្រឹមត្រូវ": "Start and end times are valid",
        "មិនឃើញចន្លោះវែង": "No long gaps found",
        "បានពិនិត្យរួចរាល់។": "Review complete.",
        "បានពិនិត្យប្រវែងសំឡេង AI រួចរាល់។": "AI audio fit check complete.",
        "ពិនិត្យប្រវែងសំឡេងមិនបាន": "Could not check audio fit",
        "បិទសារ": "Dismiss notification",
        "បញ្ចូលតម្លៃ": "Enter a value",
        "យល់ព្រម": "Confirm",
        "សូមបញ្ចូល Gemini API Key នៅក្នុងប្រអប់ជាមុនសិន!": "Enter your Gemini API key first.",
        "⏳ កំពុងតេស្តសោ API Key ជាមួយ Google Gemini...": "⏳ Testing the API key with Google Gemini...",
        "សោ API Key, ម៉ូដែល": "API key and model",
        "កំពុងផ្ទុកវីដេអូ": "Loading video",
        "សូមរង់ចាំបន្តិច កំពុងបញ្ជូនឯកសារទៅម៉ាស៊ីនបម្រើ...": "Uploading the file to the server. Please wait...",
        "ការផ្ទុកវីដេអូបរាជ័យ": "Video upload failed",
        "បានផ្ទុកវីដេអូរួចរាល់! លោកអ្នកអាចចុច 'បម្លែងអត្ថបទ' ដើម្បីចាប់ផ្តើម។": "Video loaded. Select Transcribe to begin.",
        "កំពុងបម្លែងអត្ថបទ": "Transcribing",
        "ម៉ាស៊ីន AI (faster-whisper) កំពុងស្តាប់ និងស្រង់អត្ថបទដើម... សូមរង់ចាំ។": "The faster-whisper model is listening and transcribing. Please wait...",
        "កំពុងផ្ទុកម៉ូដែល AI...": "Loading the AI model...",
        "ការបម្លែងអត្ថបទបរាជ័យ": "Transcription failed",
        "ការបម្លែងអត្ថបទដើមបានសម្រេច! លោកអ្នកអាចចុច 'បកប្រែ' ទៅជាភាសាខ្មែរ។": "Transcription complete. Select Translate to translate into Khmer.",
        "ការបម្លែងអត្ថបទបានបញ្ចប់": "Transcription complete",
        "មិនទាន់មាន Segment អត្ថបទសម្រាប់បកប្រែទេ!": "There are no transcript segments to translate.",
        "Segments ទាំងអស់មានអត្ថបទបកប្រែរួចហើយ។": "All segments are already translated.",
        "កំពុងបកប្រែ...": "Translating...",
        "កំពុងបកប្រែ": "Translating",
        "ការបកប្រែបរាជ័យ": "Translation failed",
        "ម៉ាស៊ីនបម្រើមិនបានផ្ញើលទ្ធផលបកប្រែមកវិញទេ។": "The server returned no translation results.",
        "បន្តបកប្រែ": "Continue translation",
        "នៅមានការបកប្រែ": "Translations remaining",
        "ការបកប្រែបានបញ្ចប់!": "Translation complete!",
        "ការភ្ជាប់ត្រូវបានរំខាន": "Connection interrupted",
        "មិនមាន Segment ដែលត្រូវបង្កើតសំឡេងទេ!": "There are no segments to generate voice for.",
        "កំពុងបង្កើតសំឡេង": "Generating voice",
        "កំពុងដំណើរការ...": "Processing...",
        "ការបង្កើតសំឡេងបរាជ័យ": "Voice generation failed",
        "បង្កើតសំឡេងបានខ្លះ": "Some voice audio was generated",
        "កំហុសមិនស្គាល់": "Unknown error",
        "កំពុងលុបសំឡេងដើម": "Removing original audio",
        "ប្រព័ន្ធកំពុងបំបែក និងលុបសំឡេងចេញពីវីដេអូ...": "Removing the audio track from the video...",
        "ការលុបសំឡេងបរាជ័យ": "Could not remove audio",
        "ម៉ាស៊ីនមេមិនបានផ្ញើឯកសារវីដេអូលទ្ធផលមកទេ។": "The server did not return an output video.",
        "សំឡេងដើមត្រូវបានលុប": "Original audio removed",
        "បានលុបសំឡេងដើម": "Original audio removed",
        "សូមផ្ទុកវីដេអូ និងបន្ថែម segments មុននាំចេញ។": "Load a video and add segments before exporting.",
        "ពិនិត្យមុននាំចេញ": "Pre-export review",
        "បន្តនាំចេញ": "Continue export",
        "កំពុងនាំចេញវីដេអូ": "Exporting video",
        "FFmpeg កំពុងផ្គុំរូបភាព សំឡេង និង Subtitle... សូមរង់ចាំ។": "FFmpeg is combining the video, audio, and subtitles. Please wait...",
        "ការនាំចេញវីដេអូបរាជ័យ": "Video export failed",
        "មិនទាន់មាន Segment នៅក្នុងតារាងទេ!": "There are no segments in the table.",
        "កំពុងវិភាគសំឡេង": "Analyzing audio",
        "ប្រព័ន្ធកំពុងវិភាគកម្ពស់រលកសំឡេង (Pitch Analysis) ដើម្បីបែងចែកតួប្រុស និងតួស្រី...": "Analyzing pitch to suggest male and female voices...",
        "ការវិភាគសំឡេងបរាជ័យ": "Audio analysis failed",
        "ប្តូរតួអង្គ": "Change speaker",
        "មិនទាន់មាន Segment សម្រាប់នាំចេញ Subtitle ទេ!": "There are no segments to export as subtitles.",
        "នាំចេញ Subtitle": "Export subtitles",
        "មិនទាន់មានទិន្នន័យគម្រោងសម្រាប់រក្សាទុកទេ!": "There is no project data to save.",
        "ទម្រង់ឯកសារគម្រោងមិនត្រឹមត្រូវ!": "Invalid project file format.",
        "កំហុសក្នុងការអានឯកសារគម្រោង:": "Could not read project file:",
        "សូមបញ្ចូល Link វីដេអូត្រឹមត្រូវមួយ!": "Enter a valid video URL.",
        "កំពុងទាញយកវីដេអូ": "Downloading video",
        "ប្រព័ន្ធកំពុងទាញយកវីដេអូពី Link... សូមរង់ចាំ។": "Downloading video from the link. Please wait...",
        "ការទាញយកវីដេអូបរាជ័យ": "Video download failed",
        "បានទាញយកវីដេអូតាម Link រួចរាល់! លោកអ្នកអាចចុច 'បម្លែងអត្ថបទ'។": "Video downloaded. Select Transcribe to begin.",
        "ទម្រង់ឯកសារគម្រោងមិនត្រឹមត្រូវ!": "Invalid project file format.",
        "សូមជ្រើសរើស Segment មួយជាមុនសិន។": "Select a segment first.",
        "ទីតាំងកាត់ត្រូវស្ថិតនៅកណ្ដាល Segment មិនជិតគែមពេកទេ។": "The split point must be near the middle of the segment.",
        "បានពុះ Segment ជាពីររួចរាល់។": "Segment split.",
        "លុប Segment": "Delete segment",
        "សូមជ្រើសរើស Segment ដែលចង់ពុះជាមុនសិន។": "Select a segment to split first.",
        "ម៉ោងចាប់ផ្តើម ឬបញ្ចប់មិនត្រឹមត្រូវទេ។": "Start or end time is invalid.",
        "មិនអាចចាក់វីដេអូបានទេ។": "Could not play the video.",
        "សូមបញ្ចូលម៉ោងចាប់ផ្តើម និងបញ្ចប់ឱ្យត្រឹមត្រូវ។": "Enter valid start and end times.",
        "លុប Segment នេះមែនទេ?": "Delete this segment?",
        "រកមិនឃើញ Segment ស្ទួនទេ": "No duplicate segments found",
        "រកមិនឃើញ Segment ស្ទួនដែលមានពេលត្រួតគ្នាទេ។": "No duplicate segments with overlapping times were found.",
        "ពិនិត្យ Segment ស្ទួន": "Check duplicate segments",
        "លុបច្បាប់ចម្លង": "Remove duplicates",
        "សំឡេង": "Audio",
        "មិនអាចកែពេលវេលា Segment ដែលបានជ្រើសរើសបានទេ។": "Could not update the selected segment timing.",
        "សូមជ្រើសរើស Segment ដើម្បីរំកិលជាមុនសិន។": "Select segments to shift first.",
        "មិនទាន់មាន Segment សម្រាប់រំកិលទេ!": "There are no segments to shift.",
        "រំកិល Segments": "Shift segments",
        "អនុវត្ត": "Apply",
        "រយៈពេល: 0.00s": "Duration: 0.00s",
        "ភាសាចំណុចប្រទាក់": "Interface language"
    };

    for (const key of Object.keys(en)) {
        const normalized = key.replace(/\s+/g, " ").trim();
        if (normalized !== key) {
            en[normalized] = en[key];
            delete en[key];
        }
    }

    const dynamicTranslations = [
        [/^មានគម្រោងរក្សាទុកស្វ័យប្រវត្តិ(?: (\(.*?\)))? ដែលមាន (\d+) segments។ តើអ្នកចង់ស្តារវាវិញទេ\?$/, "Restore the autosaved project$1 with $2 segments?"],
        [/^ទំព័រ (\d+) \/ (\d+) · (.+) \/ (\d+)$/, "Page $1 / $2 · $3 / $4"],
        [/^មាន (\d+) segments$/, "$1 segments total"],
        [/^បានជំនួស (\d+) កន្លែង។$/, "$1 replacement(s) made."],
        [/^រកឃើញចំណុចត្រូវពិនិត្យ (\d+)$/, "$1 items to review"],
        [/^កំពុងពិនិត្យ (\d+) segments\.\.\.$/, "Checking $1 segments..."],
        [/^កំពុងបកប្រែ (\d+) segments ដែលនៅសល់\.\.\.$/, "Translating $1 remaining segments..."],
        [/^បានបង្កើត (\d+) · បរាជ័យ (\d+)$/, "$1 generated · $2 failed"],
        [/^បានបង្កើត (\d+) segments; នៅសល់បរាជ័យ (\d+) segments។.*$/, "$1 segments generated; $2 failed. Retry failed segments from the toolbar."],
        [/^បានបង្កើតសំឡេងរួចរាល់ (\d+) segments។$/, "Voice generated for $1 segments."],
        [/^កំពុងបង្កើតសំឡេង AI សម្រាប់ (\d+) segments\.\.\.$/, "Generating AI voice for $1 segments..."],
        [/^កំពុងបកប្រែ (\d+) segments ដែលនៅសល់\.\.\.$/, "Translating $1 remaining segments..."],
        [/^នៅសល់ (\d+) segments\.\.\.$/, "$1 segments remaining..."],
        [/^បានរក្សាទុកលទ្ធផល (\d+)\/(\d+) segments$/, "Saved results for $1/$2 segments"],
        [/^បានភ្ជាប់វីដេអូ: (.+)$/, "Video loaded: $1"],
        [/^ត្រួតគ្ន ([\d.]+) វិនាទីជាមួយ Segment #(.+)$/, "$1s overlap with segment #$2"],
        [/^មានចន្លោះ ([\d.]+) វិនាទីពី Segment #(.+)$/, "$1s gap after segment #$2"],
        [/^បានលុប (\d+) ច្បាប់ចម្លង$/, "Removed $1 duplicate(s)"],
        [/^បានកំណត់គ្រប់ Segment ទាំងអស់ជាសំឡេងតួប្រុស \(Piseth\)!$/, "Set all segments to the male voice (Piseth)."],
        [/^បានកំណត់គ្រប់ Segment ទាំងអស់ជាសំឡេងតួស្រី \(Sreymom\)!$/, "Set all segments to the female voice (Sreymom)."],
        [/^បានកំណត់ឆ្លាស់តួអង្គប្រុស \(Piseth\) និងស្រី \(Sreymom\) តាមបន្ទាត់នីមួយៗ!$/, "Alternated male and female voices across segments."],
        [/^បានបើកគម្រោងដោយជោគជ័យ \(សរុប (\d+) segments\)!$/, "Project opened successfully ($1 segments)."],
        [/^បានផ្ទុកទិន្នន័យគម្រោងដោយជោគជ័យ \((\d+) segments\)!$/, "Project loaded successfully ($1 segments)."],
        [/^សំឡេងវែងជាង Segment ([\d.]+) វិនាទី$/, "Audio is $1s longer than the segment"],
        [/^សំឡេងខ្លីជាង Segment ([\d.]+) វិនាទី$/, "Audio is $1s shorter than the segment"],
        [/^សំឡេងវែងជាង Segment ([\d.]+) វិនាទី · មិនអាចអាន (\d+)$/, "Audio is $1s longer than the segment · $2 unreadable"],
        [/^ត្រូវពិនិត្យ (\d+) segments.*$/, "$1 segments need review"],
        [/^ខ្វះអត្ថបទបកប្រែ (\d+) segments$/, "$1 translations missing"],
        [/^ខ្វះសំឡេងបញ្ចូល (\d+) segments$/, "$1 voice tracks missing"],
        [/^មាន segment ត្រួតគ្នា (\d+) កន្លែង$/, "$1 overlapping segment pair(s)"],
        [/^មានពេលវេលាមិនត្រឹមត្រូវ (\d+) segments$/, "$1 invalid segment time(s)"],
        [/^មានចន្លោះលើស 5 វិនាទី (\d+) កន្លែង$/, "$1 gap(s) over 5 seconds"],
        [/^(\d+) \/ (\d+) បានពិនិត្យ$/, "$1 / $2 reviewed"],
        [/^បញ្ហា: ត្រួតគ្នា (\d+), ចន្លោះវែង (\d+), ពេលមិនត្រឹមត្រូវ (\d+)$/, "Issues: $1 overlaps, $2 long gaps, $3 invalid times"],
        [/^ត្រួតគ្នា ([\d.]+) វិនាទីជាមួយ Segment #(.+)$/, "$1s overlap with segment #$2"],
        [/^មានចន្លោះ ([\d.]+) វិនាទីពី Segment #(.+)$/, "$1s gap after segment #$2"],
        [/^កំហុសក្នុងការពិនិត្យសំឡេង: (.+)$/, "Audio check failed: $1"],
        [/^កំហុសក្នុងការផ្ទុកវីដេអូ: (.+)$/, "Video upload failed: $1"],
        [/^កំហុសក្នុងការបម្លែងអត្ថបទ: (.+)$/, "Transcription failed: $1"],
        [/^កំហុសក្នុងការបកប្រែអត្ថបទ: (.+)$/, "Translation failed: $1"],
        [/^កំហុសក្នុងការបង្កើតសំឡេង: (.+)$/, "Voice generation failed: $1"],
        [/^កំហុសក្នុងការលុបសំឡេង: (.+)$/, "Audio removal failed: $1"],
        [/^កំហុសក្នុងការនាំចេញវីដេអូ: (.+)$/, "Video export failed: $1"],
        [/^កំហុសក្នុងការទាញយកវីដេអូ: (.+)$/, "Video download failed: $1"],
        [/^បរាជ័យបកប្រែ: (.+)$/, "Translation failed: $1"],
        [/^បរាជ័យ: (.+)$/, "Failed: $1"],
        [/^បានសាកម្ដងទៀត \((\d+)\)$/, "Retry failed ($1)"],
        [/^សាកម្ដងទៀត \((\d+)\)$/, "Retry ($1)"],
        [/^ប្តូរទៅ (Light|Dark) mode$/, "Switch to $1 mode"],
        [/^បានរក្សាទុកលទ្ធផល (\d+)\/(\d+) segments$/, "Saved results for $1/$2 segments"],
        [/^បានរក្សាទុកលទ្ធផលរួច (\d+) segments; នៅសល់ (\d+)។.*$/, "Saved $1 translated segments; $2 remaining. Select Translate to continue."],
        [/^បានរក្សាទុកលទ្ធផលរួច (\d+) segments។.*$/, "Saved $1 translated segments. Select Translate to continue."],
        [/^បានបកប្រែ និងរក្សាទុក (\d+) segments ដែលនៅសល់។$/, "Translated and saved the remaining $1 segments."],
        [/^ការបម្លែងបានបញ្ចប់ ១០០%! \(សរុប (\d+) segments\)$/, "Transcription complete — $1 segments"],
        [/^បានបង្កើត (\d+) segments; នៅសល់បរាជ័យ (\d+) segments។.*$/, "$1 segments generated; $2 failed. Retry failed segments from the toolbar."],
        [/^បានបង្កើតសំឡេងរួចរាល់ (\d+) segments។$/, "Voice generated for $1 segments."],
        [/^ការបម្លែងបានបញ្ចប់ ១០០%! \(សរុប (\d+) segments\)$/, "Transcription complete — $1 segments."],
        [/^បានបកប្រែ និងរក្សាទុក (\d+) segments ដែលនៅសល់។$/, "Translated and saved the remaining $1 segments."],
        [/^រយៈពេល: ([\d.]+)s$/, "Duration: $1s"],
        [/^បានរំកិល Segment ទាំងអស់ (.+) វិនាទីដោយជោគជ័យ!$/, "Shifted all segments by $1 seconds."],
        [/^លុប (\d+) Segment ដែលបានជ្រើសរើសមែនទេ\?$/, "Delete the $1 selected segment(s)?"],
        [/^Segment #(.+)$/, "Segment #$1"]
    ];

    let language = "km";
    try {
        const saved = localStorage.getItem(LANGUAGE_KEY);
        if (saved === "en" || saved === "km") language = saved;
    } catch (_) { /* The language can still be changed for this session. */ }

    const originalText = new WeakMap();
    const originalAttributes = new WeakMap();
    let observer;

    function translate(source) {
        const normalized = source.replace(/\s+/g, " ").trim();
        if (Object.prototype.hasOwnProperty.call(en, normalized)) return en[normalized];
        for (const [pattern, replacement] of dynamicTranslations) {
            if (pattern.test(normalized)) return normalized.replace(pattern, replacement);
        }
        return null;
    }

    function isUserContent(node) {
        const parent = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        return !!parent?.closest("textarea, [contenteditable='true'], [data-seg-id], [data-no-i18n]");
    }

    function updateText(node) {
        if (!node || isUserContent(node)) return;
        const current = node.nodeValue || "";
        let record = originalText.get(node);
        if (!record) {
            record = { source: current, rendered: current };
            originalText.set(node, record);
        } else if (current !== record.rendered) {
            record.source = current;
        }
        const source = record.source;
        const leading = source.match(/^\s*/)?.[0] || "";
        const trailing = source.match(/\s*$/)?.[0] || "";
        const content = source.trim();
        const translated = language === "en" ? translate(content) : null;
        const value = translated ? `${leading}${translated}${trailing}` : source;
        record.rendered = value;
        if (node.nodeValue !== value) node.nodeValue = value;
    }

    function updateAttribute(element, name) {
        if (!element || !element.hasAttribute(name)) return;
        let saved = originalAttributes.get(element);
        if (!saved) {
            saved = new Map();
            originalAttributes.set(element, saved);
        }
        const current = element.getAttribute(name);
        let record = saved.get(name);
        if (!record) {
            record = { source: current, rendered: current };
            saved.set(name, record);
        } else if (current !== record.rendered) {
            record.source = current;
        }
        const source = record.source;
        const translated = language === "en" ? translate(source) : null;
        const value = translated || source;
        record.rendered = value;
        if (element.getAttribute(name) !== value) element.setAttribute(name, value);
    }

    function processTree(root) {
        if (!root) return;
        if (root.nodeType === Node.TEXT_NODE) {
            updateText(root);
            return;
        }
        if (root.nodeType !== Node.ELEMENT_NODE && root !== document) return;
        if (root.nodeType === Node.ELEMENT_NODE && root.matches("script, style")) return;

        const element = root.nodeType === Node.ELEMENT_NODE ? root : document.documentElement;
        ["title", "placeholder", "aria-label", "aria-description"].forEach(name => updateAttribute(element, name));
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.parentElement?.closest("script, style")) continue;
            updateText(node);
        }
        element.querySelectorAll("[title], [placeholder], [aria-label], [aria-description]").forEach(child => {
            ["title", "placeholder", "aria-label", "aria-description"].forEach(name => updateAttribute(child, name));
        });
    }

    function refreshControls() {
        document.documentElement.lang = language === "en" ? "en" : "km";
        document.body?.classList.toggle("ui-en", language === "en");
        document.querySelectorAll("[data-language]").forEach(button => {
            const active = button.dataset.language === language;
            button.setAttribute("aria-pressed", String(active));
        });
    }

    function setLanguage(nextLanguage) {
        if (nextLanguage !== "en" && nextLanguage !== "km") return;
        language = nextLanguage;
        try { localStorage.setItem(LANGUAGE_KEY, language); } catch (_) { /* Session-only preference. */ }
        refreshControls();
        processTree(document.body);
        const title = "AI DUBBER - ប្រព័ន្ធបកប្រែ និងបញ្ចូលសំឡេងវីដេអូ AI";
        document.title = language === "en" ? en[title] : title;
    }

    function initialize() {
        document.querySelectorAll("[data-language]").forEach(button => {
            button.addEventListener("click", () => setLanguage(button.dataset.language));
        });
        observer = new MutationObserver(records => {
            for (const record of records) {
                if (record.type === "characterData") updateText(record.target);
                if (record.type === "childList") record.addedNodes.forEach(processTree);
                if (record.type === "attributes") updateAttribute(record.target, record.attributeName);
            }
        });
        observer.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["title", "placeholder", "aria-label", "aria-description"]
        });
        setLanguage(language);
    }

    window.AIDubberI18n = {
        getLanguage: () => language,
        setLanguage,
        t: (khmer, english) => language === "en" ? (english || translate(khmer) || khmer) : khmer
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
})();
