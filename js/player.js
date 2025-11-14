class MidiPlayer {
    constructor() {
        this.midiData = null;
        this.audioCtx = null;

        this.notes = [];
        this.playPointCenter = 0;  // 播放位置
        this.schedulerId = null;

        this.nextNoteIndex = 0; // scheduler 從哪個 note 開始排
        this.lookAhead = 0.2;        // 排未來 200ms
        this.scheduleInterval = 10;  // 每 10ms 排程
    
        this.buffers = {}; // note → AudioBuffer
        this.mapping = {};
        this.isPaused = false;
    }

    // ---------------------------------------------------
    // Midi Event 處理
    // ---------------------------------------------------
    async _loadMapping() {
        const res = await fetch("./kits/standard.json");
        this.mapping = await res.json();
    }

    _extractNotes(midi) {
        const notes = [];

        midi.tracks.forEach((track) => {
            track.notes.forEach((note) => {
                notes.push({
                    time: note.time,
                    duration: note.duration,
                    midi: note.midi,
                    velocity: note.velocity,
                });
            });
        });

        notes.sort((a, b) => a.time - b.time);

        return notes;
    }

    async onMidiLoaded(midi) {
        // 停掉舊 scheduler
        this.stopScheduler();

        // 關掉舊 audioCtx（避免舊歌繼續播）
        if (this.audioCtx) {
            try { await this.audioCtx.close(); } catch (_) {}
        }

        // 建新 Context
        this.audioCtx = new AudioContext();

        this.midiData = midi;
        this.notes = this._extractNotes(midi);
        this.playPointCenter = 0;
        this.nextNoteIndex = 0;

        this.buffers = {};
        this.isPlaying = false;
    }

    async prepareAudio() {
        if (!this.audioCtx)
            this.audioCtx = new AudioContext();

        await this._loadMapping();

        const midiMatchAudio = new Set();
        this.notes.forEach((note) => {
            if (this.mapping[note.midi])
                midiMatchAudio.add(note.midi);
        });

        const promises = Array.from(midiMatchAudio).map(async (midiNum) => {
            const entry = this.mapping[midiNum];
            try {
                const res = await fetch(`./sounds/standard/${entry.file[0]}`);
                const buf = await res.arrayBuffer();
                const decoded = await this.audioCtx.decodeAudioData(buf);
                this.buffers[midiNum] = decoded;
            } catch (err) {
                console.warn("Failed:", midiNum);
            }
        });

        const a = await Promise.all(promises); //全部結束後回傳結果，不中斷。.all()全部成功才 resolve，任一失敗會 reject
    }

    // ---------------------------------------------------
    // Scheduler 處理
    // ---------------------------------------------------
    _scheduleNote(note, offset) {
        const buf = this.buffers[note.midi];
        if (!buf) return;

        const source = this.audioCtx.createBufferSource();
        source.buffer = buf;

        const gain = this.audioCtx.createGain();
        if (note.velocity < 0.7)
            gain.gain.value = 0.4
        if (note.velocity > 0.7)
            gain.gain.value = 0.8
        source.connect(gain).connect(this.audioCtx.destination);
        source.start(this.audioCtx.currentTime + offset);
    }

    startScheduler() {
        if (this.schedulerId) return;

        this.schedulerId = setInterval(() => {
            if (!this.isPlaying) return;

            const now = this.audioCtx.currentTime;
            this.playPointCenter = now - this.playStartTime;

            const windowEnd = this.playPointCenter + this.lookAhead;

            
            while (this.nextNoteIndex < this.notes.length && this.notes[this.nextNoteIndex].time < windowEnd) {
                const n = this.notes[this.nextNoteIndex];
                const offset = n.time - this.playPointCenter; // 從現在起多久後要播
                this._scheduleNote(n, offset);
                this.nextNoteIndex++;
            }
        }, this.scheduleInterval);
    }

    stopScheduler() {
        if (this.schedulerId) clearInterval(this.schedulerId);
        this.schedulerId = null;
    }

    // ---------------------------------------------------
    // Button Event 處理
    // ---------------------------------------------------
    play() {
        if (!this.audioCtx) return;
        if (this.audioCtx.state === "suspended") {
            this.audioCtx.resume();
            this.isPlaying = true;
            return;
        }

        // 第一次播放（或切歌後）
        this.playStartTime = this.audioCtx.currentTime - this.playPointCenter;

        this.isPlaying = true;

        // 開啟 Scheduler
        this.startScheduler();
        console.log("play ok");
    }

    pause() {
        if (!this.audioCtx) return;
        this.audioCtx.suspend();   //暫停
        this.isPaused = false;

        console.log("pause ok");
    }
}
