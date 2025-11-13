class MidiPlayer {
    constructor() {
        this.midiData = null;
        this.isPlaying = false;
        this.audioCtx = null;
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
        const notes = Object.keys(this.mapping);

        for (const note of notes) {
            const file = this.mapping[note].file[0];
            const res = await fetch(`./sounds/standard/${file}`);
            const buf = await res.arrayBuffer(); //load wav
            this.buffers[note] = await this.audioCtx.decodeAudioData(buf);
        }
        console.log("prepareAudio ok");
    }

    play() {
        const start = this.audioCtx.currentTime;
        this.midiData.tracks.forEach((track) => {
            track.notes.forEach((note) => {
                const midiNum = note.midi;
                const entry = this.mapping[midiNum];
                if (!entry) return; // 無對應樣本略過

                const buf = this.buffers[midiNum];
                if (!buf) return;

                const src = this.audioCtx.createBufferSource();
                src.buffer = buf;

                const gain = this.audioCtx.createGain();
                gain.gain.value = note.velocity || 1.0;

                src.connect(gain).connect(this.audioCtx.destination);
                src.start(start + note.time);
            });
        });

        this.isPlaying = true;
        console.log("play ok");
    }
}
