class MixerController {
    constructor(audioEngine = null) {
        this.audioEngine = audioEngine;
        this.mixerState = null;
        this.init();
    }

    init() {
        this.container = document.getElementById('mixerStrips');
        // Show mixer immediately with default values
        this.renderMasterFaders();
    }

    updateState(state) {
        this.mixerState = state;
        this.updateControlStates();
    }

    renderMasterFaders() {
        // Always render mixer controls - they're independent of song loading
        this.container.innerHTML = '';

        // Create 3 master faders: PA, IEM, Mic
        const buses = [
            { id: 'PA', label: 'PA (Main)', description: 'Music + Mic to audience' },
            { id: 'IEM', label: 'IEM (Monitors)', description: 'Vocals only (mono)' },
            { id: 'mic', label: 'Mic Input', description: 'Microphone gain' }
        ];

        buses.forEach(bus => {
            const strip = this.createMasterFader(bus);
            this.container.appendChild(strip);
        });
    }

    createMasterFader(bus) {
        const strip = document.createElement('div');
        strip.className = 'mixer-strip master-fader';
        strip.dataset.bus = bus.id;

        const gain = this.mixerState?.[bus.id]?.gain || 0;
        const muted = this.mixerState?.[bus.id]?.muted || false;

        strip.innerHTML = `
            <div class="fader-label">
                <div class="fader-name">${bus.label}</div>
                <div class="fader-description">${bus.description}</div>
            </div>

            <div class="gain-control">
                <input type="range"
                       class="gain-slider"
                       min="-60"
                       max="12"
                       step="0.5"
                       value="${gain}"
                       data-bus="${bus.id}">
                <div class="gain-value">${gain.toFixed(1)} dB</div>
            </div>

            <button class="mute-btn ${muted ? 'active' : ''}"
                    data-bus="${bus.id}">
                MUTE
            </button>
        `;

        this.setupFaderEventListeners(strip);
        return strip;
    }

    setupFaderEventListeners(strip) {
        const bus = strip.dataset.bus;

        const gainSlider = strip.querySelector('.gain-slider');
        const gainValue = strip.querySelector('.gain-value');

        gainSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            gainValue.textContent = `${value.toFixed(1)} dB`;
        });

        gainSlider.addEventListener('change', (e) => {
            const value = parseFloat(e.target.value);
            if (this.audioEngine) {
                this.audioEngine.setMasterGain(bus, value);
            }
        });

        const muteButton = strip.querySelector('.mute-btn');
        muteButton.addEventListener('click', () => {
            if (this.audioEngine) {
                this.audioEngine.toggleMasterMute(bus);
                // Update UI immediately after toggling
                this.updateControlStates();
            }
        });

        gainSlider.addEventListener('dblclick', () => {
            gainSlider.value = 0;
            gainValue.textContent = '0.0 dB';
            if (this.audioEngine) {
                this.audioEngine.setMasterGain(bus, 0);
            }
        });
    }

    updateControlStates() {
        // Get fresh state from audioEngine
        if (this.audioEngine) {
            this.mixerState = this.audioEngine.getMixerState();
        }

        if (!this.mixerState) return;

        ['PA', 'IEM', 'mic'].forEach(busId => {
            const strip = this.container.querySelector(`[data-bus="${busId}"]`);
            if (!strip || !this.mixerState[busId]) return;

            const gainSlider = strip.querySelector('.gain-slider');
            const gainValue = strip.querySelector('.gain-value');
            const gain = this.mixerState[busId].gain || 0;

            if (gainSlider && Math.abs(parseFloat(gainSlider.value) - gain) > 0.1) {
                gainSlider.value = gain;
                gainValue.textContent = `${gain.toFixed(1)} dB`;
            }

            const muteBtn = strip.querySelector('.mute-btn');
            if (muteBtn) {
                const muted = this.mixerState[busId].muted || false;
                muteBtn.classList.toggle('active', muted);
                console.log(`🔘 Updated ${busId} mute button: muted=${muted}, has active class=${muteBtn.classList.contains('active')}`);
            }
        });
    }

    updateFromAudioEngine() {
        if (!this.audioEngine) return;

        const mixerState = this.audioEngine.getMixerState();
        if (mixerState) {
            this.mixerState = mixerState;
            this.renderMasterFaders();
            this.updateControlStates();
        }
    }

    resetMixer() {
        if (this.audioEngine) {
            ['PA', 'IEM', 'mic'].forEach(bus => {
                this.audioEngine.setMasterGain(bus, 0);
                if (this.mixerState[bus]?.muted) {
                    this.audioEngine.toggleMasterMute(bus);
                }
            });
        }
    }
}