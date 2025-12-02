class MidiPlayer {
    constructor() {
        this.midiData = null; //整個 Tone.js 解析出來的 MIDI 物件
        this.audioCtx = null; //new AudioContext() 的容器

        this.notes = []; //把所有 track 的 note 扁平化＋排序後的陣列
        this.playPointCenter = 0;  //現在的「歌曲時間」（秒）
        this.schedulerId = null; //setInterval 的 id，之後停 scheduler 用，目前只允許存在一個

        this.nextNoteIndex = 0; //下一顆要排程的 note 在 this.notes 裡的索引
        this.lookAhead = 0.1;        // look-ahead window 長度 (0.1秒)
        this.scheduleInterval = 10;  // scheduler 多少 ms 執行一次 (10ms)
    
        this.buffers = {}; //把 sounds 讀成 AudioBuffer 存在這裡，key 是 midi number
        this.mapping = {}; //從 kits 讀進來的「midiNum → 檔名＋其它資訊」的 map
        this.isPlaying = false; //判斷是否開始播放
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

        notes.sort((a, b) => a.time - b.time); //a-b=負 : a 前，反之為後

        return notes;
    }

    async onMidiLoaded(midi) {
        // 停掉舊 scheduler
        this.stopScheduler();

        // 關掉舊 audioCtx（避免舊歌繼續播）
        if (this.audioCtx) {
            try { await this.audioCtx.close(); 
            } catch (err) {
                //錯了直接不給回應，主要是不給報錯
            }
        }

        // 建新 AudioContext 與初始化
        this.audioCtx = new AudioContext();
        this.midiData = midi;
        this.notes = this._extractNotes(midi);
        this.playPointCenter = 0;
        this.nextNoteIndex = 0;
        this.buffers = {};
        this.isPlaying = false;
    }

    async prepareAudio() {
        await this._loadMapping();

        const midiMatchAudio = new Set(); //用 Set 避免重複載入檔案
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
    _schedulerPlaySound(note, offset) {
        const buf = this.buffers[note.midi];
        if (!buf) return;

        const source = this.audioCtx.createBufferSource();
        source.buffer = buf;

        const gain = this.audioCtx.createGain();
        if (note.velocity < 0.7)
            gain.gain.value = 0.4
        else
            gain.gain.value = 0.8
        source.connect(gain).connect(this.audioCtx.destination);
        source.start(this.audioCtx.currentTime + offset);
    }

    startScheduler() {
        if (this.schedulerId) return;

        this.schedulerId = setInterval(() => {
            if (!this.isPlaying) return;

            const now = this.audioCtx.currentTime; //Web Audio 的全域時鐘
            this.playPointCenter = now - this.playStartTime; //這一刻在歌曲內是第幾秒

            const windowEnd = this.playPointCenter + this.lookAhead; //這次 scheduler 要管理的時間區間內的音符。

            

            while (this.nextNoteIndex < this.notes.length && this.notes[this.nextNoteIndex].time < windowEnd) {
                const n = this.notes[this.nextNoteIndex];
                const offset = n.time - this.playPointCenter; // 從現在起多久後要播
                this._schedulerPlaySound(n, offset);
                this.nextNoteIndex++;
            }
        }, this.scheduleInterval);
    }

    stopScheduler() {
        if (this.schedulerId) clearInterval(this.schedulerId);
        this.schedulerId = null;
    }

    // ---------------------------------------------------
    // 改變播放時間 處理
    // ---------------------------------------------------
    binarySearchForNextNoteIndex(notes, targetTime) {
        let low = 0;
        let high = notes.length - 1;
        let result = notes.length;

            while (low <= high) {
                const mid = (low + high) >> 1; //向右 shift 1次，等於 Math.floor((low+high)/2)
                const t = notes[mid].time;

                if (t >= targetTime) {
                    result = mid; 
                    high = mid - 1; 
                } else {
                    low = mid + 1;
                }
            }

            return result;
    }


    // ---------------------------------------------------
    // Button Event 處理
    // ---------------------------------------------------
    play() {
        if (this.audioCtx.state === "suspended") { //按過暫停
            this.audioCtx.resume(); //重新啟動 Web Audio 的時鐘與所有 node
            this.isPlaying = true;
            return;
        }

        //計算歌曲一開始的位置，在全域時間的哪裡
        this.playStartTime = this.audioCtx.currentTime - this.playPointCenter;

        this.isPlaying = true;

        // 開啟 Scheduler
        this.startScheduler();
        console.log("play ok");
    }

    pause() {
        if (!this.audioCtx) return;
        this.audioCtx.suspend();   //暫停

        console.log("pause ok");
    }
}
