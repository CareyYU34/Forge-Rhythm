class MidiPlayer {
    constructor() {
        this.midiData = null;
        this.audioCtx = null;
        this.isPaused = false;
        this.buffers = {}; // note → AudioBuffer
        this.mapping = {};
    }

    async loadMapping() {
        const res = await fetch("./kits/standard.json");
        this.mapping = await res.json();
    }

    onMidiLoaded(midi) {
        this.midiData = midi;
    }

    async prepareAudio() {
        if (!this.audioCtx)
            this.audioCtx = new window.AudioContext();

        await this.loadMapping();
        const Notes = new Set();
        
        //抓出 midi 中有的 note
        this.midiData.tracks.forEach((track) => {
            track.notes.forEach((note) => {
                const midiNum = note.midi;
                if (this.mapping[midiNum]) {
                    Notes.add(midiNum);
                }
            });
        });

        const promises = Array.from(Notes).map( async (midiNum) => {
            const entry = this.mapping[midiNum];
            try {
                const res = await fetch(`./sounds/standard/${entry.file[0]}`);
                const buf = await res.arrayBuffer();
                const decoded = await this.audioCtx.decodeAudioData(buf);
                this.buffers[midiNum] = decoded;
                return { note: midiNum, status: "ok" };
            } catch (err) {
                console.log(`${midiNum} : fail`)
                return { note: midiNum, status: "fail" }; 
            }
        });

        const results = await Promise.allSettled(promises); //全部結束後回傳結果，不中斷。.all()全部成功才 resolve，任一失敗會 reject
        console.table(results);
    }
    play() {
        if (!this.audioCtx) return;

        // 如果目前是「暫停」狀態 → 改成 resume()
        if (this.isPaused) {
            this.audioCtx.resume();
            this.isPaused = false;
            console.log("resume ok");
            return;
        }

        // ------ 第一次播放 ------
        const start = this.audioCtx.currentTime;

        this.midiData.tracks.forEach((track) => {
            track.notes.forEach((note) => {
                const midiNum = note.midi;
                const buf = this.buffers[midiNum];
                if (!buf) return;

                const source = this.audioCtx.createBufferSource();
                source.buffer = buf;

                const gainNode = this.audioCtx.createGain();
                gainNode.gain.value = note.velocity || 1.0;

                source.connect(gainNode).connect(this.audioCtx.destination);
                source.start(start + note.time);
            });
        });

        this.isPaused = false;
        console.log("play ok");
    }
    pause() {
        if (!this.audioCtx) return;

        this.audioCtx.suspend();   // ← 真正的暫停
        this.isPaused = true;

        console.log("pause ok");
    }
}
